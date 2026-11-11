import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getPayPalAccessToken, clearTokenCache } from './auth.js';
import { recordPayPalApiLog } from '../db/database.js';

export class PayPalRestClient {
  constructor() {
    this.apiBase = config.paypal.apiBase;
  }

  async _request({ method, endpoint, data = null, headers = {}, disputeId = null, retryCount = 0 }) {
    const startTime = Date.now();
    let token = '';

    try {
      token = await getPayPalAccessToken();
    } catch (authErr) {
      recordPayPalApiLog({
        kind: 'rest',
        endpointOrTool: `${method} ${endpoint}`,
        httpStatus: 401,
        durationMs: Date.now() - startTime,
        disputeId,
        details: { authError: authErr.message }
      });
      throw authErr;
    }

    const url = `${this.apiBase}${endpoint}`;
    const requestHeaders = {
      'Authorization': `Bearer ${token}`,
      ...headers
    };

    try {
      const response = await axios({
        method,
        url,
        data,
        headers: requestHeaders,
        timeout: 20000
      });

      const durationMs = Date.now() - startTime;
      recordPayPalApiLog({
        kind: 'rest',
        endpointOrTool: `${method} ${endpoint}`,
        httpStatus: response.status,
        durationMs,
        disputeId,
        details: { statusText: response.statusText }
      });

      return response.data;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const status = err.response?.status;
      const resData = err.response?.data;

      // Token expired -> refresh & retry once
      if (status === 401 && retryCount === 0) {
        logger.warn(`PayPal REST 401 on ${endpoint}. Refreshing token and retrying...`);
        clearTokenCache();
        return this._request({ method, endpoint, data, headers, disputeId, retryCount: 1 });
      }

      // Rate limit backoff
      if (status === 429 && retryCount < 2) {
        const delay = Math.pow(2, retryCount) * 1000;
        logger.warn(`PayPal rate limit 429 on ${endpoint}. Backing off ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        return this._request({ method, endpoint, data, headers, disputeId, retryCount: retryCount + 1 });
      }

      recordPayPalApiLog({
        kind: 'rest',
        endpointOrTool: `${method} ${endpoint}`,
        httpStatus: status || 500,
        durationMs,
        disputeId,
        details: {
          error: err.message,
          paypalName: resData?.name,
          paypalMessage: resData?.message,
          details: resData?.details
        }
      });

      logger.error(`PayPal REST Error (${status || 'Network'}) on ${method} ${endpoint}:`, {
        name: resData?.name,
        message: resData?.message || err.message,
        details: resData?.details
      });

      const error = new Error(`PayPal REST Error [${status || 'NET'}]: ${resData?.message || err.message}`);
      error.status = status;
      error.paypalData = resData;
      throw error;
    }
  }

  // --- DISPUTES ---
  async listDisputes(params = {}) {
    const qs = new URLSearchParams();
    if (params.dispute_state) qs.append('dispute_state', params.dispute_state);
    if (params.update_time_after) qs.append('update_time_after', params.update_time_after);
    if (params.next_page_token) qs.append('next_page_token', params.next_page_token);
    const query = qs.toString() ? `?${qs.toString()}` : '';

    return this._request({
      method: 'GET',
      endpoint: `/v1/customer/disputes${query}`
    });
  }

  async getDispute(disputeId) {
    return this._request({
      method: 'GET',
      endpoint: `/v1/customer/disputes/${encodeURIComponent(disputeId)}`,
      disputeId
    });
  }

  async provideEvidence(disputeId, { evidences, notes, fileBuffer = null, filePath = null, fileName = 'evidence_packet.pdf' }) {
    const form = new FormData();
    const inputPayload = {
      evidences: evidences || [
        {
          evidence_type: 'PROOF_OF_FULFILLMENT',
          notes: notes || 'Merchant contemporaneous defense evidence packet'
        }
      ]
    };

    form.append('input', JSON.stringify(inputPayload), {
      contentType: 'application/json'
    });

    if (fileBuffer) {
      form.append('evidence-file', fileBuffer, {
        filename: fileName,
        contentType: 'application/pdf'
      });
    } else if (filePath && fs.existsSync(filePath)) {
      form.append('evidence-file', fs.createReadStream(filePath), {
        filename: fileName,
        contentType: 'application/pdf'
      });
    }

    return this._request({
      method: 'POST',
      endpoint: `/v1/customer/disputes/${encodeURIComponent(disputeId)}/provide-evidence`,
      data: form,
      headers: form.getHeaders(),
      disputeId
    });
  }

  async acceptClaim(disputeId, reason = 'Seller accepted dispute claim') {
    return this._request({
      method: 'POST',
      endpoint: `/v1/customer/disputes/${encodeURIComponent(disputeId)}/accept-claim`,
      data: { reason },
      headers: { 'Content-Type': 'application/json' },
      disputeId
    });
  }

  async sendMessage(disputeId, message) {
    return this._request({
      method: 'POST',
      endpoint: `/v1/customer/disputes/${encodeURIComponent(disputeId)}/send-message`,
      data: { message },
      headers: { 'Content-Type': 'application/json' },
      disputeId
    });
  }

  // --- ORDERS V2 (STOREFRONT) ---
  async createOrder({ items = [], totalAmount, amount, currency = 'USD', description = 'Storefront Order', customId = null, invoiceId = null, applicationContext = null }) {
    const total = Number(totalAmount ?? amount ?? 0);
    const unit = {
      description,
      ...(customId ? { custom_id: customId } : {}),
      ...(invoiceId ? { invoice_id: invoiceId } : {}),
      amount: {
        currency_code: currency,
        value: total.toFixed(2)
      }
    };

    if (items && items.length > 0) {
      unit.amount.breakdown = {
        item_total: {
          currency_code: currency,
          value: total.toFixed(2)
        }
      };
      unit.items = items.map(i => ({
        name: i.name,
        unit_amount: {
          currency_code: currency,
          value: Number(i.unit_price).toFixed(2)
        },
        quantity: String(i.quantity || 1),
        description: i.description || i.name,
        ...(i.sku ? { sku: String(i.sku) } : {}),
        ...(i.category ? { category: i.category } : {})
      }));
    }

    const payload = {
      intent: 'CAPTURE',
      purchase_units: [unit],
      ...(applicationContext ? { application_context: applicationContext } : {})
    };

    return this._request({
      method: 'POST',
      endpoint: '/v2/checkout/orders',
      data: payload,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async captureOrder(orderId) {
    return this._request({
      method: 'POST',
      endpoint: `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // --- SHIPMENT TRACKING ---
  async addShipmentTracking({ transactionId, trackingNumber, carrier = 'OTHER', carrierName = 'BlueDart', status = 'DELIVERED' }) {
    const payload = {
      trackers: [
        {
          transaction_id: transactionId,
          tracking_number: trackingNumber,
          status,
          carrier: carrier === 'OTHER' ? 'OTHER' : carrier,
          carrier_name_other: carrier === 'OTHER' ? carrierName : undefined
        }
      ]
    };

    return this._request({
      method: 'POST',
      endpoint: '/v1/shipping/trackers-batch',
      data: payload,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // --- SANDBOX ONLY: PROGRAMMATIC CREATE DISPUTE (Path B) ---
  async createSandboxDispute({ transactionId, reason = 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', amount, currency = 'USD', note }) {
    const payload = {
      disputed_transaction: {
        buyer_transaction_id: transactionId
      },
      reason,
      dispute_amount: {
        currency_code: currency,
        value: Number(amount).toFixed(2)
      },
      dispute_life_cycle_stage: 'INQUIRY',
      messages: [
        {
          posted_by: 'BUYER',
          content: note || 'Dispute opened via Sandbox Programmatic API.'
        }
      ]
    };

    return this._request({
      method: 'POST',
      endpoint: '/v1/customer/disputes',
      data: payload,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const restClient = new PayPalRestClient();
export default restClient;
