import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { config, FX_INR_USD } from '../config.js';
import { db, recordAuditLog } from '../db/database.js';
import { logger } from '../utils/logger.js';
import { callMcpTool } from '../paypal/mcpClient.js';
import { restClient } from '../paypal/restClient.js';
import { getSelectedGeminiModel } from './modelSelector.js';
import { safeValidateDisputeAnalysis } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Policy Knowledge Base
const rulesPath = path.resolve(__dirname, 'knowledge/paypal_dispute_rules.md');
let rulesContent = '';
try {
  rulesContent = fs.readFileSync(rulesPath, 'utf8');
} catch (e) {
  rulesContent = 'PayPal Dispute Rules Guidance not available.';
}

/**
 * Local Seller Records Tools implementation
 */
export const sellerRecordsTools = {
  get_seller_records: async ({ transaction_id, order_id }) => {
    let order = null;
    if (transaction_id) {
      order = db.prepare('SELECT * FROM orders WHERE paypal_capture_id = ? OR paypal_order_id = ? OR payment_reference = ?').get(transaction_id, transaction_id, transaction_id);
    }
    if (!order && order_id) {
      order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
    }
    if (!order) {
      // Find latest order if none specified
      order = db.prepare('SELECT * FROM orders ORDER BY order_date DESC LIMIT 1').get();
    }
    if (!order) return { error: 'No matching merchant order record found' };

    let items = [];
    try { items = JSON.parse(order.items_json); } catch (e) {}
    let shippingAddress = {};
    try { shippingAddress = JSON.parse(order.shipping_address_json); } catch (e) {}

    return {
      order_id: order.id,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      items,
      total_amount: order.total_amount,
      currency: order.currency,
      shipping_address: shippingAddress,
      order_date: order.order_date,
      payment_date: order.payment_date,
      payment_reference: order.payment_reference
    };
  },

  get_courier_events: async ({ tracking_number, order_id }) => {
    let shipment = null;
    if (tracking_number) {
      shipment = db.prepare('SELECT * FROM shipments WHERE tracking_number = ?').get(tracking_number);
    } else if (order_id) {
      shipment = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(order_id);
    } else {
      shipment = db.prepare('SELECT * FROM shipments ORDER BY rowid DESC LIMIT 1').get();
    }
    if (!shipment) return { error: 'No courier shipment tracking on record' };

    const events = db.prepare('SELECT * FROM shipment_events WHERE shipment_id = ? ORDER BY event_time ASC').all(shipment.id);

    return {
      carrier: shipment.carrier,
      tracking_number: shipment.tracking_number,
      status: shipment.status,
      shipped_at: shipment.shipped_at,
      delivered_at: shipment.delivered_at,
      recipient_signature: shipment.recipient_signature,
      delivery_otp: shipment.delivery_otp,
      otp_verified: Boolean(shipment.otp_verified),
      unique_delivery_id: shipment.unique_delivery_id,
      verified_at: shipment.verified_at,
      events: events.map(e => ({
        timestamp: e.event_time,
        location: e.location,
        description: e.description,
        status: e.status_code
      }))
    };
  },

  get_chat_history: async ({ order_id }) => {
    let rows = [];
    if (order_id) {
      rows = db.prepare('SELECT * FROM chat_messages WHERE order_id = ? ORDER BY sent_at ASC').all(order_id);
    } else {
      rows = db.prepare('SELECT * FROM chat_messages ORDER BY sent_at DESC LIMIT 10').all();
    }
    return {
      messages: rows.map(r => ({
        channel: r.channel,
        sender: r.sender,
        sender_role: r.sender_role || 'buyer',
        text: r.message_text,
        timestamp: r.sent_at
      }))
    };
  },

  get_delivery_logs: async ({ order_id }) => {
    let files = [];
    let logs = [];
    if (order_id) {
      files = db.prepare('SELECT * FROM delivery_files WHERE order_id = ?').all(order_id);
      logs = db.prepare('SELECT * FROM access_logs WHERE order_id = ? ORDER BY logged_at ASC').all(order_id);
    } else {
      files = db.prepare('SELECT * FROM delivery_files LIMIT 5').all();
      logs = db.prepare('SELECT * FROM access_logs LIMIT 10').all();
    }
    return {
      delivered_files: files.map(f => ({
        name: f.file_name,
        size: f.file_size,
        hash: f.file_hash,
        url: f.delivery_url,
        delivered_at: f.delivered_at
      })),
      access_telemetry: logs.map(l => ({
        ip_address: l.ip_address,
        user_agent: l.user_agent,
        action: l.action,
        timestamp: l.logged_at
      }))
    };
  },

  get_product_listing: async ({ transaction_id, order_id }) => {
    let snapshot = null;
    if (transaction_id) {
      snapshot = db.prepare('SELECT * FROM product_snapshots WHERE paypal_capture_id = ?').get(transaction_id);
    }
    if (!snapshot && order_id) {
      snapshot = db.prepare('SELECT * FROM product_snapshots WHERE order_id = ?').get(order_id);
    }
    if (!snapshot) {
      const order = order_id ? db.prepare('SELECT * FROM orders WHERE id = ? OR paypal_capture_id = ?').get(order_id, order_id) : null;
      if (order) {
        snapshot = db.prepare('SELECT * FROM product_snapshots WHERE order_id = ? OR paypal_capture_id = ?').get(order.id, order.paypal_capture_id);
      }
    }
    if (!snapshot) {
      snapshot = db.prepare('SELECT * FROM product_snapshots ORDER BY rowid DESC LIMIT 1').get();
    }
    if (!snapshot) {
      return { error: 'No product listing snapshot found on record for this transaction.' };
    }

    return {
      snapshot_id: snapshot.id,
      channel3_product_id: snapshot.channel3_product_id,
      title: snapshot.title,
      brand: snapshot.brand,
      description: snapshot.description,
      image_url: snapshot.main_image_url,
      price: snapshot.price,
      currency: snapshot.currency,
      offer_domain: snapshot.offer_domain,
      offer_url: snapshot.offer_url,
      captured_at: snapshot.captured_at,
      evidentiary_note: 'This listing snapshot proves strictly what was advertised and sold to the buyer at the recorded price. It does NOT prove physical delivery.'
    };
  },

  get_policy_guidance: async ({ dispute_reason }) => {
    return {
      dispute_reason,
      seller_protection_rules_summary: rulesContent.slice(0, 3000)
    };
  },

  compute_economics: async ({ amount, currency = 'USD' }) => {
    const amountVal = Number(amount) || 0;
    const amountUSD = currency === 'INR' ? (amountVal * FX_INR_USD) : amountVal;
    return {
      original_amount: amountVal,
      currency,
      amount_usd: Number(amountUSD.toFixed(2)),
      estimated_seller_time_cost_usd: 4.0,
      tiny_threshold_usd: 5.0
    };
  }
};

