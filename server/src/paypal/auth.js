import axios from 'axios';
import { config, maskSecret } from '../config.js';
import { logger } from '../utils/logger.js';
import { recordPayPalApiLog } from '../db/database.js';

let cachedToken = null;
let tokenExpiresAt = 0;

export async function getPayPalAccessToken(forceRefresh = false) {
  const now = Date.now();
  // Return cached token if still valid for at least 60 seconds
  if (!forceRefresh && cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  if (config.isSetupRequired) {
    throw new Error('PayPal credentials missing or placeholder. Setup required in server/.env.');
  }

  const clientId = config.paypal.clientId;
  const clientSecret = config.paypal.clientSecret;
  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const startTime = Date.now();

  try {
    logger.info(`Authenticating with PayPal OAuth2 (${config.paypal.apiBase}/v1/oauth2/token)...`);
    const response = await axios.post(
      `${config.paypal.apiBase}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 12000
      }
    );

    const durationMs = Date.now() - startTime;
    cachedToken = response.data.access_token;
    const expiresIn = response.data.expires_in || 3600;
    tokenExpiresAt = now + (expiresIn * 1000);

    recordPayPalApiLog({
      kind: 'rest',
      endpointOrTool: 'POST /v1/oauth2/token',
      httpStatus: response.status,
      durationMs,
      details: { scope: response.data.scope, expires_in: expiresIn }
    });

    logger.info(`PayPal OAuth2 token acquired successfully. Expires in ${expiresIn}s.`);
    return cachedToken;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const status = err.response?.status;
    const errData = err.response?.data;

    recordPayPalApiLog({
      kind: 'rest',
      endpointOrTool: 'POST /v1/oauth2/token',
      httpStatus: status || 500,
      durationMs,
      details: { error: errData?.error || err.message, description: errData?.error_description }
    });

    logger.error('PayPal OAuth2 Authentication Failed:', {
      status,
      error: errData?.error,
      description: errData?.error_description,
      clientIdMasked: maskSecret(clientId)
    });

    throw new Error(`PayPal OAuth Authentication Failed (${status || 'Network'}): ${errData?.error_description || err.message}`);
  }
}

export function clearTokenCache() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

export function getTokenInfo() {
  const now = Date.now();
  return {
    hasToken: Boolean(cachedToken),
    isValid: Boolean(cachedToken && tokenExpiresAt > now),
    expiresInSeconds: cachedToken ? Math.max(0, Math.round((tokenExpiresAt - now) / 1000)) : 0
  };
}

export default { getPayPalAccessToken, clearTokenCache, getTokenInfo };
