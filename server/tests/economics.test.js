import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDisputeEconomics } from '../src/utils/economics.js';

describe('Economics Logic Tests', () => {
  test('calculates correct net expected value for high probability case', () => {
    const result = calculateDisputeEconomics({
      disputedAmount: 450.0,
      caseStrengthScore: 90,
      sellerTimeCost: 4.0,
      tinyThreshold: 5.0,
      currency: 'USD'
    });

    // (90/100 * 450) - 4 = 405 - 4 = 401
    assert.equal(result.expected_win_value, 405.0);
    assert.equal(result.net_expected_value, 401.0);
    assert.equal(result.should_refund, false);
    assert.ok(result.verdict.includes('Net expected value is positive'));
  });

  test('recommends REFUND when disputed amount is below tiny threshold and score < 80', () => {
    const result = calculateDisputeEconomics({
      disputedAmount: 3.0,
      caseStrengthScore: 60,
      sellerTimeCost: 4.0,
      tinyThreshold: 5.0,
      currency: 'USD'
    });

    // (60/100 * 3) - 4 = 1.8 - 4 = -2.2
    assert.equal(result.disputed_amount, 3.0);
    assert.equal(result.net_expected_value, -2.2);
    assert.equal(result.should_refund, true);
    assert.ok(result.verdict.includes('below threshold'));
  });

  test('recommends REFUND when net expected value is negative', () => {
    const result = calculateDisputeEconomics({
      disputedAmount: 10.0,
      caseStrengthScore: 20,
      sellerTimeCost: 4.0,
      tinyThreshold: 5.0,
      currency: 'USD'
    });

    // (20/100 * 10) - 4 = 2 - 4 = -2
    assert.equal(result.expected_win_value, 2.0);
    assert.equal(result.net_expected_value, -2.0);
    assert.equal(result.should_refund, true);
  });

  test('handles INR currency formatting correctly', () => {
    const result = calculateDisputeEconomics({
      disputedAmount: 5000.0,
      caseStrengthScore: 95,
      sellerTimeCost: 350.0,
      tinyThreshold: 400.0,
      currency: 'INR'
    });

    assert.equal(result.currency, 'INR');
    assert.equal(result.currency_symbol, '₹');
    assert.equal(result.should_refund, false);
    assert.ok(result.formula_display.includes('₹5000.00'));
  });
});

