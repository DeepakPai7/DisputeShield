import express from 'express';
import { db } from '../db/database.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const rows = db.prepare(`
      SELECT id, kind, endpoint_or_tool, http_status, duration_ms, dispute_id, details_json, created_at
      FROM paypal_api_log
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);

    const parsed = rows.map(r => ({
      ...r,
      details: r.details_json ? JSON.parse(r.details_json) : null
    }));

    res.json(parsed);
  } catch (err) {
    logger.error('Failed to query paypal_api_log:', { message: err.message });
    res.status(500).json({ error: 'Failed to fetch PayPal API logs', message: err.message });
  }
});

export default router;

