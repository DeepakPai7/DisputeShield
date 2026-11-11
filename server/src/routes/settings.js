import express from 'express';
import { db } from '../db/database.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

router.put('/', (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }

    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    const nowIso = new Date().toISOString();

    for (const [key, value] of Object.entries(updates)) {
      stmt.run(key, String(value), nowIso);
    }

    logger.info('Seller settings updated:', updates);
    res.json({ success: true, message: 'Settings successfully updated', settings: updates });
  } catch (err) {
    logger.error('Failed to update settings:', { message: err.message });
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;

