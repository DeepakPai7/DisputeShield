/**
 * Calculates the economic viability of contesting a dispute.
 *
 * Formula:
 * Net Expected Value (NEV) = (Case Strength Score / 100 * Disputed Amount) - Estimated Seller Time Cost
 *
 * Recommendation criteria:
 * - If Disputed Amount <= tinyThreshold AND Score < 80 => REFUND (fighting costs more than it's worth)
 * - If NEV <= 0 => REFUND
 * - Else if Score >= 75 => FIGHT
 * - Else => NEEDS_MORE_INFO / REFUND
 */
export function calculateDisputeEconomics({
  disputedAmount = 0,
  caseStrengthScore = 0,
  sellerTimeCost = 4.0,
  tinyThreshold = 5.0,
  currency = 'USD'
}) {
  const amount = Number(disputedAmount) || 0;
  const score = Math.max(0, Math.min(100, Number(caseStrengthScore) || 0));
  const timeCost = Number(sellerTimeCost) || 4.0;
  const threshold = Number(tinyThreshold) || 5.0;

  const expectedWinValue = (score / 100) * amount;
  const netExpectedValue = expectedWinValue - timeCost;

  let verdict = '';
  let shouldRefundByEconomics = false;

  // Currency formatting symbol
  const sym = currency === 'INR' ? '₹' : (currency === 'EUR' ? '€' : (currency === 'GBP' ? '£' : '$'));

  if (amount <= threshold && score < 80) {
    shouldRefundByEconomics = true;
    verdict = `Disputed amount (${sym}${amount.toFixed(2)}) is below threshold (${sym}${threshold.toFixed(2)}) and case strength (${score}%) does not justify defense overhead.`;
  } else if (netExpectedValue <= 0) {
    shouldRefundByEconomics = true;
    verdict = `Net expected value is negative (${sym}${netExpectedValue.toFixed(2)}). Time spent defending (${sym}${timeCost.toFixed(2)}) exceeds expected recovery (${sym}${expectedWinValue.toFixed(2)}).`;
  } else {
    shouldRefundByEconomics = false;
    verdict = `Net expected value is positive (+${sym}${netExpectedValue.toFixed(2)}). High recovery probability (${score}%) justifies defense against ${sym}${amount.toFixed(2)}.`;
  }

  return {
    disputed_amount: Number(amount.toFixed(2)),
    estimated_seller_time_cost: Number(timeCost.toFixed(2)),
    expected_win_value: Number(expectedWinValue.toFixed(2)),
    net_expected_value: Number(netExpectedValue.toFixed(2)),
    tiny_threshold: Number(threshold.toFixed(2)),
    should_refund: shouldRefundByEconomics,
    currency,
    currency_symbol: sym,
    formula_display: `(${score}% × ${sym}${amount.toFixed(2)}) − ${sym}${timeCost.toFixed(2)} = ${sym}${netExpectedValue.toFixed(2)}`,
    verdict
  };
}

export default { calculateDisputeEconomics };

