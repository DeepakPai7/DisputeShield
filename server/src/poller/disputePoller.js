import { db, recordAuditLog } from '../db/database.js';
import { logger } from '../utils/logger.js';
import { callMcpTool } from '../paypal/mcpClient.js';
import { restClient } from '../paypal/restClient.js';
import { runDisputeAgent } from '../ai/agent.js';
import { generateEvidencePacketPDF } from '../pdf/packetGenerator.js';
import { collectEvidencePacket } from '../evidence/evidenceCollector.js';

let pollIntervalHandle = null;
let isPollingActive = false;

export async function pollDisputes() {
  if (isPollingActive) return;
  isPollingActive = true;

  try {
    logger.info('[POLLER] Polling PayPal Sandbox for disputes awaiting seller response...');
    let disputeItems = [];

    // Attempt retrieval via PayPal MCP tool first
    try {
      const mcpRes = await callMcpTool('list_disputes', { dispute_state: 'REQUIRED_ACTION' });
      if (mcpRes.data && Array.isArray(mcpRes.data.items)) {
        disputeItems = mcpRes.data.items;
      }
    } catch (mcpErr) {
      logger.warn('[POLLER] MCP list_disputes call failed. Falling back to direct REST client...', { message: mcpErr.message });
      const restRes = await restClient.listDisputes({ dispute_state: 'REQUIRED_ACTION' });
      disputeItems = restRes.items || [];
    }

    logger.info(`[POLLER] Discovered ${disputeItems.length} active dispute(s) on PayPal Sandbox.`);

    for (const item of disputeItems) {
      const paypalId = item.dispute_id;
      const existing = db.prepare('SELECT * FROM disputes WHERE paypal_dispute_id = ?').get(paypalId);

      if (!existing) {
        logger.info(`[POLLER] Ingesting NEW PayPal Sandbox dispute: ${paypalId} (${item.reason})`);

        // Get full dispute detail
        let detail = null;
        try {
          const detailMcp = await callMcpTool('get_dispute', { dispute_id: paypalId });
          detail = detailMcp.data || item;
        } catch (e) {
          try {
            detail = await restClient.getDispute(paypalId);
          } catch (restErr) {
            detail = item;
          }
        }

        const buyerMsg = detail.messages?.find(m => m.posted_by === 'BUYER')?.content || detail.buyer_message || 'Dispute opened by buyer on PayPal.';
        const amount = parseFloat(detail.dispute_amount?.value || '0');
        const currency = detail.dispute_amount?.currency_code || 'USD';
        const dueDate = detail.seller_response_due_date || new Date(Date.now() + (10 * 86400000)).toISOString();
        const localId = `disp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // Match with local order if available
        let matchedOrderId = null;
        const matchingOrder = db.prepare('SELECT id FROM orders ORDER BY order_date DESC LIMIT 1').get();
        if (matchingOrder) {
          matchedOrderId = matchingOrder.id;
        }

        db.prepare(`
          INSERT INTO disputes (id, paypal_dispute_id, order_id, source, status, reason, dispute_amount, dispute_currency, buyer_message, due_date, raw_json, created_at, updated_at)
          VALUES (?, ?, ?, 'paypal_sandbox', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          localId,
          paypalId,
          matchedOrderId,
          detail.status || 'WAITING_FOR_SELLER_RESPONSE',
          detail.reason || 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
          amount,
          currency,
          buyerMsg,
          dueDate,
          JSON.stringify(detail),
          detail.create_time || new Date().toISOString(),
          new Date().toISOString()
        );

        recordAuditLog({
          disputeId: localId,
          actor: 'Dispute Poller',
          action: 'New PayPal Sandbox Dispute Ingested',
          details: { paypal_dispute_id: paypalId, amount: `${amount} ${currency}`, reason: detail.reason }
        });

        const newRecord = db.prepare('SELECT * FROM disputes WHERE id = ?').get(localId);

        // Run Dispute Agent
        try {
          const agentRes = await runDisputeAgent(newRecord);
          // Check auto-submit
          await checkAndExecuteAutoSubmit(newRecord, agentRes.analysis);
        } catch (agentErr) {
          logger.error(`[POLLER] Initial agent evaluation failed for ${paypalId}:`, { message: agentErr.message });
        }
      } else {
        // Update status if changed on PayPal
        if (existing.status !== item.status) {
          logger.info(`[POLLER] Updating dispute status for ${paypalId}: ${existing.status} -> ${item.status}`);
          db.prepare('UPDATE disputes SET status = ?, updated_at = ? WHERE id = ?').run(
            item.status,
            new Date().toISOString(),
            existing.id
          );
        }
      }
    }
  } catch (err) {
    logger.error('[POLLER ERROR] Dispute polling loop failed:', { message: err.message });
  } finally {
    isPollingActive = false;
  }
}

