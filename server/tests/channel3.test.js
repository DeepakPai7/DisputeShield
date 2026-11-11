import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { db, initDatabase } from '../src/db/database.js';
import { channel3Client, normalizeProduct } from '../src/channel3/client.js';
import { recordPurchase } from '../src/routes/shop.js';
import { config } from '../src/config.js';

describe('Channel3 Integration & Product Snapshot Tests', () => {
  before(() => {
    initDatabase();
  });

  test('normalizeProduct safely normalizes raw Channel3 product data', () => {
    const rawSample = {
      id: 'test-c3-123',
      title: 'Waterproof Mountain Shell',
      brands: [{ name: 'ArcTeryx' }],
      description: '<p>Rugged GORE-TEX all-weather protection shell.</p>',
      images: [{ url: 'https://cdn.example.com/jacket.jpg' }],
      offers: [
        {
          domain: 'rei.com',
          url: 'https://rei.com/product/123',
          price: { price: 250, currency: 'USD' },
          availability: 'InStock'
        },
        {
          domain: 'backcountry.com',
          url: 'https://backcountry.com/product/123',
          price: { price: 230, currency: 'USD' },
          availability: 'InStock'
        }
      ]
    };

    const normalized = normalizeProduct(rawSample);
    assert.ok(normalized);
    assert.equal(normalized.id, 'test-c3-123');
    assert.equal(normalized.title, 'Waterproof Mountain Shell');
    assert.equal(normalized.brand, 'ArcTeryx');
    assert.equal(normalized.price, 230); // Picks cheapest in-stock offer
    assert.equal(normalized.domain, 'backcountry.com');
    assert.equal(normalized.currency, 'USD');
    assert.equal(normalized.image_url, 'https://cdn.example.com/jacket.jpg');
    assert.equal(normalized.offers_count, 2);
  });

  test('normalizeProduct returns null when no valid in-stock offers exist', () => {
    const noOffers = {
      id: 'test-empty',
      title: 'Discontinued Item',
      offers: []
    };
    assert.equal(normalizeProduct(noOffers), null);
  });

  test('recordPurchase saves immutable listing snapshot and seller records', async () => {
    const testOrderId = `ORD-TEST-${Date.now()}`;
    const captureId = `CAP-TEST-${Date.now()}`;
    const product = {
      id: 'prod-c3-test',
      title: 'Northline Arctic Down Parka',
      brand: 'Northline',
      description: '800-fill goose down insulation with weatherproof shell',
      image_url: 'https://cdn.example.com/parka.jpg',
      price: 89.99,
      currency: 'USD',
      domain: 'northline.com',
      offer_url: 'https://northline.com/buy',
      scenarioKey: 'jacket'
    };

    const res = await recordPurchase({
      orderId: testOrderId,
      paypalOrderId: `PAYPAL-ORD-${Date.now()}`,
      captureId,
      product,
      customerName: 'Aarav Patel',
      customerEmail: 'aarav@example.com',
      amountVal: 89.99,
      currencyVal: 'USD',
      shippingAddress: { line1: '100 Market St', city: 'San Jose', state: 'CA', postal_code: '95113', country: 'US' }
    });

    assert.ok(res.snapshot);
    assert.equal(res.snapshot.channel3_product_id, 'prod-c3-test');
    assert.equal(res.snapshot.title, 'Northline Arctic Down Parka');
    assert.equal(res.snapshot.price, 89.99);
    assert.equal(res.snapshot.offer_domain, 'northline.com');

    // Verify snapshot persisted in SQLite
    const row = db.prepare('SELECT * FROM product_snapshots WHERE order_id = ?').get(testOrderId);
    assert.ok(row);
    assert.equal(row.title, 'Northline Arctic Down Parka');
    assert.equal(row.brand, 'Northline');
    assert.equal(row.paypal_capture_id, captureId);

    // Verify seller records were attached
    const shipment = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(testOrderId);
    assert.ok(shipment);
    assert.equal(shipment.carrier, 'BlueDart');
    assert.equal(shipment.status, 'DELIVERED');
  });

  test('Channel3 client live search executes and populates cache', async () => {
    if (!config.isChannel3Configured) {
      console.log('Skipping live search test: Channel3 key not configured');
      return;
    }

    const searchRes = await channel3Client.searchProducts('earbuds', { limit: 2 });
    assert.ok(searchRes);
    assert.ok(Array.isArray(searchRes.products));
    assert.ok(searchRes.products.length > 0);

    const first = searchRes.products[0];
    assert.ok(first.id);
    assert.ok(first.title);
    assert.ok(typeof first.price === 'number');
    assert.equal(first.currency, 'USD');

    // Test detail
    const detail = await channel3Client.getProduct(first.id);
    assert.ok(detail);
    assert.equal(detail.id, first.id);
  });
});

