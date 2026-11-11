import { z } from 'zod';

export const EvidenceMatchSchema = z.object({
  claim_point: z.string().describe('The specific assertion made by the buyer'),
  evidence_ref: z.string().describe('Reference ID or document exhibiting proof counter to or validating the claim point'),
  strength: z.enum(['strong', 'moderate', 'weak']).describe('Evaluation of evidence strength')
});

export const ChecklistItemSchema = z.object({
  item: z.string().describe('Description of the required or recommended evidence item'),
  included: z.boolean().describe('Whether this evidence item is present in the evidence packet'),
  paypal_evidence_type: z.string().describe('PayPal API evidence_type constant (e.g. PROOF_OF_FULFILLMENT, PROOF_OF_DELIVERY_SIGNATURE, RECEIPT_OF_MERCHANDISE, OTHER)')
});

export const EconomicsSchema = z.object({
  disputed_amount: z.number().optional(),
  estimated_seller_time_cost: z.number().optional(),
  net_expected_value: z.number().optional(),
  verdict: z.string().optional()
}).optional();

export const DisputeAnalysisSchema = z.object({
  reason_classification: z.string().describe('Standard dispute reason classification'),
  buyer_claim_summary: z.string().describe('Concise summary of the buyer claim'),
  evidence_matches: z.array(EvidenceMatchSchema).describe('Direct linkages between buyer claims and seller evidence'),
  contradictions: z.array(z.string()).optional().default([]).describe('Contradictions found between buyer claims and verifiable records'),
  contradictions_found: z.array(z.string()).optional().default([]),
  missing_evidence: z.array(z.string()).describe('Any critical pieces of evidence missing from the packet'),
  case_strength_score: z.number().min(0).max(100).describe('Case win probability from 0 to 100'),
  recommendation: z.enum(['FIGHT', 'REFUND', 'NEEDS_MORE_INFO']).describe('Strategic recommendation for seller'),
  recommendation_reasoning: z.string().describe('Detailed strategic reasoning justifying the recommendation'),
  response_letter: z.string().describe('Complete, formal response letter ready to submit to PayPal'),
  evidence_checklist: z.array(ChecklistItemSchema).describe('Checklist of standard PayPal required evidence items'),
  risk_flags: z.array(z.string()).describe('Identified risks or vulnerabilities in the case'),
  claim_credibility_signals: z.array(z.string()).optional().default([]),
  economics: EconomicsSchema,
  rule_overrides: z.array(z.string()).optional().default([])
});

export function validateDisputeAnalysis(data) {
  // Normalize contradictions
  if (data && data.contradictions_found && (!data.contradictions || data.contradictions.length === 0)) {
    data.contradictions = data.contradictions_found;
  }
  return DisputeAnalysisSchema.parse(data);
}

export function safeValidateDisputeAnalysis(data) {
  if (data && data.contradictions_found && (!data.contradictions || data.contradictions.length === 0)) {
    data.contradictions = data.contradictions_found;
  }
  return DisputeAnalysisSchema.safeParse(data);
}