/**
 * Gemini Function Declarations combining PayPal MCP read-only tools + Seller Records
 */
export function getAgentToolDeclarations() {
  return [
    {
      functionDeclarations: [
        {
          name: 'paypal_get_dispute',
          description: 'Get details for a specific dispute from PayPal Sandbox via MCP',
          parameters: {
            type: 'OBJECT',
            properties: {
              dispute_id: { type: 'STRING', description: 'PayPal dispute ID (e.g. PP-D-12345)' }
            },
            required: ['dispute_id']
          }
        },
        {
          name: 'paypal_list_disputes',
          description: 'List disputes from PayPal Sandbox via MCP',
          parameters: {
            type: 'OBJECT',
            properties: {
              dispute_state: { type: 'STRING', description: 'REQUIRED_ACTION | UNDER_REVIEW | RESOLVED' }
            }
          }
        },
        {
          name: 'paypal_get_order',
          description: 'Retrieves order details from PayPal for a given order ID via MCP',
          parameters: {
            type: 'OBJECT',
            properties: {
              order_id: { type: 'STRING', description: 'PayPal Order ID' }
            },
            required: ['order_id']
          }
        },
        {
          name: 'paypal_list_transactions',
          description: 'List transactions from PayPal Sandbox via MCP',
          parameters: {
            type: 'OBJECT',
            properties: {
              transaction_id: { type: 'STRING', description: 'PayPal Transaction / Capture ID' }
            }
          }
        },
        {
          name: 'get_seller_records',
          description: "Get merchant internal order and customer records from merchant's SQLite database",
          parameters: {
            type: 'OBJECT',
            properties: {
              transaction_id: { type: 'STRING', description: 'PayPal transaction or capture ID' },
              order_id: { type: 'STRING', description: 'Internal merchant order ID' }
            }
          }
        },
        {
          name: 'get_courier_events',
          description: 'Get verifiable courier shipping tracking history, carrier name, delivery status, and recipient signature',
          parameters: {
            type: 'OBJECT',
            properties: {
              tracking_number: { type: 'STRING', description: 'Courier tracking number' },
              order_id: { type: 'STRING', description: 'Internal merchant order ID' }
            }
          }
        },
        {
          name: 'get_chat_history',
          description: 'Get direct customer correspondence (WhatsApp, Email, In-app chat) proving receipt or draft approval',
          parameters: {
            type: 'OBJECT',
            properties: {
              order_id: { type: 'STRING', description: 'Internal merchant order ID' }
            }
          }
        },
        {
          name: 'get_delivery_logs',
          description: 'Get digital asset delivery proofs, authenticated IP download logs, and access telemetry',
          parameters: {
            type: 'OBJECT',
            properties: {
              order_id: { type: 'STRING', description: 'Internal merchant order ID' }
            }
          }
        },
        {
          name: 'get_product_listing',
          description: 'Get the immutable Channel3 product listing snapshot captured at the exact moment of sale (item title, brand, description, price, offer domain, and snapshot ID). Proves what was sold and at what price.',
          parameters: {
            type: 'OBJECT',
            properties: {
              transaction_id: { type: 'STRING', description: 'PayPal capture/transaction ID' },
              order_id: { type: 'STRING', description: 'Internal merchant order ID' }
            }
          }
        },
        {
          name: 'get_policy_guidance',
          description: 'Get PayPal Seller Protection policy guidelines for a specific dispute reason',
          parameters: {
            type: 'OBJECT',
            properties: {
              dispute_reason: { type: 'STRING', description: 'Reason string e.g. MERCHANDISE_OR_SERVICE_NOT_RECEIVED' }
            },
            required: ['dispute_reason']
          }
        },
        {
          name: 'compute_economics',
          description: 'Calculate financial economics and net expected value for the claim',
          parameters: {
            type: 'OBJECT',
            properties: {
              amount: { type: 'NUMBER', description: 'Dispute amount' },
              currency: { type: 'STRING', description: 'USD, INR, EUR, etc.' }
            },
            required: ['amount']
          }
        }
      ]
    }
  ];
}

