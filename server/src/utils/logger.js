import { maskSecret } from '../config.js';

function sanitize(data) {
  if (!data) return data;
  if (typeof data === 'string') {
    // Mask potential API keys or tokens in strings
    return data.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
               .replace(/AQ\.[A-Za-z0-9._-]+/gi, '[REDACTED_GEMINI_KEY]');
  }
  if (typeof data === 'object') {
    const copy = Array.isArray(data) ? [] : {};
    for (const [k, v] of Object.entries(data)) {
      if (/secret|token|password|key|authorization/i.test(k) && typeof v === 'string') {
        copy[k] = maskSecret(v);
      } else {
        copy[k] = sanitize(v);
      }
    }
    return copy;
  }
  return data;
}

export const logger = {
  info(msg, meta = {}) {
    console.log(`[INFO] [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? sanitize(meta) : '');
  },
  warn(msg, meta = {}) {
    console.warn(`[WARN] [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? sanitize(meta) : '');
  },
  error(msg, meta = {}) {
    console.error(`[ERROR] [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? sanitize(meta) : '');
  },
  debug(msg, meta = {}) {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? sanitize(meta) : '');
    }
  }
};

export default logger;

