import express from 'express';
import { restClient } from '../paypal/restClient.js';
import { callMcpTool } from '../paypal/mcpClient.js';
import { db, recordAuditLog } from '../db/database.js';
import { attachSellerRecordsToOrder } from '../db/seedData.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Product catalog for the Sandbox Lab Storefront
export const STORE_PRODUCTS = {
  jacket: {
    id: 'prod-jacket',
    scenarioKey: 'jacket',
    name: "Alpine All-Weather Shell Jacket",
    sku: 'APP-JKT-ALPINE-L',
    price: 60.00,
    currency: 'USD',
    type: 'PHYSICAL',
    description: 'Triple-layer waterproof breathable technical shell jacket (Size L, Black)'
  },
  logo: {
    id: 'prod-logo',
    scenarioKey: 'logo',
    name: 'Modern Corporate Brand Identity & Vector Logo Package',
    sku: 'SRV-LOGO-PRO',
    price: 120.00,
    currency: 'USD',
    type: 'DIGITAL',
    description: 'Vector SVG/AI production source assets, 3 revision concepts, commercial licensing'
  },
  tiny: {
    id: 'prod-tiny',
    scenarioKey: 'tiny',
    name: 'Cyberpunk Holographic Vinyl Sticker Pack (3-pc)',
    sku: 'STK-CYBER-3PK',
    price: 3.00,
    currency: 'USD',
    type: 'MICRO',
    description: 'Weatherproof holographic vinyl stickers for laptops and gear'
  }
};

// GET /api/store/products - List products available for sandbox testing
router.get('/products', (req, res) => {
  res.json({ products: Object.values(STORE_PRODUCTS) });
});

// POST /api/store/create-order - Create PayPal Order via Orders v2
router.post('/create-order', async (req, res) => {
  try {
    const { productKey = 'jacket' } = req.body;
    const product = STORE_PRODUCTS[productKey] || STORE_PRODUCTS.jacket;

    logger.info(`[STOREFRONT] Creating PayPal Orders v2 for ${product.name} ($${product.price} ${product.currency})...`);

    const orderRes = await restClient.createOrder({
      items: [
        {
          name: product.name,
          unit_price: product.price,
          quantity: 1,
          description: product.description
        }
      ],
      totalAmount: product.price,
      currency: product.currency,
      description: `DisputeShield Lab: ${product.name}`
    });

    logger.info(`[STOREFRONT] PayPal order created: ${orderRes.id}`);
    res.json({
      orderId: orderRes.id,
      productKey: product.scenarioKey,
      status: orderRes.status
    });
  } catch (err) {
    logger.error('[STOREFRONT] Failed to create order:', { message: err.message });
    res.status(500).json({ error: 'Failed to create PayPal order: ' + err.message });
  }
});

