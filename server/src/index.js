import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { logger } from './utils/logger.js';
import { initDatabase } from './db/database.js';
import { startDisputePoller } from './poller/disputePoller.js';

// Route imports
import healthRoutes from './routes/health.js';
import configRoutes from './routes/configRoutes.js';
import diagnosticsRoutes from './routes/diagnostics.js';
import storeRoutes from './routes/store.js';
import disputeRoutes from './routes/disputes.js';
import evidenceRoutes from './routes/evidence.js';
import statsRoutes from './routes/stats.js';
import settingsRoutes from './routes/settings.js';
import auditRoutes from './routes/audit.js';
import paypalLogsRoutes from './routes/paypalLogs.js';
import webhookRoutes from './routes/webhooks.js';
import chatRoutes from './routes/chat.js';
import shopRoutes from './routes/shop.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security & Parsing
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration: allow CLIENT_ORIGIN (exact match, no trailing slash) and http://localhost:5173
const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
if (process.env.CLIENT_ORIGIN) {
  const envOrigins = process.env.CLIENT_ORIGIN.split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  for (const o of envOrigins) {
    if (!allowedOrigins.includes(o)) {
      allowedOrigins.push(o);
    }
  }
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Static uploads directory
app.use('/uploads', express.static(config.uploadDir));

// Setup Required Gate Middleware
app.use((req, res, next) => {
  // Always permit health and config status
  if (req.path.startsWith('/api/health') || req.path.startsWith('/health') || req.path.startsWith('/api/config')) {
    return next();
  }

  if (config.isSetupRequired) {
    return res.status(503).json({
      error: 'Setup Required',
      message: 'One or more required environment variables are unconfigured or placeholder values.',
      isSetupRequired: true,
      missingVariables: config.missingVariables
    });
  }

  next();
});

// Mount API routes
app.use('/api/health', healthRoutes);
app.use('/health', healthRoutes);
app.use('/api/config', configRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/disputes', evidenceRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/paypal-logs', paypalLogsRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/shop', shopRoutes);

// Centralized error handling
app.use((err, req, res, next) => {
  logger.error(`Unhandled error on ${req.method} ${req.url}:`, {
    message: err.message,
    stack: err.stack
  });
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Bootstrap
function bootstrap() {
  logger.info('Starting DisputeShield AI Backend (PayPal AI Hackathon Engine)...');
  logger.info(`Runtime Environment: Environment = SANDBOX | Gemini Active = ${config.isAiOnline}`);

  // Initialize DB schema & indexes
  initDatabase();

  // Start background dispute poller
  startDisputePoller();

  const PORT = process.env.PORT || config.port || 5000;
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`DisputeShield AI Server listening on http://0.0.0.0:${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/api/health`);
    logger.info(`Config status: http://localhost:${PORT}/api/config/status`);
    logger.info(`Diagnostics: http://localhost:${PORT}/api/diagnostics`);
  });
}

bootstrap();

export default app;
