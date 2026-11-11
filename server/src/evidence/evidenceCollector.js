import ordersConnector from './ordersConnector.js';
import courierConnector from './courierConnector.js';
import chatConnector from './chatConnector.js';
import digitalDeliveryConnector from './digitalDeliveryConnector.js';
import { db } from '../db/database.js';

export async function collectEvidencePacket(disputeId, orderId) {
  const gaps = [];

  // 1. Fetch Order Details
  const order = await ordersConnector.fetch(orderId);
  if (!order) {
    gaps.push('No matching merchant order found for transaction.');
  }

  // 2. Fetch Shipping Details
  const shipping = await courierConnector.fetch(orderId);
  if (shipping) {
    if (shipping.status !== 'DELIVERED') {
      gaps.push(`Shipment status is "${shipping.status}", not confirmed DELIVERED.`);
    }
    if (!shipping.recipient_signature) {
      gaps.push('No recipient signature or physical proof-of-delivery OTP captured.');
    }
  } else if (order && order.shipping_address && Object.keys(order.shipping_address).length > 0) {
    // Expected physical shipment but none found
    gaps.push('No courier shipment tracking recorded for physical order.');
  }

  // 3. Fetch Communications
  const chatExcerpts = await chatConnector.fetch(orderId);
  if (!chatExcerpts || chatExcerpts.length === 0) {
    gaps.push('No direct customer communication (email, WhatsApp, support) on record.');
  }

  // 4. Fetch Digital Delivery & Access Logs
  const digital = await digitalDeliveryConnector.fetch(orderId);
  const deliveryProof = digital.files || [];
  const accessLogs = digital.access_logs || [];

  const isDigital = deliveryProof.length > 0 || (order && order.items && order.items.some(i => /digital|logo|vector|service|design|license/i.test(i.name || '')));
  if (isDigital && accessLogs.length === 0) {
    gaps.push('No customer digital access, login, or download telemetry recorded.');
  }

  // 5. Fetch Manual Uploads
  const manualRows = db.prepare('SELECT * FROM evidence_items WHERE dispute_id = ? ORDER BY created_at DESC').all(disputeId);
  const manualUploads = manualRows.map(r => {
    let content = {};
    try {
      content = JSON.parse(r.content_json || '{}');
    } catch (e) {
      content = { raw: r.content_json };
    }
    return {
      id: r.id,
      category: r.category,
      title: r.title,
      content,
      file_path: r.file_path,
      file_mimetype: r.file_mimetype,
      file_size: r.file_size,
      is_manual: Boolean(r.is_manual),
      created_at: r.created_at
    };
  });

  // 6. Fetch Channel3 Product Snapshot (proof of what buyer saw and purchased)
  let productSnapshot = null;
  if (orderId) {
    productSnapshot = db.prepare('SELECT * FROM product_snapshots WHERE order_id = ? OR paypal_capture_id = ?').get(orderId, orderId);
  }
  if (!productSnapshot && order && order.paypal_capture_id) {
    productSnapshot = db.prepare('SELECT * FROM product_snapshots WHERE paypal_capture_id = ?').get(order.paypal_capture_id);
  }
  if (!productSnapshot) {
    productSnapshot = db.prepare('SELECT * FROM product_snapshots ORDER BY rowid DESC LIMIT 1').get();
  }

  return {
    order,
    shipping,
    chatExcerpts,
    deliveryProof,
    accessLogs,
    manualUploads,
    productSnapshot,
    gaps
  };
}

export default { collectEvidencePacket };

