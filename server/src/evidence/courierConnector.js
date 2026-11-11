import { BaseConnector } from './connectorInterface.js';
import { db } from '../db/database.js';

export class CourierConnector extends BaseConnector {
  constructor() {
    super('CourierConnector');
  }

  async fetch(orderId) {
    if (!orderId) return null;
    const shipment = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(orderId);
    if (!shipment) return null;

    const events = db.prepare('SELECT * FROM shipment_events WHERE shipment_id = ? ORDER BY event_time ASC').all(shipment.id);

    return {
      shipment_id: shipment.id,
      carrier: shipment.carrier,
      tracking_number: shipment.tracking_number,
      status: shipment.status,
      shipped_at: shipment.shipped_at,
      delivered_at: shipment.delivered_at,
      recipient_signature: shipment.recipient_signature,
      delivery_otp: shipment.delivery_otp,
      otp_verified: Boolean(shipment.otp_verified),
      unique_delivery_id: shipment.unique_delivery_id,
      verified_at: shipment.verified_at,
      events: events.map(e => ({
        id: e.id,
        event_time: e.event_time,
        location: e.location,
        description: e.description,
        status_code: e.status_code
      }))
    };
  }
}

export default new CourierConnector();