async function checkAndExecuteAutoSubmit(dispute, analysis) {
  try {
    const settingsRows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of settingsRows) settings[r.key] = r.value;

    const autoSubmitEnabled = settings.auto_submit_enabled === 'true';
    if (!autoSubmitEnabled) return;

    const minScore = parseFloat(settings.min_auto_submit_score || '85');
    const tinyThreshold = parseFloat(settings.tiny_dispute_threshold || '5.0');

    const isFight = analysis.recommendation === 'FIGHT';
    const scoreQualifies = analysis.case_strength_score >= minScore;
    const hasNoRisks = !analysis.risk_flags || analysis.risk_flags.length === 0;
    const aboveTiny = dispute.dispute_amount > tinyThreshold;

    if (isFight && scoreQualifies && hasNoRisks && aboveTiny) {
      logger.info(`[AUTO-SUBMIT] Auto-submitting defense for ${dispute.paypal_dispute_id} (Score: ${analysis.case_strength_score})...`);

      const evidencePacket = await collectEvidencePacket(dispute.id, dispute.order_id);
      const pdfBuffer = await generateEvidencePacketPDF({
        dispute,
        evidencePacket,
        analysis,
        letterText: analysis.response_letter
      });

      const submissionRes = await restClient.provideEvidence(dispute.paypal_dispute_id, {
        evidences: analysis.evidence_checklist.map(c => ({
          evidence_type: c.paypal_evidence_type,
          notes: c.item
        })),
        notes: analysis.response_letter,
        fileBuffer: pdfBuffer,
        fileName: `DisputeResponse_${dispute.paypal_dispute_id}.pdf`
      });

      // Re-fetch updated dispute from PayPal
      const updatedPayPalDispute = await restClient.getDispute(dispute.paypal_dispute_id);
      const newStatus = updatedPayPalDispute.status || 'UNDER_REVIEW';

      db.prepare('UPDATE disputes SET status = ?, updated_at = ? WHERE id = ?').run(
        newStatus,
        new Date().toISOString(),
        dispute.id
      );

      db.prepare(`
        INSERT INTO submissions (id, dispute_id, action_type, payload_json, paypal_response_json, submitted_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `SUB-${Date.now()}`,
        dispute.id,
        'PROVIDE_EVIDENCE',
        JSON.stringify({ letterText: analysis.response_letter, score: analysis.case_strength_score }),
        JSON.stringify(submissionRes),
        'Auto-submitted by AI',
        new Date().toISOString()
      );

      recordAuditLog({
        disputeId: dispute.id,
        actor: 'Auto-submitted by AI',
        action: 'Evidence Auto-Submitted to PayPal',
        details: { score: analysis.case_strength_score, status: newStatus }
      });

      logger.info(`[AUTO-SUBMIT] Evidence successfully auto-submitted for ${dispute.paypal_dispute_id}. Status: ${newStatus}`);
    }
  } catch (err) {
    logger.error('[AUTO-SUBMIT FAILED]:', { message: err.message });
  }
}

export function startDisputePoller() {
  if (pollIntervalHandle) clearInterval(pollIntervalHandle);

  const settingRow = db.prepare("SELECT value FROM settings WHERE key = 'polling_interval_seconds'").get();
  const seconds = parseInt(settingRow?.value || '60', 10);

  logger.info(`Starting real PayPal sandbox dispute poller (Interval: ${seconds}s)...`);
  pollDisputes();
  pollIntervalHandle = setInterval(pollDisputes, seconds * 1000);
}

export function stopDisputePoller() {
  if (pollIntervalHandle) {
    clearInterval(pollIntervalHandle);
    pollIntervalHandle = null;
    logger.info('Dispute poller stopped.');
  }
}

export default { pollDisputes, startDisputePoller, stopDisputePoller };
