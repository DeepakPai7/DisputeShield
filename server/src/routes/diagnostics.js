import express from 'express';
import { runDiagnostics } from '../services/diagnosticsService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const diag = await runDiagnostics(force);
    res.json(diag);
  } catch (err) {
    logger.error('Failed to run diagnostics endpoint:', { message: err.message });
    res.status(500).json({
      error: 'Diagnostics evaluation failed',
      message: err.message
    });
  }
});

export default router;

