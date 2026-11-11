import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { recordPayPalApiLog } from '../db/database.js';

const CHANNEL3_BASE_URL = 'https://api.trychannel3.com';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache per API guidelines

// In-memory caches to save API credits
const searchCache = new Map();
const productCache = new Map();

/**
 * Normalizes a Channel3 raw product object to a safe, predictable shape
 */
export function normalizeProduct(raw) {
  if (!raw || !raw.id) return null;

  const id = raw.id;
  const title = raw.title || 'Untitled Product';
  
  // Extract brand name
  let brand = 'Unbranded';
  if (Array.isArray(raw.brands) && raw.brands.length > 0) {
    brand = typeof raw.brands[0] === 'object' ? (raw.brands[0].name || 'Unbranded') : String(raw.brands[0]);
  } else if (raw.brand) {
    brand = typeof raw.brand === 'object' ? (raw.brand.name || 'Unbranded') : String(raw.brand);
  }

  // Description
  const description = (raw.description || '').replace(/<[^>]*>?/gm, '').trim().slice(0, 450);

  // Main Image URL
  let image_url = null;
  if (Array.isArray(raw.images) && raw.images.length > 0) {
    image_url = typeof raw.images[0] === 'object' ? raw.images[0].url : String(raw.images[0]);
  } else if (raw.image_url) {
    image_url = raw.image_url;
  }

  // Filter in-stock offers with a valid price
  const offers = Array.isArray(raw.offers) ? raw.offers : [];
  const validOffers = offers.filter(o => {
    const isAvail = !o.availability || o.availability === 'InStock' || o.availability === 'in_stock';
    const hasPrice = o.price && typeof o.price.price === 'number' && o.price.price > 0;
    return isAvail && hasPrice;
  });

  if (validOffers.length === 0) {
    // If no explicit in-stock offer, fallback to any offer with price if present
    const anyOfferWithPrice = offers.filter(o => o.price && typeof o.price.price === 'number' && o.price.price > 0);
    if (anyOfferWithPrice.length === 0) return null;
    validOffers.push(...anyOfferWithPrice);
  }

  // Pick cheapest offer for display and sandbox checkout
  validOffers.sort((a, b) => a.price.price - b.price.price);
  const bestOffer = validOffers[0];

  return {
    id,
    title,
    brand,
    description,
    image_url,
    price: Number(bestOffer.price.price.toFixed(2)),
    currency: bestOffer.price.currency || 'USD',
    domain: bestOffer.domain || 'retailer.com',
    offer_url: bestOffer.url || null,
    offers_count: offers.length
  };
}

/**
 * Execute HTTP request to Channel3 with automatic retry on 429/5xx and duration logging
 */
async function callChannel3Api(endpoint, options = {}) {
  const apiKey = config.channel3ApiKey;
  if (!apiKey || !config.isChannel3Configured) {
    throw new Error('Channel3 API key is not configured or placeholder.');
  }

  const url = `${CHANNEL3_BASE_URL}${endpoint}`;
  const maxRetries = 1;
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    const start = Date.now();
    let status = null;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });

      status = response.status;
      const durationMs = Date.now() - start;

      // Log activity to API log
      recordPayPalApiLog({
        kind: 'channel3',
        endpointOrTool: endpoint,
        httpStatus: status,
        durationMs,
        details: { method: options.method || 'GET', attempt }
      });

      if (response.ok) {
        return await response.json();
      }

      // Handle specific error codes
      if (status === 401) {
        throw new Error('Channel3 Authentication Failed: Invalid API key.');
      }
      if (status === 402) {
        throw new Error('Channel3 credits exhausted.');
      }
      if (status === 404) {
        throw new Error('Product not found in Channel3 catalog.');
      }

      // If rate limited or server error, retry once with backoff
      if ((status === 429 || status >= 500) && attempt < maxRetries) {
        attempt++;
        logger.warn(`[CHANNEL3] Request to ${endpoint} returned ${status}, retrying in 1000ms...`);
        await new Promise(res => setTimeout(res, 1000));
        continue;
      }

      const errText = await response.text();
      throw new Error(`Channel3 API Error (${status}): ${errText.slice(0, 200)}`);
    } catch (err) {
      lastError = err;
      const durationMs = Date.now() - start;

      if (!status) {
        recordPayPalApiLog({
          kind: 'channel3',
          endpointOrTool: endpoint,
          httpStatus: 0,
          durationMs,
          details: { error: err.message, attempt }
        });
      }

      if (attempt < maxRetries && (err.message.includes('fetch failed') || err.message.includes('ECONNRESET'))) {
        attempt++;
        await new Promise(res => setTimeout(res, 1000));
        continue;
      }
      break;
    }
  }

  throw lastError;
}

export class Channel3Client {
  /**
   * Search Channel3 product graph
   * Limits prices to <= 300 USD for smooth PayPal sandbox checkout
   */
  async searchProducts(query, { limit = 8 } = {}) {
    const q = (query || 'winter jacket').trim().toLowerCase();
    const cacheKey = `${q}__limit_${limit}`;
    const now = Date.now();

    // Check in-memory cache
    if (searchCache.has(cacheKey)) {
      const cached = searchCache.get(cacheKey);
      if (cached.expiresAt > now) {
        logger.info(`[CHANNEL3 CACHE] Serving cached search results for "${q}"`);
        return cached.data;
      }
    }

    logger.info(`[CHANNEL3] Searching products for query: "${q}"...`);

    const payload = {
      query: q,
      limit: Math.min(limit * 2, 24), // Fetch slightly more to filter out-of-stock
      filters: {
        price: { max_price: 300 },
        availability: ['InStock'],
        conditions: ['new']
      },
      config: {
        country: 'US',
        currency: 'USD',
        mode: 'default'
      }
    };

    const data = await callChannel3Api('/v1/search', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const rawProducts = data.products || [];
    const normalized = [];

    for (const raw of rawProducts) {
      const p = normalizeProduct(raw);
      if (p) normalized.push(p);
      if (normalized.length >= limit) break;
    }

    const result = {
      query: q,
      total: normalized.length,
      products: normalized
    };

    // Cache results for 10 minutes
    searchCache.set(cacheKey, {
      data: result,
      expiresAt: now + CACHE_TTL_MS
    });

    return result;
  }

  /**
   * Get product details by product ID
   */
  async getProduct(productId) {
    if (!productId) throw new Error('Product ID is required');

    const cacheKey = `product_${productId}`;
    const now = Date.now();

    if (productCache.has(cacheKey)) {
      const cached = productCache.get(cacheKey);
      if (cached.expiresAt > now) {
        logger.info(`[CHANNEL3 CACHE] Serving cached product detail for ${productId}`);
        return cached.data;
      }
    }

    logger.info(`[CHANNEL3] Fetching product detail for ${productId}...`);
    const raw = await callChannel3Api(`/v1/products/${encodeURIComponent(productId)}`);
    const normalized = normalizeProduct(raw);

    if (!normalized) {
      throw new Error(`Product ${productId} has no valid in-stock offers.`);
    }

    productCache.set(cacheKey, {
      data: normalized,
      expiresAt: now + CACHE_TTL_MS
    });

    return normalized;
  }
}

export const channel3Client = new Channel3Client();
export default channel3Client;

