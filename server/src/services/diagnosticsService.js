import { config, maskSecret } from '../config.js';
import { getPayPalAccessToken, getTokenInfo } from '../paypal/auth.js';
import { getPayPalMcpClient, getMcpStatus } from '../paypal/mcpClient.js';
import { restClient } from '../paypal/restClient.js';
import { GoogleGenAI } from '@google/genai';
import { db } from '../db/database.js';
import { channel3Client } from '../channel3/client.js';
import { logger } from '../utils/logger.js';

let cachedDiagnostics = null;
let cacheExpiresAt = 0;

export async function runDiagnostics(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedDiagnostics && cacheExpiresAt > now) {
    return cachedDiagnostics;
  }

  logger.info('Running live integration diagnostics across PayPal OAuth, MCP, Sandbox API, Gemini & Database...');

  const results = {
    timestamp: new Date().toISOString(),
    overallStatus: 'healthy',
    environment: {
      isSandbox: config.paypal.apiBase.includes('sandbox'),
      apiBase: config.paypal.apiBase,
      isSetupRequired: config.isSetupRequired,
      missingVariables: config.missingVariables
    },
    paypalOAuth: {
      status: 'pending',
      authenticated: false,
      expiresInSeconds: 0,
      clientIdMasked: maskSecret(config.paypal.clientId),
      error: null
    },
    paypalMcp: {
      status: 'pending',
      connected: false,
      toolCount: 0,
      tools: [],
      error: null
    },
    paypalDisputesApi: {
      status: 'pending',
      disputeCount: 0,
      error: null
    },
    geminiAi: {
      status: 'pending',
      modelId: null,
      availableModels: [],
      testPromptLatencyMs: 0,
      error: null
    },
    database: {
      status: 'pending',
      disputesBySource: {},
      totalDisputes: 0,
      totalOrders: 0
    },
    channel3: {
      status: 'pending',
      configured: false,
      keyMasked: maskSecret(config.channel3ApiKey),
      productsFound: 0,
      latencyMs: 0,
      error: null
    }
  };

  // 1. PayPal OAuth Check
  try {
    await getPayPalAccessToken(forceRefresh);
    const info = getTokenInfo();
    results.paypalOAuth.status = 'ok';
    results.paypalOAuth.authenticated = true;
    results.paypalOAuth.expiresInSeconds = info.expiresInSeconds;
  } catch (err) {
    results.paypalOAuth.status = 'error';
    results.paypalOAuth.error = err.message;
    results.overallStatus = 'degraded';
  }

  // 2. PayPal MCP Server Check
  try {
    const { tools } = await getPayPalMcpClient(forceRefresh);
    results.paypalMcp.status = 'ok';
    results.paypalMcp.connected = true;
    results.paypalMcp.toolCount = tools.length;
    results.paypalMcp.tools = tools.map(t => t.name);
  } catch (err) {
    results.paypalMcp.status = 'error';
    results.paypalMcp.error = err.message;
    results.overallStatus = 'degraded';
  }

  // 3. Real PayPal Sandbox List Disputes Call
  try {
    const disputesRes = await restClient.listDisputes({ dispute_state: 'REQUIRED_ACTION' });
    results.paypalDisputesApi.status = 'ok';
    results.paypalDisputesApi.disputeCount = (disputesRes.items || []).length;
  } catch (err) {
    results.paypalDisputesApi.status = 'error';
    results.paypalDisputesApi.error = err.message;
    results.overallStatus = 'degraded';
  }

  // 4. Gemini AI Model List & Minimal Generation Check
  try {
    if (!config.geminiApiKey || config.isSetupRequired) {
      throw new Error('Gemini API key is unconfigured or placeholder.');
    }

    const { getSelectedGeminiModel } = await import('../ai/modelSelector.js');
    const selectedModel = await getSelectedGeminiModel(forceRefresh);
    results.geminiAi.modelId = selectedModel;

    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    const startAi = Date.now();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini ping timed out after 10000ms')), 10000)
    );
    const testGen = await Promise.race([
      ai.models.generateContent({
        model: selectedModel,
        contents: 'Respond with exactly: OK'
      }),
      timeoutPromise
    ]);

    results.geminiAi.testPromptLatencyMs = Date.now() - startAi;
    if (testGen.text && testGen.text.trim()) {
      results.geminiAi.status = 'ok';
    } else {
      results.geminiAi.status = 'error';
      results.geminiAi.error = 'Gemini returned empty response.';
      results.overallStatus = 'degraded';
    }
  } catch (err) {
    results.geminiAi.status = 'error';
    results.geminiAi.error = err.message;
    results.overallStatus = 'degraded';
  }

  // 5. Database Truth Check
  try {
    const rows = db.prepare('SELECT source, COUNT(*) as count FROM disputes GROUP BY source').all();
    const bySource = {};
    for (const r of rows) {
      bySource[r.source] = r.count;
    }
    results.database.disputesBySource = bySource;
    results.database.totalDisputes = db.prepare('SELECT COUNT(*) as count FROM disputes').get().count;
    results.database.totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    results.database.status = 'ok';
  } catch (err) {
    results.database.status = 'error';
    results.database.error = err.message;
  }

  // 6. Channel3 Product Graph API Check
  try {
    if (!config.isChannel3Configured) {
      results.channel3.status = 'warning';
      results.channel3.configured = false;
      results.channel3.error = 'Channel3 API key not configured (using practice products).';
    } else {
      results.channel3.configured = true;
      const startC3 = Date.now();
      const c3Res = await channel3Client.searchProducts('jacket', { limit: 2 });
      results.channel3.latencyMs = Date.now() - startC3;
      results.channel3.productsFound = c3Res.products.length;
      results.channel3.status = 'ok';
    }
  } catch (err) {
    results.channel3.status = 'error';
    results.channel3.error = err.message;
    results.overallStatus = 'degraded';
  }

  cachedDiagnostics = results;
  cacheExpiresAt = now + 30000; // cache 30s
  return results;
}

export default { runDiagnostics };
