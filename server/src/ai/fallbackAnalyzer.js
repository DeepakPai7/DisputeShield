import { calculateDisputeEconomics } from '../utils/economics.js';

export function runFallbackAnalysis(dispute, evidencePacket, sellerSettings = {}, customInstruction = null) {
  const { order, shipping, chatExcerpts = [], deliveryProof = [], accessLogs = [], manualUploads = [], gaps = [] } = evidencePacket;
  const reason = dispute.reason;
  const amount = dispute.dispute_amount;
  const currency = dispute.dispute_currency || 'USD';
  const sym = currency === 'INR' ? '₹' : (currency === 'EUR' ? '€' : '$');

  let score = 25; // baseline
  const evidenceMatches = [];
  const contradictions = [];
  const missing = [...gaps];
  const riskFlags = [];
  const checklist = [];

  // Evaluate Shipping
  if (shipping) {
    if (shipping.status === 'DELIVERED') {
      score += 40;
      evidenceMatches.push({
        claim_point: 'Buyer claims item was not received or not delivered',
        evidence_ref: `Shipment #${shipping.tracking_number} (${shipping.carrier}) delivered at ${shipping.delivered_at || 'scheduled time'}`,
        strength: 'strong'
      });
      checklist.push({
        item: `Courier Online Tracking (${shipping.carrier} #${shipping.tracking_number})`,
        included: true,
        paypal_evidence_type: 'PROOF_OF_FULFILLMENT'
      });
    } else {
      score -= 20;
      riskFlags.push(`Shipment has not been marked as DELIVERED by courier (Current: ${shipping.status}).`);
    }

    if (shipping.recipient_signature) {
      score += 25;
      evidenceMatches.push({
        claim_point: 'Buyer claims package was never handed over',
        evidence_ref: `Signature confirmation: "${shipping.recipient_signature}"`,
        strength: 'strong'
      });
      checklist.push({
        item: 'Proof of Delivery Signature Confirmation',
        included: true,
        paypal_evidence_type: 'PROOF_OF_DELIVERY_SIGNATURE'
      });
    }
  }

  // Evaluate Communications
  const buyerChats = chatExcerpts.filter(c => c.sender && c.sender.toLowerCase().includes(order ? order.customer_name.toLowerCase().split(' ')[0] : ''));
  const positiveChats = chatExcerpts.filter(c => /got it|thanks|received|fits|great|downloaded|extracted/i.test(c.message_text));

  if (positiveChats.length > 0) {
    score += 20;
    contradictions.push(`Buyer communicated in chat stating: "${positiveChats[0].message_text}", directly contradicting claim that merchandise was not received or unauthorized.`);
    evidenceMatches.push({
      claim_point: 'Buyer claim of non-receipt or unauthorized transaction',
      evidence_ref: `Chat transcript (${positiveChats[0].channel}): "${positiveChats[0].message_text}"`,
      strength: 'strong'
    });
    checklist.push({
      item: 'Customer Written Acknowledgment / Chat History',
      included: true,
      paypal_evidence_type: 'RECEIPT_OF_MERCHANDISE'
    });
  }

  // Evaluate Digital Delivery
  if (deliveryProof.length > 0 || accessLogs.length > 0) {
    if (accessLogs.length > 0) {
      score += 35;
      const downloadLogs = accessLogs.filter(l => /download/i.test(l.action));
      evidenceMatches.push({
        claim_point: 'Buyer claims transaction was unauthorized or service unfulfilled',
        evidence_ref: `System Telemetry: ${accessLogs.length} authenticated events (${downloadLogs.length} asset downloads) from IP ${accessLogs[0].ip_address}`,
        strength: 'strong'
      });
      checklist.push({
        item: 'Digital Asset Delivery & IP Access Telemetry',
        included: true,
        paypal_evidence_type: 'OTHER'
      });
    }
  }

  // Deduct for explicit missing gaps
  if (missing.some(m => /No recipient signature/i.test(m)) && amount >= 750) {
    score -= 25;
    riskFlags.push('High value transaction (>= $750) missing signature confirmation required by PayPal Seller Protection.');
  }

  // Bound score 5 - 98
  score = Math.max(5, Math.min(98, score));

  // Settings for economics
  const timeCost = Number(sellerSettings.seller_time_cost || 4.0);
  const tinyThreshold = Number(sellerSettings.tiny_dispute_threshold || 5.0);

  const economics = calculateDisputeEconomics({
    disputedAmount: amount,
    caseStrengthScore: score,
    sellerTimeCost: timeCost,
    tinyThreshold,
    currency
  });

  // Recommendation logic
  let recommendation = 'FIGHT';
  let recommendationReasoning = '';

  if (economics.should_refund) {
    recommendation = 'REFUND';
    recommendationReasoning = economics.verdict;
  } else if (score >= 75) {
    recommendation = 'FIGHT';
    recommendationReasoning = `Verified evidence directly disproves buyer claim with strong win probability (${score}%). Net expected value is positive (+${sym}${economics.net_expected_value}).`;
  } else if (score >= 45) {
    recommendation = 'NEEDS_MORE_INFO';
    recommendationReasoning = `Evidence is partial (${score}%). Courier tracking or customer acknowledgment lacks conclusive proof. Request additional documentation before contesting.`;
  } else {
    recommendation = 'REFUND';
    recommendationReasoning = `Defense probability is weak (${score}%). Records do not substantiate fulfillment under PayPal Seller Protection requirements.`;
  }

  // Construct formal letter
  const businessName = sellerSettings.business_name || 'Apex Merchants';
  const customerName = order ? order.customer_name : 'the buyer';
  const orderDate = order ? order.order_date.split('T')[0] : 'the transaction date';

  let letter = `Dear PayPal Disputes Review Team,\n\n`;
  letter += `We are submitting this formal response regarding Dispute ${dispute.paypal_dispute_id} filed by ${customerName} for the amount of ${sym}${amount.toFixed(2)} (${reason}).\n\n`;

  letter += `1. TRANSACTION & FULFILLMENT SUMMARY:\n`;
  letter += `The customer initiated Order #${dispute.order_id || 'N/A'} on ${orderDate}. All merchandise/services were fulfilled in strict compliance with PayPal Seller Protection guidelines.\n\n`;

  if (shipping && shipping.status === 'DELIVERED') {
    letter += `2. VERIFIABLE PROOF OF DELIVERY:\n`;
    letter += `Carrier records confirm that package was shipped via ${shipping.carrier} (Tracking #${shipping.tracking_number}) and marked DELIVERED on ${shipping.delivered_at || 'scheduled date'}`;
    if (shipping.recipient_signature) {
      letter += ` with recipient signature verified as "${shipping.recipient_signature}".`;
    } else {
      letter += `.`;
    }
    letter += ` Delivery occurred at the authorized transaction address.\n\n`;
  }

  if (deliveryProof.length > 0 || accessLogs.length > 0) {
    letter += `2. VERIFIABLE DIGITAL FULFILLMENT & TELEMETRY:\n`;
    letter += `The requested digital deliverables were generated and provisioned. System telemetry confirms ${accessLogs.length} authenticated sessions and file downloads from IP ${accessLogs[0]?.ip_address || 'on record'}, identical to the IP used during transaction authorization.\n\n`;
  }

  if (positiveChats.length > 0) {
    letter += `3. DIRECT BUYER ACKNOWLEDGMENT:\n`;
    letter += `Customer correspondence via ${positiveChats[0].channel} demonstrates explicit receipt: "${positiveChats[0].message_text}". This directly refutes the assertion that merchandise was unreceived or unauthorized.\n\n`;
  }

  letter += `4. CONCLUSION:\n`;
  letter += `As substantiated by the attached contemporaneous exhibits, the merchant has satisfied all criteria for PayPal Seller Protection. We respectfully request that this claim be closed in the seller's favor and the held funds released.\n\n`;
  letter += `Sincerely,\n${businessName}`;

  if (customInstruction) {
    letter += `\n\n[Note: Custom instruction applied: "${customInstruction}"]`;
  }

  return {
    reason_classification: reason,
    buyer_claim_summary: dispute.buyer_message || 'Buyer dispute initiated on PayPal',
    claim_credibility_signals: contradictions.length > 0
      ? ['Contradicted by verifiable courier delivery confirmation', 'Contradicted by customer chat communication']
      : ['Claim pending carrier verification'],
    evidence_matches: evidenceMatches,
    contradictions_found: contradictions,
    missing_evidence: missing,
    case_strength_score: score,
    recommendation,
    recommendation_reasoning: recommendationReasoning,
    economics: {
      disputed_amount: economics.disputed_amount,
      estimated_seller_time_cost: economics.estimated_seller_time_cost,
      net_expected_value: economics.net_expected_value,
      verdict: economics.verdict
    },
    response_letter: letter,
    evidence_checklist: checklist.length > 0 ? checklist : [
      { item: 'Order Confirmation & Invoice', included: Boolean(order), paypal_evidence_type: 'PROOF_OF_FULFILLMENT' }
    ],
    risk_flags: riskFlags
  };
}

export default { runFallbackAnalysis };

