import express from 'express';
import { config } from '../config.js';
import { channel3Client } from '../channel3/client.js';
import { restClient } from '../paypal/restClient.js';
import { db, recordAuditLog } from '../db/database.js';
import { attachSellerRecordsToOrder } from '../db/seedData.js';
import { STORE_PRODUCTS } from './store.js';
import { logger } from '../utils/logger.js';
import { GoogleGenAI } from '@google/genai';
import { getSelectedGeminiModel } from '../ai/modelSelector.js';

const router = express.Router();

/**
 * Helper to get a product strictly from the server's copy (Channel3 or practice products)
 */
async function resolveProductOnServer(productId) {
  if (!productId) {
    return STORE_PRODUCTS.jacket;
  }

  // Check practice products first
  if (STORE_PRODUCTS[productId]) {
    const p = STORE_PRODUCTS[productId];
    return {
      id: p.id,
      title: p.name,
      brand: 'DisputeShield Lab',
      description: p.description,
      image_url: null,
      price: p.price,
      currency: p.currency,
      domain: 'sandbox.paypal.com',
      offer_url: null,
      isPractice: true,
      scenarioKey: p.scenarioKey
    };
  }

  // If Channel3 is configured, fetch live detail or cache
  if (config.isChannel3Configured) {
    try {
      const c3Product = await channel3Client.getProduct(productId);
      return {
        ...c3Product,
        isPractice: false,
        scenarioKey: 'jacket' // Treat physical goods flow for realistic courier + OTP delivery
      };
    } catch (err) {
      logger.warn(`Could not resolve Channel3 product ${productId}, falling back to practice jacket:`, { message: err.message });
    }
  }

  // Fallback to jacket
  const j = STORE_PRODUCTS.jacket;
  return {
    id: j.id,
    title: j.name,
    brand: 'DisputeShield Lab',
    description: j.description,
    image_url: null,
    price: j.price,
    currency: j.currency,
    domain: 'sandbox.paypal.com',
    offer_url: null,
    isPractice: true,
    scenarioKey: 'jacket'
  };
}

/**
 * Record purchase snapshot and attach authentic seller records
 */
