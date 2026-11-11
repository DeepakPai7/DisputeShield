import express from 'express';
import { config, maskSecret } from '../config.js';
import { getCurrentlySelectedModel } from '../ai/modelSelector.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    isSetupRequired: config.isSetupRequired,
    missingVariables: config.missingVariables,
    paypalClientId: config.paypal.clientId,
    paypalClientIdMasked: maskSecret(config.paypal.clientId),
    paypalApiBase: config.paypal.apiBase,
    environment: 'SANDBOX',
    activeGeminiModel: getCurrentlySelectedModel()
  });
});

export default router;
