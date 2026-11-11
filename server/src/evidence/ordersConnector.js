import { BaseConnector } from './connectorInterface.js';
import { db } from '../db/database.js';

export class OrdersConnector extends BaseConnector {
  constructor() {
    super('OrdersConnector');
  }

  async fetch(orderId) {
    if (!orderId) return null;
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!row) return null;

    let items = [];
    try {
      items = JSON.parse(row.items_json || '[]');
    } catch (e) {
      items = [];
    }

    let shippingAddress = {};
    try {
      shippingAddress = JSON.parse(row.shipping_address_json || '{}');
    } catch (e) {
      shippingAddress = {};
    }

    return {
      order_id: row.id,
      customer_name: row.customer_name,
      customer_email: row.customer_email,
      items,
      total_amount: row.total_amount,
      currency: row.currency,
      shipping_address: shippingAddress,
      order_date: row.order_date,
      payment_date: row.payment_date,
      payment_reference: row.payment_reference
    };
  }
}

export default new OrdersConnector();

