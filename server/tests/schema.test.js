import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DisputeAnalysisSchema, safeValidateDisputeAnalysis } from '../src/ai/schema.js';

describe('AI Output Schema Validation Tests', () => {
  test('validates compliant AI analysis object', () => {
    const validData = {
      reason_classification: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      buyer_claim_summary: 'Buyer claims item was not received.',
      claim_credibility_signals: ['Contradicted by delivery scan'],
      evidence_matches: [
        {
          claim_point: 'Never received package',
          evidence_ref: 'Shipment BD-88492019 delivered Monday 2:00 PM',
          strength: 'strong'
        }
      ],
      contradictions_found: ['Buyer claimed non-receipt but WhatsApp chat confirmed receipt.'],
      missing_evidence: [],
      case_strength_score: 95,
      recommendation: 'FIGHT',
      recommendation_reasoning: 'Verified courier delivery and buyer written confirmation.',
      economics: {
        disputed_amount: 5000,
        estimated_seller_time_cost: 350,
        net_expected_value: 4400,
        verdict: 'Net expected value positive'
      },
      response_letter: 'Dear PayPal, records confirm delivery...',
      evidence_checklist: [
        {
          item: 'BlueDart Tracking Number BD-88492019',
          included: true,
          paypal_evidence_type: 'PROOF_OF_FULFILLMENT'
        }
      ],
      risk_flags: []
    };

    const res = safeValidateDisputeAnalysis(validData);
    assert.equal(res.success, true);
  });

  test('rejects object with invalid recommendation enum or score out of bounds', () => {
    const invalidData = {
      reason_classification: 'OTHER',
      buyer_claim_summary: 'Test',
      claim_credibility_signals: [],
      evidence_matches: [],
      contradictions_found: [],
      missing_evidence: [],
      case_strength_score: 150, // out of bounds 0-100
      recommendation: 'SURRENDER', // invalid enum
      recommendation_reasoning: 'Test',
      economics: {
        disputed_amount: 10,
        estimated_seller_time_cost: 4,
        net_expected_value: 6,
        verdict: 'OK'
      },
      response_letter: 'Letter',
      evidence_checklist: [],
      risk_flags: []
    };

    const res = safeValidateDisputeAnalysis(invalidData);
    assert.equal(res.success, false);
    assert.ok(res.error.issues.some(i => i.path.includes('case_strength_score')));
    assert.ok(res.error.issues.some(i => i.path.includes('recommendation')));
  });
});

