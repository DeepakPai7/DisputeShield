import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { maskSecret } from '../src/config.js';

describe('Placeholder & Secret Masking Tests', () => {
  test('maskSecret masks long secrets leaving only first and last 4 chars', () => {
    const masked = maskSecret('BAAdR-EdnbURLyeZGNClcuD53lAEeamVJOa2nmEqzv2TH2jE1_n9bOdVlRAyocZQXyF5JfwIT44qy47C8g');
    assert.ok(masked.startsWith('BAAd...'));
    assert.ok(masked.endsWith('...C8g') || masked.endsWith('7C8g'));
    assert.ok(!masked.includes('URLyeZGNClcuD53l'));
  });

  test('maskSecret handles empty or short values', () => {
    assert.equal(maskSecret(''), 'none');
    assert.equal(maskSecret(null), 'none');
    assert.equal(maskSecret('short'), '****');
  });

  test('placeholder detection logic identifies placeholder prefixes', () => {
    const check = (val) => Boolean(!val || val.trim().length === 0 || val.trim().toLowerCase().startsWith('paste_your_actual') || val.trim().toLowerCase().includes('paste_your'));

    assert.equal(check('paste_your_actual_paypal_client_id_here'), true);
    assert.equal(check('  paste_your_actual_key  '), true);
    assert.equal(check(''), true);
    assert.equal(check('BAAdR-EdnbURLyeZGNClcuD53lAEeamVJOa2nmEqzv2TH2jE1'), false);
  });
});

