import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { restClient } from '../src/paypal/restClient.js';
import { getPayPalAccessToken } from '../src/paypal/auth.js';
import { config } from '../src/config.js';

describe('PayPal Real Sandbox REST Client Tests', () => {
  test('authenticates and retrieves valid sandbox OAuth access token', async () => {
    if (config.isSetupRequired) {
      console.log('Skipping OAuth test: Setup required');
      return;
    }
    const token = await getPayPalAccessToken();
    assert.ok(token);
    assert.ok(typeof token === 'string');
    assert.ok(token.length > 20);
  });

  test('successfully executes GET /v1/customer/disputes against PayPal sandbox', async () => {
    if (config.isSetupRequired) {
      console.log('Skipping disputes query test: Setup required');
      return;
    }
    const result = await restClient.listDisputes({ dispute_state: 'REQUIRED_ACTION' });
    assert.ok(result);
    assert.ok(Array.isArray(result.items || []));
  });

  test('creates PayPal sandbox test order via Orders v2', async () => {
    if (config.isSetupRequired) {
      console.log('Skipping order creation test: Setup required');
      return;
    }
    const order = await restClient.createOrder({
      amount: 3.00,
      currency: 'USD',
      description: 'Test Holographic Stickers'
    });
    assert.ok(order);
    assert.ok(order.id);
    assert.equal(order.status, 'CREATED');
  });
});
