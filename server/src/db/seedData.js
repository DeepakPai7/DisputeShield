import { db } from './database.js';
import { logger } from '../utils/logger.js';

/**
 * Attaches realistic seller records (courier tracking, chat transcripts, digital access logs)
 * to an authentic captured order in the Sandbox Lab storefront.
 * This represents the merchant's internal CRM/ERP records linked to the PayPal transaction.
 */
export function attachSellerRecordsToOrder({ orderId, scenarioKey, customerName, customerEmail, amount, currency }) {
  const now = new Date();
  const isoNow = now.toISOString();
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600000).toISOString();

  logger.info(`Attaching seller records to order ${orderId} for scenario: ${scenarioKey}...`);

  if (scenarioKey === 'jacket') {
    // 1. Physical Goods: BlueDart Courier + OTP Handshake Delivery + Customer Chat
    const shipmentId = `SHIP-${Date.now()}`;
    const trackingNumber = `BD-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const deliveryOtp = String(Math.floor(100000 + Math.random() * 900000));
    const uniqueDeliveryId = `OTP-DELV-${deliveryOtp}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    db.prepare(`
      INSERT INTO shipments (id, order_id, carrier, tracking_number, status, shipped_at, delivered_at, recipient_signature, delivery_otp, otp_verified, unique_delivery_id, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      shipmentId,
      orderId,
      'BlueDart',
      trackingNumber,
      'DELIVERED',
      hoursAgo(48),
      hoursAgo(6),
      `${customerName} (Verified OTP Handshake & Signature)`,
      deliveryOtp,
      uniqueDeliveryId,
      hoursAgo(6)
    );

    const insertEvent = db.prepare(`
      INSERT INTO shipment_events (id, shipment_id, event_time, location, description, status_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertEvent.run(`EVT-${Date.now()}-1`, shipmentId, hoursAgo(48), 'Bengaluru Central Hub', 'Dispatched from fulfillment center', 'PICKED_UP');
    insertEvent.run(`EVT-${Date.now()}-2`, shipmentId, hoursAgo(24), 'Sorting Facility', 'In transit to local destination station', 'IN_TRANSIT');
    insertEvent.run(`EVT-${Date.now()}-3`, shipmentId, hoursAgo(8), 'Delivery Station', 'Out for delivery with courier agent', 'OUT_FOR_DELIVERY');
    insertEvent.run(`EVT-${Date.now()}-4`, shipmentId, hoursAgo(6), 'Destination Address', `Delivered. Buyer furnished confidential OTP passcode (${deliveryOtp}). Handshake confirmed (ID #${uniqueDeliveryId}).`, 'DELIVERED');

    const insertChat = db.prepare(`
      INSERT INTO chat_messages (id, order_id, channel, sender, sender_role, message_text, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertChat.run(`CHAT-${Date.now()}-1`, orderId, 'Live Chat', 'Merchant Support', 'seller', `Hi ${customerName}! Your Alpine Jacket has arrived with BlueDart. Please provide OTP ${deliveryOtp} to the courier agent.`, hoursAgo(6));
    insertChat.run(`CHAT-${Date.now()}-2`, orderId, 'Live Chat', customerName, 'buyer', `Gave the OTP to the delivery person, thanks! The jacket fits great and looks awesome.`, hoursAgo(5));

    return { trackingNumber, carrier: 'BlueDart', status: 'DELIVERED', deliveryOtp, uniqueDeliveryId };
  } else if (scenarioKey === 'logo') {
    // 2. Digital Goods: Email Approvals + IP Access Logs (6 downloads)
    const fileId = `FILE-${Date.now()}`;
    const fileName = 'VanceTech_Complete_BrandPack_v3_Final.zip';
    const clientIp = '198.51.100.42';

    db.prepare(`
      INSERT INTO delivery_files (id, order_id, file_name, file_size, file_hash, delivery_url, delivered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      fileId,
      orderId,
      fileName,
      14852910,
      'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      `https://delivery.apexmerchants.com/dl/${orderId}`,
      hoursAgo(72)
    );

    const insertLog = db.prepare(`
      INSERT INTO access_logs (id, order_id, ip_address, user_agent, action, logged_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertLog.run(`LOG-${Date.now()}-1`, orderId, clientIp, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Authenticated checkout & payment authorized', hoursAgo(96));
    insertLog.run(`LOG-${Date.now()}-2`, orderId, clientIp, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Concept design drafts #1, #2 & #3 reviewed', hoursAgo(76));
    insertLog.run(`LOG-${Date.now()}-3`, orderId, clientIp, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Final BrandPack.zip downloaded (Download 1 of 6)', hoursAgo(70));
    insertLog.run(`LOG-${Date.now()}-4`, orderId, clientIp, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Vector SVG & Illustrator production assets extracted', hoursAgo(68));
    insertLog.run(`LOG-${Date.now()}-5`, orderId, clientIp, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Commercial typography license package downloaded', hoursAgo(60));
    insertLog.run(`LOG-${Date.now()}-6`, orderId, clientIp, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Final brand style guide PDF downloaded (Download 6 of 6)', hoursAgo(48));

    const insertChat = db.prepare(`
      INSERT INTO chat_messages (id, order_id, channel, sender, sender_role, message_text, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertChat.run(`CHAT-${Date.now()}-1`, orderId, 'Email', customerName, 'buyer', 'Draft #3 with the modern geometric emblem is approved. Please generate final vector files.', hoursAgo(74));
    insertChat.run(`CHAT-${Date.now()}-2`, orderId, 'Email', 'Merchant Support', 'seller', `Final vector brand assets have been provisioned to your portal link: https://delivery.apexmerchants.com/dl/${orderId}`, hoursAgo(72));
    insertChat.run(`CHAT-${Date.now()}-3`, orderId, 'Email', customerName, 'buyer', 'Downloaded the zip and opened all files in Figma. Looks phenomenal, thank you!', hoursAgo(65));

    return { digitalAssets: fileName, ipLogsCount: 6, verifiedClientIp: clientIp };
  } else if (scenarioKey === 'tiny') {
    // 3. Micro Order: USPS Standard Mailbox Delivery
    const shipmentId = `SHIP-${Date.now()}`;
    const trackingNumber = `9400111899562${Math.floor(1000 + Math.random() * 9000)}`;
    const deliveryOtp = String(Math.floor(100000 + Math.random() * 900000));
    const uniqueDeliveryId = `OTP-DELV-${deliveryOtp}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    db.prepare(`
      INSERT INTO shipments (id, order_id, carrier, tracking_number, status, shipped_at, delivered_at, recipient_signature, delivery_otp, otp_verified, unique_delivery_id, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      shipmentId,
      orderId,
      'USPS',
      trackingNumber,
      'DELIVERED',
      hoursAgo(48),
      hoursAgo(12),
      'Delivered in Mailbox (First Class Letter/Parcel)',
      deliveryOtp,
      uniqueDeliveryId,
      hoursAgo(12)
    );

    db.prepare(`
      INSERT INTO shipment_events (id, shipment_id, event_time, location, description, status_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`EVT-${Date.now()}-1`, shipmentId, hoursAgo(12), 'Local Post Office', 'Delivered in/at Mailbox', 'DELIVERED');

    return { trackingNumber, carrier: 'USPS', status: 'DELIVERED', deliveryOtp, uniqueDeliveryId };
  }

  return {};
}

export default { attachSellerRecordsToOrder };
