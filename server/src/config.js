import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function cleanEnv(val) {
  if (typeof val !== 'string') return '';
  return val.trim();
}

function isPlaceholder(val) {
  if (!val) return true;
  const cleaned = val.trim();
  if (cleaned.length === 0) return true;
  if (cleaned.toLowerCase().startsWith('paste_your_actual')) return true;
  if (cleaned.toLowerCase().includes('paste_your')) return true;
  if (cleaned.toLowerCase().includes('your_actual')) return true;
  return false;
}

export function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return 'none';
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

const rawClientId = cleanEnv(process.env.PAYPAL_CLIENT_ID);
const rawClientSecret = cleanEnv(process.env.PAYPAL_CLIENT_SECRET);
const rawBaseUrl = cleanEnv(process.env.PAYPAL_API_BASE) || 'https://api-m.sandbox.paypal.com';
const rawGeminiKey = cleanEnv(process.env.GEMINI_API_KEY);
const rawChannel3Key = cleanEnv(process.env.CHANNEL3_API_KEY);

// Missing variables check
const missingVariables = [];
if (isPlaceholder(rawClientId)) {
  missingVariables.push({
    key: 'PAYPAL_CLIENT_ID',
    description: 'PayPal REST App Client ID from developer.paypal.com/dashboard/applications/sandbox',
    source: 'https://developer.paypal.com/dashboard/applications/sandbox'
  });
}
if (isPlaceholder(rawClientSecret)) {
  missingVariables.push({
    key: 'PAYPAL_CLIENT_SECRET',
    description: 'PayPal REST App Secret with Disputes feature enabled',
    source: 'https://developer.paypal.com/dashboard/applications/sandbox'
  });
}
if (isPlaceholder(rawGeminiKey)) {
  missingVariables.push({
    key: 'GEMINI_API_KEY',
    description: 'Google Gemini API Key from Google AI Studio',
    source: 'https://aistudio.google.com'
  });
}

// Sandbox validation
const EXPECTED_SANDBOX_URL = 'https://api-m.sandbox.paypal.com';
if (rawBaseUrl && !rawBaseUrl.includes('sandbox.paypal.com')) {
  console.error(`[FATAL] DisputeShield is strictly sandbox-only. Invalid PAYPAL_API_BASE: ${rawBaseUrl}`);
  process.exit(1);
}

export const IS_SETUP_REQUIRED = missingVariables.length > 0;
export const FX_INR_USD = 0.012; // 1 INR ~ 0.012 USD
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_MODEL_PREFERENCE = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'];

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  isSetupRequired: IS_SETUP_REQUIRED,
  missingVariables,
  fxInrUsd: FX_INR_USD,
  modelPreferences: DEFAULT_MODEL_PREFERENCE,
  geminiApiKey: rawGeminiKey,
  channel3ApiKey: rawChannel3Key,
  isChannel3Configured: !isPlaceholder(rawChannel3Key),
  channel3: {
    apiKey: rawChannel3Key,
    isConfigured: !isPlaceholder(rawChannel3Key),
    apiBase: 'https://api.trychannel3.com'
  },
  paypal: {
    clientId: rawClientId,
    clientSecret: rawClientSecret,
    apiBase: EXPECTED_SANDBOX_URL,
  },
  dbPath: path.resolve(__dirname, '../disputeshield.db'),
  uploadDir: path.resolve(__dirname, '../uploads'),

  // Public status safe for frontend consumption
  getPublicStatus() {
    return {
      isSetupRequired: this.isSetupRequired,
      missingVariables: this.missingVariables,
      paypalApiBase: this.paypal.apiBase,
      paypalClientId: this.paypal.clientId, // Client ID is safe for PayPal JS SDK
      isChannel3Configured: this.isChannel3Configured,
      environment: 'SANDBOX'
    };
  },

  getSanitizedDebugInfo() {
    return {
      isSetupRequired: this.isSetupRequired,
      missingCount: this.missingVariables.length,
      paypalClientIdMasked: maskSecret(this.paypal.clientId),
      paypalClientSecretMasked: maskSecret(this.paypal.clientSecret),
      geminiApiKeyMasked: maskSecret(this.geminiApiKey),
      channel3ApiKeyMasked: maskSecret(this.channel3ApiKey),
      isChannel3Configured: this.isChannel3Configured,
      paypalApiBase: this.paypal.apiBase,
      environment: 'SANDBOX'
    };
  }
};

export default config;
