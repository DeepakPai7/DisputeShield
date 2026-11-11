import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, db, recordAuditLog } from '../src/db/database.js';
import { runDiagnostics } from '../src/services/diagnosticsService.js';
import { generateEvidencePacketPDF } from '../src/pdf/packetGenerator.js';
import { closeMcpClient } from '../src/paypal/mcpClient.js';
import { config } from '../src/config.js';

describe('DisputeShield End-to-End Refactor Verification', () => {
  before(() => {
    initDatabase();
  });

  after(async () => {
    await closeMcpClient();
  });

  test('cryptographic SHA-256 hash chaining links audit rows immutably', () => {
    const row1 = recordAuditLog({
      disputeId: 'test-disp-1',
      actor: 'Test Merchant',
      action: 'ORDER_FULFILLED',
      details: { item: 'Technical Jacket', tracking: 'FX-12345' }
    });

    const row2 = recordAuditLog({
      disputeId: 'test-disp-1',
      actor: 'Gemini Agent',
      action: 'EVIDENCE_ANALYZED',
      details: { score: 92, recommendation: 'FIGHT_DISPUTE' }
    });

    assert.ok(row1.hash);
    assert.ok(row2.hash);
    assert.equal(row2.previous_hash, row1.hash, 'Row 2 previous_hash must match Row 1 hash');
  });

  test('generates valid evidence packet PDF with formal exhibit headers', async () => {
    const mockDispute = {
      id: 'disp-pdf-test',
      paypal_dispute_id: 'PP-D-TEST-9988',
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      dispute_amount: 60.00,
      dispute_currency: 'USD',
      due_date: new Date(Date.now() + 86400000 * 5).toISOString(),
      buyer_message: 'Buyer claimed they never received package.'
    };

    const mockEvidencePacket = {
      order: {
        id: 'ord-123',
        customer_name: 'Alex Johnson',
        customer_email: 'alex@example.com',
        total_amount: 60.00,
        currency: 'USD',
        items: [{ name: 'Alpine Technical Jacket', quantity: 1, unit_price: 60.00 }]
      },
      shipping: {
        carrier: 'FedEx Express',
        tracking_number: 'FX-99882211',
        status: 'DELIVERED',
        recipient_signature: 'A. Johnson',
        events: [{ description: 'Delivered to front door', location: 'Seattle, WA', event_time: new Date().toISOString() }]
      },
      chatExcerpts: [{ sender: 'Customer', message_text: 'Jacket fits great, thanks!', sent_at: new Date().toISOString() }],
      deliveryFiles: [],
      accessLogs: []
    };

    const mockAnalysis = {
      case_strength_score: 95,
      recommendation: 'FIGHT_DISPUTE',
      recommendation_reasoning: 'Carrier proof of delivery and customer chat confirmation.',
      contradictions_found: ['Customer confirmed jacket fits great, yet claimed non-receipt.'],
      evidence_matches: [{ claim_point: 'Non receipt', evidence_ref: 'FedEx Delivered', strength: 'strong' }],
      evidence_checklist: [{ item: 'FedEx Proof of Delivery', included: true, paypal_evidence_type: 'PROOF_OF_FULFILLMENT' }]
    };

    const pdfBuffer = await generateEvidencePacketPDF({
      dispute: mockDispute,
      evidencePacket: mockEvidencePacket,
      analysis: mockAnalysis,
      letterText: 'Formal Seller Rebuttal Letter citing FedEx delivery records.'
    });

    assert.ok(pdfBuffer);
    assert.ok(pdfBuffer.length > 1000, 'PDF buffer must contain binary PDF content');
    assert.equal(pdfBuffer.slice(0, 4).toString(), '%PDF', 'PDF buffer must start with %PDF magic header');
  });

  test('live diagnostics service verifies all operational checkpoints', async () => {
    const diag = await runDiagnostics(false);
    assert.ok(diag);
    assert.ok(diag.environment);
    assert.equal(diag.environment.isSandbox, true);
    assert.equal(diag.database.status, 'ok');
  });
});
