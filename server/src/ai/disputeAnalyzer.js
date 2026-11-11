import { config } from '../config.js';
import { db } from '../db/database.js';
import { logger } from '../utils/logger.js';
import { calculateDisputeEconomics } from '../utils/economics.js';
import { safeValidateDisputeAnalysis } from './schema.js';
import { generateDisputeAnalysisWithGemini } from './geminiClient.js';
import { runFallbackAnalysis } from './fallbackAnalyzer.js';

export async function analyzeDispute(dispute, evidencePacket, customInstruction = null) {
  logger.info(`Analyzing dispute ${dispute.id} (${dispute.paypal_dispute_id})...`);

  // Load seller settings
  const settingsRows = db.prepare('SELECT key, value FROM settings').all();
  const sellerSettings = {};
  for (const row of settingsRows) {
    sellerSettings[row.key] = row.value;
  }

  let analysisData = null;
  let usedModel = 'template-fallback';
  let isFallback = true;

  if (config.isAiOnline) {
    try {
      const geminiResult = await generateDisputeAnalysisWithGemini({
        dispute,
        evidencePacket,
        sellerSettings,
        customInstruction,
        model: config.geminiModel
      });

      if (geminiResult && geminiResult.success && geminiResult.data) {
        const validation = safeValidateDisputeAnalysis(geminiResult.data);
        if (validation.success) {
          analysisData = validation.data;
          usedModel = geminiResult.model;
          isFallback = false;
          logger.info(`Gemini analysis succeeded and validated with Zod for ${dispute.paypal_dispute_id}`);
        } else {
          logger.warn('Gemini output schema validation failed. Falling back to deterministic analyzer.', {
            errors: validation.error.format()
          });
        }
      } else {
        logger.warn('Gemini request failed or returned invalid data. Falling back.', { error: geminiResult?.error });
      }
    } catch (e) {
      logger.error('Unexpected exception calling Gemini. Falling back.', { error: e.message });
    }
  } else {
    logger.info('Gemini API key is unconfigured or placeholder. Using Template fallback mode.');
  }

  // Fallback if needed
  if (!analysisData) {
    analysisData = runFallbackAnalysis(dispute, evidencePacket, sellerSettings, customInstruction);
    usedModel = 'template-fallback';
    isFallback = true;
  }

  // Recalculate economics to guarantee precision and consistency
  const economics = calculateDisputeEconomics({
    disputedAmount: dispute.dispute_amount,
    caseStrengthScore: analysisData.case_strength_score,
    sellerTimeCost: sellerSettings.seller_time_cost || 4.0,
    tinyThreshold: sellerSettings.tiny_dispute_threshold || 5.0,
    currency: dispute.dispute_currency
  });
  analysisData.economics = {
    disputed_amount: economics.disputed_amount,
    estimated_seller_time_cost: economics.estimated_seller_time_cost,
    net_expected_value: economics.net_expected_value,
    verdict: economics.verdict
  };

  // If economics mandates refund, enforce recommendation
  if (economics.should_refund && analysisData.recommendation === 'FIGHT') {
    analysisData.recommendation = 'REFUND';
    analysisData.recommendation_reasoning = `${economics.verdict} (Adjusted by Economics Guardrail)`;
  }

  // Persist to Database
  const analysisId = `ANALYSIS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const existingVersionRow = db.prepare('SELECT MAX(version) as max_v FROM analyses WHERE dispute_id = ?').get(dispute.id);
  const nextVersion = (existingVersionRow?.max_v || 0) + 1;

  db.prepare(`
    INSERT INTO analyses (id, dispute_id, version, json, model, case_strength_score, recommendation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    analysisId,
    dispute.id,
    nextVersion,
    JSON.stringify(analysisData),
    usedModel,
    analysisData.case_strength_score,
    analysisData.recommendation,
    new Date().toISOString()
  );

  // Persist letter
  const letterId = `LETTER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  db.prepare('UPDATE letters SET is_active = 0 WHERE dispute_id = ?').run(dispute.id);
  db.prepare(`
    INSERT INTO letters (id, dispute_id, version, letter_text, instruction, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(
    letterId,
    dispute.id,
    nextVersion,
    analysisData.response_letter,
    customInstruction,
    new Date().toISOString()
  );

  // Audit log
  db.prepare(`
    INSERT INTO audit_log (id, dispute_id, actor, action, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    `AUDIT-${Date.now()}`,
    dispute.id,
    isFallback ? 'AI Engine (Template Fallback)' : `Gemini (${usedModel})`,
    customInstruction ? 'Letter Regenerated' : 'Dispute Analyzed',
    JSON.stringify({
      score: analysisData.case_strength_score,
      recommendation: analysisData.recommendation,
      is_fallback: isFallback,
      instruction: customInstruction
    }),
    new Date().toISOString()
  );

  return {
    analysis: analysisData,
    version: nextVersion,
    model: usedModel,
    is_fallback: isFallback,
    letter_id: letterId
  };
}

export default { analyzeDispute };

