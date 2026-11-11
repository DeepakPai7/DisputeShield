import { BaseConnector } from './connectorInterface.js';
import { db } from '../db/database.js';

export class DigitalDeliveryConnector extends BaseConnector {
  constructor() {
    super('DigitalDeliveryConnector');
  }

  async fetch(orderId) {
    if (!orderId) return { files: [], accessLogs: [] };
    const files = db.prepare('SELECT * FROM delivery_files WHERE order_id = ? ORDER BY delivered_at ASC').all(orderId);
    const logs = db.prepare('SELECT * FROM access_logs WHERE order_id = ? ORDER BY logged_at ASC').all(orderId);

    return {
      files: files.map(f => ({
        id: f.id,
        file_name: f.file_name,
        file_size: f.file_size,
        file_hash: f.file_hash,
        delivery_url: f.delivery_url,
        delivered_at: f.delivered_at
      })),
      access_logs: logs.map(l => ({
        id: l.id,
        ip_address: l.ip_address,
        user_agent: l.user_agent,
        action: l.action,
        logged_at: l.logged_at
      }))
    };
  }
}

export default new DigitalDeliveryConnector();

