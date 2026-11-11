import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let selectedModelId = null;
let modelDiscoveryPromise = null;

export const PREFERENCE_LIST = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'];

export async function getSelectedGeminiModel(forceRefresh = false) {
  if (!forceRefresh && selectedModelId) {
    return selectedModelId;
  }

  if (modelDiscoveryPromise) {
    return modelDiscoveryPromise;
  }

  modelDiscoveryPromise = (async () => {
    if (!config.geminiApiKey || config.isSetupRequired) {
      selectedModelId = 'gemini-3.8-flash';
      return selectedModelId;
    }

    try {
      logger.info('Discovering active Gemini model from preference list:', { preferences: PREFERENCE_LIST });
      const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

      // Try each model in preference list with backoff and timeout
      for (const candidate of PREFERENCE_LIST) {
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout probing model ${candidate}`)), 8000)
          );
          const callPromise = ai.models.generateContent({
            model: candidate,
            contents: 'ping'
          });
          const testRes = await Promise.race([callPromise, timeoutPromise]);
          if (testRes.text) {
            selectedModelId = candidate;
            logger.info(`Successfully verified and selected active Gemini model: "${selectedModelId}"`);
            return selectedModelId;
          }
        } catch (candidateErr) {
          logger.warn(`Model candidate "${candidate}" unavailable: ${candidateErr.message}`);
        }
      }

      // Default to first preference if all checks hit temporary rate limits
      selectedModelId = PREFERENCE_LIST[0];
      logger.info(`Using primary default model: "${selectedModelId}"`);
      return selectedModelId;
    } catch (err) {
      logger.error('Error during Gemini model discovery:', { message: err.message });
      selectedModelId = PREFERENCE_LIST[0];
      return selectedModelId;
    } finally {
      modelDiscoveryPromise = null;
    }
  })();

  return modelDiscoveryPromise;
}

export function getCurrentlySelectedModel() {
  return selectedModelId || PREFERENCE_LIST[0];
}

export default { getSelectedGeminiModel, getCurrentlySelectedModel, PREFERENCE_LIST };
