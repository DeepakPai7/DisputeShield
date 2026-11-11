import { GoogleGenAI } from '@google/genai';
import { config, GEMINI_MODEL } from '../config.js';
import { logger } from '../utils/logger.js';
import { buildSystemPrompt, buildUserPrompt } from './prompts.js';

let genAIClient = null;

export function getGenAIClient() {
  if (!config.isAiOnline) return null;
  if (!genAIClient) {
    try {
      genAIClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
    } catch (e) {
      logger.error('Failed to instantiate GoogleGenAI client:', { message: e.message });
      return null;
    }
  }
  return genAIClient;
}

export async function generateDisputeAnalysisWithGemini({
  dispute,
  evidencePacket,
  sellerSettings = {},
  customInstruction = null,
  model = GEMINI_MODEL
}) {
  const client = getGenAIClient();
  if (!client) {
    throw new Error('Gemini API is offline or key is unconfigured.');
  }

  const systemInstruction = buildSystemPrompt();
  const userPrompt = buildUserPrompt(dispute, evidencePacket, sellerSettings, customInstruction);

  logger.info(`Sending prompt to Gemini (${model}) for dispute ${dispute.paypal_dispute_id}...`);

  try {
    const response = await client.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.1,
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Gemini returned an empty response.');
    }

    const parsed = JSON.parse(responseText);
    return {
      success: true,
      data: parsed,
      model,
      raw: responseText
    };
  } catch (err) {
    logger.error('Gemini API execution error:', { message: err.message, stack: err.stack });
    return {
      success: false,
      error: err.message
    };
  }
}

export default { generateDisputeAnalysisWithGemini, getGenAIClient };