export async function recordPurchase({ orderId, paypalOrderId, captureId, product, customerName, customerEmail, amountVal, currencyVal, shippingAddress }) {
  const localOrderId = orderId || `ORD-${Date.now()}`;
  const nowIso = new Date().toISOString();
  const snapshotId = `SNAP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // 1. Insert Order
  db.prepare(`
    INSERT INTO orders (id, paypal_order_id, paypal_capture_id, customer_name, customer_email, items_json, total_amount, currency, shipping_address_json, order_date, payment_date, payment_reference, scenario_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    localOrderId,
    paypalOrderId,
    captureId,
    customerName,
    customerEmail,
    JSON.stringify([{
      name: product.title,
      sku: product.id,
      quantity: 1,
      unit_price: product.price,
      description: product.description,
      brand: product.brand,
      image_url: product.image_url,
      offer_domain: product.domain
    }]),
    amountVal,
    currencyVal,
    JSON.stringify(shippingAddress),
    nowIso,
    nowIso,
    captureId,
    product.scenarioKey || 'jacket'
  );

  // 2. Insert Listing Snapshot (the Channel3 evidence of what buyer saw and purchased)
  db.prepare(`
    INSERT INTO product_snapshots (id, order_id, paypal_capture_id, channel3_product_id, title, brand, description, main_image_url, price, currency, offer_domain, offer_url, captured_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshotId,
    localOrderId,
    captureId,
    product.id,
    product.title,
    product.brand || 'Unbranded',
    (product.description || '').slice(0, 450),
    product.image_url || null,
    amountVal,
    currencyVal,
    product.domain || 'retailer.com',
    product.offer_url || null,
    nowIso
  );

  // 3. Attach authentic demo seller records (BlueDart courier, OTP handshake certificate, customer chat confirmation)
  const attachedRecords = attachSellerRecordsToOrder({
    orderId: localOrderId,
    scenarioKey: product.scenarioKey || 'jacket',
    customerName,
    customerEmail,
    amount: amountVal,
    currency: currencyVal
  });

  // 4. Register shipment tracking with PayPal Sandbox
  let trackingResult = null;
  if (attachedRecords.trackingNumber && captureId) {
    try {
      logger.info(`[SHOP] Registering shipment tracking on PayPal for capture ${captureId}...`);
      trackingResult = await restClient.addShipmentTracking({
        transactionId: captureId,
        trackingNumber: attachedRecords.trackingNumber,
        carrier: 'OTHER',
        carrierName: attachedRecords.carrier || 'BlueDart',
        status: 'DELIVERED'
      });
      logger.info('[SHOP] Shipment tracking registered on PayPal successfully.');
    } catch (trackErr) {
      logger.warn('[SHOP] Tracking registration note (sandbox):', { message: trackErr.message });
    }
  }

  // 5. Audit Log with SHA-256 Chaining
  recordAuditLog({
    actor: 'Sandbox Customer',
    action: 'Order Captured & Channel3 Listing Snapshot Stored',
    details: {
      orderId: localOrderId,
      paypalOrderId,
      captureId,
      snapshotId,
      productTitle: product.title,
      price: `${amountVal} ${currencyVal}`,
      channel3ProductId: product.id,
      trackingNumber: attachedRecords.trackingNumber || null
    }
  });

  const snapshot = db.prepare('SELECT * FROM product_snapshots WHERE id = ?').get(snapshotId);

  return {
    localOrderId,
    snapshot,
    attachedRecords,
    trackingRegistered: Boolean(trackingResult)
  };
}

/**
 * GET /api/shop/search?q=...
 */
router.get('/search', async (req, res) => {
  const query = (req.query.q || req.query.query || 'winter jacket').trim();
  const limit = parseInt(req.query.limit || '8', 10);

  // If Channel3 is not configured (or is placeholder), return setup state and practice products
  if (!config.isChannel3Configured) {
    return res.json({
      configured: false,
      message: 'Add your Channel3 key to browse real products from millions of retailers.',
      query,
      products: [],
      practiceProducts: Object.values(STORE_PRODUCTS)
    });
  }

  try {
    const result = await channel3Client.searchProducts(query, { limit });
    res.json({
      configured: true,
      query: result.query,
      total: result.total,
      products: result.products,
      practiceProducts: Object.values(STORE_PRODUCTS)
    });
  } catch (err) {
    logger.error('[SHOP SEARCH ERROR]', { message: err.message });
    res.json({
      configured: true,
      error: err.message,
      query,
      products: [],
      practiceProducts: Object.values(STORE_PRODUCTS)
    });
  }
});

/**
 * GET /api/shop/products/:id
 */
router.get('/products/:id', async (req, res) => {
  try {
    const product = await resolveProductOnServer(req.params.id);
    res.json({ product });
  } catch (err) {
    logger.error('[SHOP PRODUCT DETAIL ERROR]', { message: err.message });
    res.status(404).json({ error: err.message });
  }
});

/**
 * POST /api/shop/create-order
 * Builds PayPal Orders v2 strictly from the server's own verified copy of the product and price
 */
router.post('/create-order', async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await resolveProductOnServer(productId);

    logger.info(`[SHOP] Creating PayPal Order for "${product.title}" ($${product.price} ${product.currency})...`);

    const localOrderId = `ORD-${Date.now()}`;

    const orderRes = await restClient.createOrder({
      items: [
        {
          name: product.title.slice(0, 127),
          unit_price: product.price,
          quantity: 1,
          description: (product.description || product.title).slice(0, 127)
        }
      ],
      totalAmount: product.price,
      currency: 'USD',
      description: `DisputeShield: ${product.title}`.slice(0, 127),
      customId: localOrderId
    });

    res.json({
      orderId: orderRes.id,
      localOrderId,
      product,
      status: orderRes.status
    });
  } catch (err) {
    logger.error('[SHOP CREATE ORDER ERROR]', { message: err.message });
    res.status(500).json({ error: 'Failed to create PayPal order: ' + err.message });
  }
});

/**
 * POST /api/shop/quick-checkout
 * 1-click test checkout: creates a real PayPal Sandbox Order, records the immutable Channel3 snapshot,
 * courier tracking, and OTP delivery certificate without requiring browser popup login.
 */
router.post('/quick-checkout', async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await resolveProductOnServer(productId);

    logger.info(`[SHOP] Performing 1-Click Sandbox Test Checkout for "${product.title}" ($${product.price} USD)...`);

    // 1. Create real PayPal Sandbox order via PayPal Orders v2 REST API
    let paypalOrderId = `ORD-SANDBOX-${Date.now()}`;
    let captureId = `CAP-${Date.now()}`;
    try {
      const orderRes = await restClient.createOrder({
        items: [
          {
            name: product.title.slice(0, 127),
            unit_price: product.price,
            quantity: 1,
            description: (product.description || product.title).slice(0, 127)
          }
        ],
        totalAmount: product.price,
        currency: 'USD',
        description: `DisputeShield: ${product.title}`.slice(0, 127)
      });
      if (orderRes?.id) {
        paypalOrderId = orderRes.id;
        captureId = `CAP-${orderRes.id}`;
      }
    } catch (orderErr) {
      logger.warn('[SHOP] PayPal order creation warning, using simulated sandbox ID:', { message: orderErr.message });
    }

    const localOrderId = `ORD-${Date.now()}`;
    const customerName = 'Rahul Sharma';
    const customerEmail = 'rahul.sharma@example.com';
    const amountVal = Number(product.price);
    const currencyVal = 'USD';

    const shippingAddress = {
      line1: '2211 N First St',
      city: 'San Jose',
      state: 'CA',
      postal_code: '95131',
      country: 'US'
    };

    const purchaseRecord = await recordPurchase({
      orderId: localOrderId,
      paypalOrderId,
      captureId,
      product,
      customerName,
      customerEmail,
      amountVal,
      currencyVal,
      shippingAddress
    });

    res.json({
      success: true,
      orderId: purchaseRecord.localOrderId,
      paypalOrderId,
      captureId,
      customerName,
      product,
      snapshot: purchaseRecord.snapshot,
      attachedRecords: purchaseRecord.attachedRecords,
      trackingRegistered: purchaseRecord.trackingRegistered
    });
  } catch (err) {
    logger.error('[SHOP QUICK CHECKOUT ERROR]', { message: err.message });
    res.status(500).json({ error: 'Quick checkout failed: ' + err.message });
  }
});

/**
 * POST /api/shop/capture-order
 * Captures payment in sandbox and saves the listing snapshot
 */
router.post('/capture-order', async (req, res) => {
  try {
    const { orderId, productId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const product = await resolveProductOnServer(productId);
    logger.info(`[SHOP] Capturing PayPal order ${orderId} for product "${product.title}"...`);

    const captureRes = await restClient.captureOrder(orderId);
    const purchaseUnit = captureRes.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];
    const captureId = capture?.id || `CAP-${orderId}`;
    const payer = captureRes.payer || {};

    const customerName = payer.name?.given_name
      ? `${payer.name.given_name} ${payer.name.surname || ''}`.trim()
      : 'Rahul Sharma';
    const customerEmail = payer.email_address || 'rahul.sharma@example.com';
    const amountVal = parseFloat(capture?.amount?.value || String(product.price));
    const currencyVal = capture?.amount?.currency_code || product.currency || 'USD';

    const shippingAddress = purchaseUnit?.shipping?.address || {
      line1: '2211 N First St',
      city: 'San Jose',
      state: 'CA',
      postal_code: '95131',
      country: 'US'
    };

    const purchaseRecord = await recordPurchase({
      orderId: purchaseUnit?.custom_id || `ORD-${Date.now()}`,
      paypalOrderId: orderId,
      captureId,
      product,
      customerName,
      customerEmail,
      amountVal,
      currencyVal,
      shippingAddress
    });

    res.json({
      success: true,
      orderId: purchaseRecord.localOrderId,
      paypalOrderId: orderId,
      captureId,
      customerName,
      product,
      snapshot: purchaseRecord.snapshot,
      attachedRecords: purchaseRecord.attachedRecords,
      trackingRegistered: purchaseRecord.trackingRegistered
    });
  } catch (err) {
    logger.error('[SHOP CAPTURE ORDER ERROR]', { message: err.message });
    res.status(500).json({ error: 'Order capture failed: ' + err.message });
  }
});

/**
 * POST /api/shop/ai-pick
 * Uses Gemini to evaluate search results against user search intent and picks the best match
 */
router.post('/ai-pick', async (req, res) => {
  try {
    const { query, products } = req.body;
    if (!query || !Array.isArray(products) || products.length === 0) {
      return res.json({ pick: null });
    }

    if (!config.geminiApiKey || config.isSetupRequired) {
      return res.json({ pick: null });
    }

    const modelId = await getSelectedGeminiModel();
    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

    const prompt = `You are a helpful e-commerce shopping advisor.
A user searched for: "${query}".
Here are up to 6 candidate products from Channel3:
${JSON.stringify(products.slice(0, 6).map(p => ({
  id: p.id,
  title: p.title,
  brand: p.brand,
  price: p.price,
  description: p.description?.slice(0, 100)
})))}

Pick the single best match that best fits the query.
Return STRICT JSON ONLY in this format:
{
  "best_product_id": "<id>",
  "reason": "Best match: <one concise sentence under 12 words, e.g. 'Warm winter coat within your budget'>"
}`;

    const aiRes = await ai.models.generateContent({
      model: modelId,
      contents: prompt
    });

    const cleaned = (aiRes.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    res.json({ pick: parsed });
  } catch (err) {
    logger.warn('[AI PICK] Optional AI pick skipped:', { message: err.message });
    res.json({ pick: null });
  }
});

export default router;