// POST /api/store/capture-order - Capture PayPal Order via Orders v2
router.post('/capture-order', async (req, res) => {
  try {
    const { orderId, productKey = 'jacket' } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const product = STORE_PRODUCTS[productKey] || STORE_PRODUCTS.jacket;
    logger.info(`[STOREFRONT] Capturing PayPal order ${orderId}...`);

    const captureRes = await restClient.captureOrder(orderId);
    const purchaseUnit = captureRes.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];
    const captureId = capture?.id || `CAP-${orderId}`;
    const payer = captureRes.payer || {};

    const customerName = payer.name?.given_name ? `${payer.name.given_name} ${payer.name.surname || ''}`.trim() : 'Sandbox Buyer';
    const customerEmail = payer.email_address || 'buyer-sandbox@disputeshield.io';
    const amountVal = parseFloat(capture?.amount?.value || String(product.price));
    const currencyVal = capture?.amount?.currency_code || product.currency;

    const shippingAddress = purchaseUnit?.shipping?.address || {
      line1: '2211 N First St',
      city: 'San Jose',
      state: 'CA',
      postal_code: '95131',
      country: 'US'
    };

    const localOrderId = `ORD-${Date.now()}`;
    const nowIso = new Date().toISOString();

    // 1. Store order in local SQLite
    db.prepare(`
      INSERT INTO orders (id, paypal_order_id, paypal_capture_id, customer_name, customer_email, items_json, total_amount, currency, shipping_address_json, order_date, payment_date, payment_reference, scenario_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      localOrderId,
      orderId,
      captureId,
      customerName,
      customerEmail,
      JSON.stringify([{ name: product.name, sku: product.sku, quantity: 1, unit_price: product.price, description: product.description }]),
      amountVal,
      currencyVal,
      JSON.stringify(shippingAddress),
      nowIso,
      nowIso,
      captureId,
      product.scenarioKey
    );

    // 2. Attach scenario seller records
    const attachedRecords = attachSellerRecordsToOrder({
      orderId: localOrderId,
      scenarioKey: product.scenarioKey,
      customerName,
      customerEmail,
      amount: amountVal,
      currency: currencyVal
    });

    // 3. Register shipment tracking on the real PayPal transaction
    let trackingResult = null;
    if (attachedRecords.trackingNumber && captureId) {
      try {
        logger.info(`[STOREFRONT] Registering shipment tracking on PayPal for capture ${captureId}...`);
        trackingResult = await restClient.addShipmentTracking({
          transactionId: captureId,
          trackingNumber: attachedRecords.trackingNumber,
          carrier: 'OTHER',
          carrierName: attachedRecords.carrier || 'BlueDart',
          status: 'DELIVERED'
        });
        logger.info('[STOREFRONT] Shipment tracking registered on PayPal successfully.');
      } catch (trackErr) {
        logger.warn('[STOREFRONT] Could not register tracking on PayPal (sandbox limitation):', { message: trackErr.message });
      }
    }

    // 4. Audit log
    recordAuditLog({
      actor: 'Sandbox Lab Buyer',
      action: 'Order Captured & Records Linked',
      details: {
        orderId: localOrderId,
        paypalOrderId: orderId,
        captureId,
        product: product.name,
        amount: `${amountVal} ${currencyVal}`,
        scenario: product.scenarioKey,
        tracking: attachedRecords.trackingNumber || null
      }
    });

    res.json({
      success: true,
      orderId: localOrderId,
      paypalOrderId: orderId,
      captureId,
      customerName,
      product: product.name,
      amount: amountVal,
      currency: currencyVal,
      scenarioKey: product.scenarioKey,
      attachedRecords,
      trackingRegistered: Boolean(trackingResult)
    });
  } catch (err) {
    logger.error('[STOREFRONT] Failed to capture order:', { message: err.message });
    res.status(500).json({ error: 'Order capture failed: ' + err.message });
  }
});

/**
 * GET /api/store/orders - List customer orders with shipment & OTP details
 */
router.get('/orders', (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT 
        o.*,
        s.id as shipment_id,
        s.carrier,
        s.tracking_number,
        s.status as shipment_status,
        s.shipped_at,
        s.delivered_at,
        s.delivery_otp,
        s.otp_verified,
        s.unique_delivery_id,
        s.verified_at
      FROM orders o
      LEFT JOIN shipments s ON s.order_id = o.id
      ORDER BY datetime(o.order_date) DESC
    `).all();

    // Ensure physical orders have an OTP code generated if missing
    for (const ord of orders) {
      if (!ord.delivery_otp && ord.shipment_id) {
        const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
        db.prepare('UPDATE shipments SET delivery_otp = ? WHERE id = ?').run(generatedOtp, ord.shipment_id);
        ord.delivery_otp = generatedOtp;
      }
    }

    res.json({ success: true, orders });
  } catch (err) {
    logger.error('Failed to list orders:', { message: err.message });
    res.status(500).json({ error: 'Failed to list orders: ' + err.message });
  }
});

/**
 * POST /api/store/orders/:orderId/verify-otp
 * Verifies the buyer-provided delivery OTP and creates the unique cryptographic delivery certificate
 */
router.post('/orders/:orderId/verify-otp', (req, res) => {
  try {
    const { orderId } = req.params;
    const { otp } = req.body;

    if (!otp || !otp.trim()) {
      return res.status(400).json({ error: 'Delivery OTP is required' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const shipment = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(orderId);
    if (!shipment) {
      return res.status(404).json({ error: 'No shipment found for this order' });
    }

    // Check OTP
    if (shipment.delivery_otp && shipment.delivery_otp.trim() !== otp.trim()) {
      return res.status(400).json({
        error: `Incorrect OTP. Please provide the exact 6-digit code shown in the Buyer Portal (${shipment.delivery_otp}).`
      });
    }

    const uniqueDeliveryId = shipment.unique_delivery_id || `OTP-DELV-${otp.trim()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE shipments 
      SET status = 'DELIVERED',
          delivered_at = COALESCE(delivered_at, ?),
          delivery_otp = ?,
          otp_verified = 1,
          unique_delivery_id = ?,
          verified_at = ?
      WHERE id = ?
    `).run(nowIso, otp.trim(), uniqueDeliveryId, nowIso, shipment.id);

    // Insert shipment event
    db.prepare(`
      INSERT INTO shipment_events (id, shipment_id, event_time, location, description, status_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `EVT-${Date.now()}`,
      shipment.id,
      nowIso,
      'Destination Doorstep',
      `Delivery verified with buyer OTP (${otp.trim()}). Handshake confirmed (ID #${uniqueDeliveryId}).`,
      'DELIVERED'
    );

    recordAuditLog({
      actor: 'Delivery Person',
      action: 'Delivery OTP Handshake Verified',
      details: {
        orderId,
        shipmentId: shipment.id,
        otp: otp.trim(),
        unique_delivery_id: uniqueDeliveryId,
        timestamp: nowIso
      }
    });

    logger.info(`[DELIVERY] Order ${orderId} OTP Handshake Verified: ${uniqueDeliveryId}`);

    res.json({
      success: true,
      message: 'Delivery confirmed! Unique Handshake Proof certificate generated.',
      order_id: orderId,
      unique_delivery_id: uniqueDeliveryId,
      delivered_at: nowIso
    });
  } catch (err) {
    logger.error(`Error verifying OTP for order ${req.params.orderId}:`, { message: err.message });
    res.status(500).json({ error: 'Failed to verify OTP: ' + err.message });
  }
});

export default router;

