import express from 'express';
import { db, recordAuditLog } from '../db/database.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/chat/:orderId
 * Fetch all chat messages for a specific order / customer
 */
router.get('/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const messages = db.prepare(`
      SELECT * FROM chat_messages 
      WHERE order_id = ? 
      ORDER BY datetime(sent_at) ASC, id ASC
    `).all(orderId);

    res.json({
      success: true,
      order_id: orderId,
      messages: messages || []
    });
  } catch (err) {
    logger.error(`Error fetching chat for order ${req.params.orderId}:`, { message: err.message });
    res.status(500).json({ error: 'Failed to fetch chat messages: ' + err.message });
  }
});

/**
 * POST /api/chat/:orderId
 * Send a new chat message (from buyer or seller)
 */
router.post('/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      sender_role = 'buyer',
      sender_name = 'Customer',
      message_text,
      channel = 'Live Chat',
      dispute_id = null
    } = req.body;

    if (!message_text || !message_text.trim()) {
      return res.status(400).json({ error: 'Message text cannot be empty' });
    }

    // Verify order exists
    const order = db.prepare('SELECT id, customer_name FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const messageId = `CHAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const nowIso = new Date().toISOString();
    const sender = sender_role === 'seller' ? 'Store Support' : (sender_name || order.customer_name);

    db.prepare(`
      INSERT INTO chat_messages (id, order_id, channel, sender, sender_role, dispute_id, message_text, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      messageId,
      orderId,
      channel,
      sender,
      sender_role,
      dispute_id,
      message_text.trim(),
      nowIso
    );

    recordAuditLog({
      disputeId: dispute_id,
      actor: sender_role === 'seller' ? 'Seller' : 'Buyer',
      action: 'Chat Message Sent',
      details: {
        order_id: orderId,
        sender,
        sender_role,
        messageId,
        snippet: message_text.trim().slice(0, 80)
      }
    });

    const createdMsg = {
      id: messageId,
      order_id: orderId,
      channel,
      sender,
      sender_role,
      dispute_id,
      message_text: message_text.trim(),
      sent_at: nowIso
    };

    logger.info(`[CHAT] Message sent for order ${orderId} by ${sender} (${sender_role})`);
    res.json({
      success: true,
      message: createdMsg
    });
  } catch (err) {
    logger.error(`Error sending chat message for ${req.params.orderId}:`, { message: err.message });
    res.status(500).json({ error: 'Failed to send chat message: ' + err.message });
  }
});

export default router;

