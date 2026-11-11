import express from 'express';
import { db } from '../db/database.js';
import { config } from '../config.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const dbCheck = db.prepare('SELECT 1 as alive').get();
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      mode: config.mode,
      database: dbCheck.alive === 1 ? 'connected' : 'error'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;

