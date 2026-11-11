import axios from 'axios';

// Base URL: uses import.meta.env.VITE_API_URL in production, empty string for local dev (which falls back to /api with Vite proxy)
const rawBaseUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const API_BASE_URL = rawBaseUrl
  ? (rawBaseUrl.endsWith('/api') ? rawBaseUrl : `${rawBaseUrl}/api`)
  : '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 45000,
});

export const getHealth = () => api.get('/health').then(r => r.data);
export const getConfigStatus = () => api.get('/config/status').then(r => r.data);
export const getDiagnostics = (force = false) => api.get('/diagnostics', { params: { force } }).then(r => r.data);

// Disputes
export const getDisputes = () => api.get('/disputes').then(r => r.data);
export const getDisputeDetail = (id) => api.get(`/disputes/${id}`).then(r => r.data);
export const analyzeDispute = (id, instruction = null) => api.post(`/disputes/${id}/analyze`, { instruction }).then(r => r.data);
export const generateLetter = (id, instruction = null) => api.post(`/disputes/${id}/letter/generate`, { instruction }).then(r => r.data);
export const regenerateLetter = (id, instruction) => api.post(`/disputes/${id}/letter/regenerate`, { instruction }).then(r => r.data);
export const saveLetter = (id, letter_text) => api.put(`/disputes/${id}/letter`, { letter_text }).then(r => r.data);
export const submitToPayPal = (id, submitted_by = 'Seller via Dashboard') => api.post(`/disputes/${id}/submit`, { submitted_by }).then(r => r.data);
export const acceptClaim = (id, reason) => api.post(`/disputes/${id}/accept`, { reason }).then(r => r.data);
export const pollPayPalDisputes = () => api.post('/disputes/poll').then(r => r.data);
export const createSandboxDispute = (payload) => api.post('/disputes/create-sandbox', payload).then(r => r.data);
export const resetLocalData = () => api.post('/disputes/reset-local-data').then(r => r.data);

// Storefront & Customer Orders
export const getStoreProducts = () => api.get('/store/products').then(r => r.data);
export const getStoreOrders = () => api.get('/store/orders').then(r => r.data);
export const createStoreOrder = (productKey) => api.post('/store/create-order', { productKey }).then(r => r.data);
export const captureStoreOrder = (orderId, productKey) => api.post('/store/capture-order', { orderId, productKey }).then(r => r.data);
export const verifyDeliveryOtp = (orderId, otp) => api.post(`/store/orders/${orderId}/verify-otp`, { otp }).then(r => r.data);

// Channel3 E-Commerce Shop API
export const searchShop = (query, limit = 8) => api.get('/shop/search', { params: { q: query, limit } }).then(r => r.data);
export const getShopProduct = (id) => api.get(`/shop/products/${id}`).then(r => r.data);
export const createShopOrder = (productId) => api.post('/shop/create-order', { productId }).then(r => r.data);
export const captureShopOrder = (orderId, productId) => api.post('/shop/capture-order', { orderId, productId }).then(r => r.data);
export const quickShopCheckout = (productId) => api.post('/shop/quick-checkout', { productId }).then(r => r.data);
export const getAiPick = (query, products) => api.post('/shop/ai-pick', { query, products }).then(r => r.data);

// Live Chat API
export const getChatMessages = (orderId) => api.get(`/chat/${orderId}`).then(r => r.data);
export const sendChatMessage = (orderId, payload) => api.post(`/chat/${orderId}`, payload).then(r => r.data);

// Evidence
export const uploadManualEvidence = (disputeId, formData) =>
  api.post(`/disputes/${disputeId}/evidence`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data);
export const getEvidencePdfUrl = (disputeId) => `${API_BASE_URL}/disputes/${disputeId}/evidence-pdf`;

// Stats, Settings, Audit & PayPal API Logs
export const getStats = () => api.get('/stats').then(r => r.data);
export const getSettings = () => api.get('/settings').then(r => r.data);
export const updateSettings = (settings) => api.put('/settings', settings).then(r => r.data);
export const getAuditLogs = () => api.get('/audit').then(r => r.data);
export const getPayPalApiLogs = (limit = 50) => api.get('/paypal-logs', { params: { limit } }).then(r => r.data);

export default api;
