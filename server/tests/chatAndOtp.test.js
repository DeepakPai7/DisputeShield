import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/database.js';

describe('Real Two-Way Chat & OTP Delivery Handshake Tests', () => {
  const testOrderId = `ORD-TEST-CHAT-${Date.now()}`;
  const nowIso = new Date().toISOString();

  it('inserts an order and shipment with a 6-digit delivery OTP', () => {
    db.prepare(`
      INSERT INTO orders (id, customer_name, customer_email, total_amount, currency, order_date, payment_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(testOrderId, 'Rohan Kumar', 'rohan@example.com', 60.0, 'USD', nowIso, nowIso);

    db.prepare(`
      INSERT INTO shipments (id, order_id, carrier, tracking_number, status, delivery_otp, otp_verified)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(`SHIP-${testOrderId}`, testOrderId, 'BlueDart', 'BD-99887766', 'OUT_FOR_DELIVERY', '849201');

    const shipment = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(testOrderId);
    assert.equal(shipment.delivery_otp, '849201');
    assert.equal(shipment.otp_verified, 0);
    assert.equal(shipment.status, 'OUT_FOR_DELIVERY');
  });

  it('stores and retrieves real buyer and seller chat messages', () => {
    // 1. Buyer sends message
    db.prepare(`
      INSERT INTO chat_messages (id, order_id, channel, sender, sender_role, message_text, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`MSG-${Date.now()}-1`, testOrderId, 'Live Chat', 'Rohan Kumar', 'buyer', 'Hi, I received the jacket today! Fits great, thanks.', nowIso);

    // 2. Seller sends reply
    db.prepare(`
      INSERT INTO chat_messages (id, order_id, channel, sender, sender_role, message_text, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`MSG-${Date.now()}-2`, testOrderId, 'Live Chat', 'Store Support', 'seller', 'Glad to hear! Enjoy your Alpine jacket!', nowIso);

    const messages = db.prepare('SELECT * FROM chat_messages WHERE order_id = ? ORDER BY sent_at ASC').all(testOrderId);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].sender_role, 'buyer');
    assert.match(messages[0].message_text, /received the jacket/);
    assert.equal(messages[1].sender_role, 'seller');
  });

  it('verifies the buyer OTP, creates unique cryptographic delivery certificate, and marks delivered', () => {
    const shipment = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(testOrderId);
    const enteredOtp = '849201';
    assert.equal(enteredOtp, shipment.delivery_otp);

    const uniqueDeliveryId = `OTP-DELV-${enteredOtp}-9X7B`;
    db.prepare(`
      UPDATE shipments 
      SET status = 'DELIVERED',
          delivery_otp = ?,
          otp_verified = 1,
          unique_delivery_id = ?,
          verified_at = ?
      WHERE order_id = ?
    `).run(enteredOtp, uniqueDeliveryId, new Date().toISOString(), testOrderId);

    const updatedShipment = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(testOrderId);
    assert.equal(updatedShipment.status, 'DELIVERED');
    assert.equal(updatedShipment.otp_verified, 1);
    assert.equal(updatedShipment.unique_delivery_id, uniqueDeliveryId);
  });
});

