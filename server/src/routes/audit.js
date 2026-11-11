import express from 'express';
import { db } from '../db/database.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const rows = db.prepare(`
      SELECT a.*, d.paypal_dispute_id, d.reason, d.dispute_amount, d.dispute_currency
      FROM audit_log a
      LEFT JOIN disputes d ON a.dispute_id = d.id
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(limit);

    const formatted = rows.map(r => {
      let details = {};
      try {
        details = JSON.parse(r.details_json || '{}');
      } catch (e) {
        details = { raw: r.details_json };
      }
      return {
        id: r.id,
        dispute_id: r.dispute_id,
        paypal_dispute_id: r.paypal_dispute_id,
        actor: r.actor,
        action: r.action,
        previous_hash: r.previous_hash,
        hash: r.hash,
        details,
        created_at: r.created_at
      };
    });

    res.json({
      type: 'Append-only cryptographic hash chain',
      logs: formatted,
      count: formatted.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve audit log: ' + err.message });
  }
});

export default router;
