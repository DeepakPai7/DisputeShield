import { BaseConnector } from './connectorInterface.js';
import { db } from '../db/database.js';

export class ChatConnector extends BaseConnector {
  constructor() {
    super('ChatConnector');
  }

  async fetch(orderId) {
    if (!orderId) return [];
    const rows = db.prepare('SELECT * FROM chat_messages WHERE order_id = ? ORDER BY sent_at ASC').all(orderId);
    return rows.map(r => ({
      id: r.id,
      channel: r.channel,
      sender: r.sender,
      sender_role: r.sender_role || 'buyer',
      message_text: r.message_text,
      sent_at: r.sent_at
    }));
  }
}

export default new ChatConnector();