/**
 * Execute an individual tool requested by Gemini
 */
async function executeAgentTool(name, args, disputeId) {
  const startTime = Date.now();
  try {
    if (name.startsWith('paypal_')) {
      // Map to PayPal MCP tool
      const mcpToolName = name.replace('paypal_', '');
      const res = await callMcpTool(mcpToolName, args, disputeId);
      return {
        toolName: name,
        result: res.data || res.raw,
        durationMs: Date.now() - startTime
      };
    } else if (sellerRecordsTools[name]) {
      const res = await sellerRecordsTools[name](args);
      return {
        toolName: name,
        result: res,
        durationMs: Date.now() - startTime
      };
    } else {
      return {
        toolName: name,
        result: { error: `Tool ${name} is not recognized` },
        durationMs: Date.now() - startTime
      };
    }
  } catch (err) {
    return {
      toolName: name,
      result: { error: err.message },
      durationMs: Date.now() - startTime,
      error: err.message
    };
  }
}

/**
 * Runs the Gemini Function-Calling Dispute Agent for a specific dispute.
 */
export async function runDisputeAgent(disputeRecord, customInstruction = null) {
  logger.info(`[DISPUTE AGENT] Initiating autonomous legal analysis for dispute ${disputeRecord.paypal_dispute_id}...`);

  if (!config.geminiApiKey || config.isSetupRequired) {
    const errorMsg = 'Gemini API Key is missing or unconfigured. Cannot perform AI legal evaluation.';
    logger.error(errorMsg);
    recordFailedAnalysis(disputeRecord.id, errorMsg, 'unconfigured');
    throw new Error(errorMsg);
  }

  const modelId = await getSelectedGeminiModel();
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const agentTrace = [];
  const systemPrompt = `You are DisputeShield AI, an autonomous dispute defense counsel for PayPal merchants.

YOUR MANDATE:
Analyze the dispute by actively calling tools to investigate PayPal records and merchant records. Then return a formal, verifiable defense analysis strictly in JSON adhering to the specified schema.

CRITICAL RULES:
1. NO FABRICATION: You may ONLY cite facts, tracking numbers, dates, timestamps, IP addresses, names, quotes, and files that are returned by your tool calls. Reference evidence items by explicit IDs (e.g. [TRACKING-1], [CHAT-1], [IP-LOG-1]).
2. PRODUCT LISTING SNAPSHOT RULES:
   - Call tool "get_product_listing" to retrieve the Channel3 product listing snapshot captured at the time of purchase.
   - For "not as described" claims, compare the buyer's complaint with the listing snapshot (title, brand, description, photo, price).
   - For every claim type, the listing snapshot proves only WHAT WAS SOLD AND AT WHAT PRICE. It does NOT prove delivery; never present it as proof of physical delivery.
   - You may cite it only by its snapshot ID (e.g. [SNAPSHOT-ID]). Never invent product details.
   - In the response letter, mention the listing facts when relevant: "The item was listed as [title] by [brand] at $[price] and purchased on [date]".
3. TONE: Professional, neutral, and factual. Never accuse the buyer of fraud or lying. Use objective phrasing: "Carrier records confirm...", "Customer correspondence on [Date] indicates...".
4. POLICY HONESTY: If evidence is missing, unconfirmed, or supports the buyer, state so honestly in missing_evidence and lower the score.
5. RESPONSE FORMAT: Your final response MUST be a valid JSON object matching this structure:
{
  "reason_classification": "string",
  "buyer_claim_summary": "string",
  "evidence_matches": [{"claim_point":"string","evidence_ref":"string","strength":"strong|moderate|weak"}],
  "contradictions": ["string"],
  "missing_evidence": ["string"],
  "case_strength_score": 0,
  "recommendation": "FIGHT" | "REFUND" | "NEEDS_MORE_INFO",
  "recommendation_reasoning": "string",
  "response_letter": "string (under 350 words citing evidence IDs)",
  "evidence_checklist": [{"item":"string","included":true,"paypal_evidence_type":"PROOF_OF_FULFILLMENT|PROOF_OF_DELIVERY_SIGNATURE|RECEIPT_OF_MERCHANDISE|OTHER"}],
  "risk_flags": ["string"]
}`;

  const userInitialPrompt = `Please investigate and analyze PayPal Sandbox dispute ${disputeRecord.paypal_dispute_id}:
- Dispute Amount: ${disputeRecord.dispute_amount} ${disputeRecord.dispute_currency}
- Reason: ${disputeRecord.reason}
- Buyer Complaint: "${disputeRecord.buyer_message}"
- Order Reference: ${disputeRecord.order_id || 'Investigate via tools'}

${customInstruction ? `SPECIAL USER INSTRUCTION: "${customInstruction}"` : ''}

Use your tools to query PayPal dispute details, seller order records, courier tracking, and customer communications before synthesizing your final analysis.`;

  const contents = [
    { role: 'user', parts: [{ text: userInitialPrompt }] }
  ];

  let rawAnalysisJson = null;
  const maxIterations = 8;
  let iteration = 0;

  try {
    while (iteration < maxIterations) {
      iteration++;
      logger.info(`[AGENT LOOP] Iteration ${iteration} for ${disputeRecord.paypal_dispute_id}...`);

      const response = await ai.models.generateContent({
        model: modelId,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
          tools: getAgentToolDeclarations()
        }
      });

      // Check if model called functions
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        logger.info(`[AGENT LOOP] Model invoked ${functionCalls.length} tool(s):`, functionCalls.map(f => f.name));

        const functionResponseParts = [];
        for (const call of functionCalls) {
          const toolExec = await executeAgentTool(call.name, call.args || {}, disputeRecord.id);

          agentTrace.push({
            iteration,
            tool: call.name,
            args: call.args,
            resultSummary: typeof toolExec.result === 'object' ? Object.keys(toolExec.result || {}) : String(toolExec.result).slice(0, 100),
            durationMs: toolExec.durationMs,
            error: toolExec.error || null
          });

          const responsePayload = (toolExec.result && typeof toolExec.result === 'object')
            ? toolExec.result
            : { output: toolExec.result };

          functionResponseParts.push({
            functionResponse: {
              name: call.name,
              ...(call.id ? { id: call.id } : {}),
              response: responsePayload
            }
          });
        }

        // CRITICAL FIX: Retain candidate content directly from Gemini to preserve thoughtSignature and thoughts!
        const candidateContent = response.candidates?.[0]?.content;
        if (candidateContent) {
          contents.push(candidateContent);
        } else {
          contents.push({ role: 'model', parts: functionCalls.map(call => ({ functionCall: call })) });
        }
        contents.push({ role: 'user', parts: functionResponseParts });
      } else {
        // Model returned final text output
        const text = response.text;
        logger.info(`[AGENT LOOP] Model generated final text output (${text?.length || 0} chars)`);

        try {
          // Parse JSON from text
          const cleanedText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
          rawAnalysisJson = JSON.parse(cleanedText);
        } catch (jsonErr) {
          logger.warn('[AGENT LOOP] Final response text was not valid JSON. Requesting JSON formatting...', { text: text?.slice(0, 200) });
          const candidateContent = response.candidates?.[0]?.content;
          if (candidateContent) {
            contents.push(candidateContent);
          } else {
            contents.push({ role: 'model', parts: [{ text }] });
          }
          contents.push({ role: 'user', parts: [{ text: 'Please format your complete final analysis strictly as a raw JSON object.' }] });
        }

        if (rawAnalysisJson) {
          break;
        }
      }
    }

    if (!rawAnalysisJson) {
      throw new Error(`Dispute agent exceeded maximum ${maxIterations} iterations without producing valid JSON analysis.`);
    }

    // Validate with Zod
    let validated = safeValidateDisputeAnalysis(rawAnalysisJson);
    if (!validated.success) {
      logger.warn('[AGENT LOOP] Zod validation failed on initial output. Prompting Gemini for correction...', { issues: validated.error.issues });
      const retryResponse = await ai.models.generateContent({
        model: modelId,
        contents: [
          ...contents,
          { role: 'user', parts: [{ text: `Your JSON analysis had schema validation issues: ${JSON.stringify(validated.error.issues)}. Please return the corrected JSON object strictly.` }] }
        ],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      });
      const retryText = retryResponse.text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const retryJson = JSON.parse(retryText);
      validated = safeValidateDisputeAnalysis(retryJson);
      if (!validated.success) {
        throw new Error(`Zod schema validation failed after retry: ${validated.error.message}`);
      }
      rawAnalysisJson = validated.data;
    } else {
      rawAnalysisJson = validated.data;
    }

    // --- DETERMINISTIC POLICY ENGINE (Post-AI) ---
    const policyResult = applyDeterministicPolicyEngine(rawAnalysisJson, disputeRecord);

    // Save to Database
    const analysisId = `ANALYSIS-${Date.now()}`;
    const existingVersionRow = db.prepare('SELECT MAX(version) as max_v FROM analyses WHERE dispute_id = ?').get(disputeRecord.id);
    const nextVersion = (existingVersionRow?.max_v || 0) + 1;

    db.prepare(`
      INSERT INTO analyses (id, dispute_id, version, status, json, model, case_strength_score, recommendation, agent_trace_json, rule_overrides_json, created_at)
      VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      analysisId,
      disputeRecord.id,
      nextVersion,
      JSON.stringify(policyResult.analysis),
      modelId,
      policyResult.analysis.case_strength_score,
      policyResult.analysis.recommendation,
      JSON.stringify(agentTrace),
      JSON.stringify(policyResult.ruleOverrides),
      new Date().toISOString()
    );

    // Save active letter
    const letterId = `LETTER-${Date.now()}`;
    db.prepare('UPDATE letters SET is_active = 0 WHERE dispute_id = ?').run(disputeRecord.id);
    db.prepare(`
      INSERT INTO letters (id, dispute_id, version, letter_text, instruction, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(
      letterId,
      disputeRecord.id,
      nextVersion,
      policyResult.analysis.response_letter,
      customInstruction || 'Autonomous Gemini Agent Defense',
      new Date().toISOString()
    );

    // Audit log
    recordAuditLog({
      disputeId: disputeRecord.id,
      actor: `Dispute Agent (${modelId})`,
      action: customInstruction ? 'Letter Regenerated by Agent' : 'Dispute Analyzed by Agent',
      details: {
        score: policyResult.analysis.case_strength_score,
        recommendation: policyResult.analysis.recommendation,
        iterations: iteration,
        toolCallsCount: agentTrace.length,
        ruleOverrides: policyResult.ruleOverrides
      }
    });

    logger.info(`[DISPUTE AGENT] Analysis v${nextVersion} completed successfully for ${disputeRecord.paypal_dispute_id} (Score: ${policyResult.analysis.case_strength_score}, Recommendation: ${policyResult.analysis.recommendation}).`);

    return {
      success: true,
      analysis: policyResult.analysis,
      version: nextVersion,
      model: modelId,
      agentTrace,
      ruleOverrides: policyResult.ruleOverrides,
      letterId,
      letter: {
        letter_id: letterId,
        version: nextVersion,
        letter_text: policyResult.analysis.response_letter
      }
    };
  } catch (err) {
    logger.error(`[DISPUTE AGENT ERROR] Failed for ${disputeRecord.paypal_dispute_id}:`, { message: err.message });
    recordFailedAnalysis(disputeRecord.id, err.message, modelId, agentTrace);
    throw err;
  }
}

/**
 * Deterministic Policy Engine (Post-AI)
 * (a) Micro-claim rule: if amount in USD is below tiny threshold ($5) and score < 80, force REFUND
 * (b) Unconfirmed delivery rule: if delivery is unconfirmed and no buyer chat/access log, cap score at 40 and forbid FIGHT
 */
function applyDeterministicPolicyEngine(analysis, dispute) {
  const ruleOverrides = [];
  const amountVal = Number(dispute.dispute_amount) || 0;
  const currency = dispute.dispute_currency || 'USD';
  const amountUSD = currency === 'INR' ? (amountVal * FX_INR_USD) : amountVal;

  let score = Number(analysis.case_strength_score) || 0;
  let recommendation = analysis.recommendation;

  // Load settings
  const settingsRows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of settingsRows) settings[r.key] = r.value;

  const tinyThresholdUSD = parseFloat(settings.tiny_dispute_threshold || '5.0');
  const sellerTimeCostUSD = parseFloat(settings.seller_time_cost || '4.0');

  // Rule A: Micro-claim economics check
  if (amountUSD <= tinyThresholdUSD && score < 80) {
    if (recommendation !== 'REFUND') {
      ruleOverrides.push(`Policy engine adjusted verdict: Disputed amount ($${amountUSD.toFixed(2)} USD) is below tiny threshold ($${tinyThresholdUSD.toFixed(2)}) with score <80%; forcing REFUND to avoid wasteful merchant time cost.`);
      recommendation = 'REFUND';
    }
  }

  // Rule B: Unconfirmed delivery check
  const isINRReason = dispute.reason === 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED';
  const missingSigOrScan = (analysis.missing_evidence || []).some(m => /courier|tracking|delivered|signature/i.test(m));
  const hasNoBuyerAcknowledgment = !(analysis.evidence_matches || []).some(em => /chat|email|communication|acknowledged/i.test(em.evidence_ref || ''));

  if (isINRReason && missingSigOrScan && hasNoBuyerAcknowledgment) {
    if (score > 40) {
      ruleOverrides.push(`Policy engine adjusted verdict: Courier delivery unconfirmed without customer acknowledgment; capping case strength score at 40% and changing recommendation from ${recommendation} to NEEDS_MORE_INFO.`);
      score = 40;
      if (recommendation === 'FIGHT') {
        recommendation = 'NEEDS_MORE_INFO';
      }
    }
  }

  // Economics Math
  const expectedWinValueUSD = (score / 100) * amountUSD;
  const netExpectedValueUSD = expectedWinValueUSD - sellerTimeCostUSD;

  const sym = currency === 'INR' ? '₹' : (currency === 'EUR' ? '€' : '$');
  const verdict = netExpectedValueUSD >= 0
    ? `Net expected value is positive (+${sym}${currency === 'INR' ? (netExpectedValueUSD / FX_INR_USD).toFixed(2) : netExpectedValueUSD.toFixed(2)}). Recovery probability justifies defense.`
    : `Net expected value is negative (${sym}${currency === 'INR' ? (netExpectedValueUSD / FX_INR_USD).toFixed(2) : netExpectedValueUSD.toFixed(2)}). Merchant defense time cost exceeds expected recovery.`;

  analysis.case_strength_score = score;
  analysis.recommendation = recommendation;
  analysis.rule_overrides = ruleOverrides;
  analysis.economics = {
    disputed_amount: amountVal,
    estimated_seller_time_cost: sellerTimeCostUSD,
    net_expected_value: Number(netExpectedValueUSD.toFixed(2)),
    verdict
  };

  return { analysis, ruleOverrides };
}

function recordFailedAnalysis(disputeId, errorMessage, modelId, trace = []) {
  try {
    const existing = db.prepare('SELECT MAX(version) as max_v FROM analyses WHERE dispute_id = ?').get(disputeId);
    const version = (existing?.max_v || 0) + 1;
    db.prepare(`
      INSERT INTO analyses (id, dispute_id, version, status, json, model, case_strength_score, recommendation, agent_trace_json, error_message, created_at)
      VALUES (?, ?, ?, 'failed', '{}', ?, 0, 'NEEDS_MORE_INFO', ?, ?, ?)
    `).run(
      `ANALYSIS-FAIL-${Date.now()}`,
      disputeId,
      version,
      modelId || 'gemini-3.8-flash',
      JSON.stringify(trace),
      errorMessage,
      new Date().toISOString()
    );
  } catch (e) {}
}

export default { runDisputeAgent, getAgentToolDeclarations };

