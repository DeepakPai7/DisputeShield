import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// Ensure directories exist
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(config.uploadDir)) fs.mkdirSync(config.uploadDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);

// Provide standard transaction helper
db.transaction = function (fn) {
  return function (...args) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

export function initDatabase() {
  logger.info(`Initializing SQLite database at: ${config.dbPath}`);

  // Base schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      paypal_dispute_id TEXT UNIQUE NOT NULL,
      order_id TEXT,
      source TEXT NOT NULL DEFAULT 'paypal_sandbox',
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      dispute_amount REAL NOT NULL,
      dispute_currency TEXT NOT NULL DEFAULT 'USD',
      buyer_message TEXT,
      due_date TEXT,
      raw_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Migrate disputes columns if needed
  try {
    const cols = db.prepare("PRAGMA table_info(disputes)").all();
    if (!cols.some(c => c.name === 'source')) {
      db.exec("ALTER TABLE disputes ADD COLUMN source TEXT NOT NULL DEFAULT 'paypal_sandbox'");
    }
  } catch (e) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      paypal_order_id TEXT,
      paypal_capture_id TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      items_json TEXT,
      total_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      shipping_address_json TEXT,
      order_date TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      payment_reference TEXT,
      scenario_tag TEXT
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      carrier TEXT NOT NULL,
      tracking_number TEXT NOT NULL,
      status TEXT NOT NULL,
      shipped_at TEXT,
      delivered_at TEXT,
      recipient_signature TEXT,
      paypal_tracker_id TEXT,
      delivery_otp TEXT,
      otp_verified INTEGER NOT NULL DEFAULT 0,
      unique_delivery_id TEXT,
      verified_at TEXT,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS shipment_events (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL,
      event_time TEXT NOT NULL,
      location TEXT,
      description TEXT NOT NULL,
      status_code TEXT,
      FOREIGN KEY(shipment_id) REFERENCES shipments(id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'web_chat',
      sender TEXT NOT NULL,
      sender_role TEXT NOT NULL DEFAULT 'buyer',
      dispute_id TEXT,
      message_text TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS delivery_files (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_hash TEXT,
      delivery_url TEXT,
      delivered_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      action TEXT NOT NULL,
      logged_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS evidence_items (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content_json TEXT,
      file_path TEXT,
      file_mimetype TEXT,
      file_size INTEGER,
      is_manual INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(dispute_id) REFERENCES disputes(id)
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'completed',
      json TEXT NOT NULL,
      model TEXT NOT NULL,
      case_strength_score REAL NOT NULL,
      recommendation TEXT NOT NULL,
      agent_trace_json TEXT,
      rule_overrides_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(dispute_id) REFERENCES disputes(id)
    );

    CREATE TABLE IF NOT EXISTS letters (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      letter_text TEXT NOT NULL,
      instruction TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY(dispute_id) REFERENCES disputes(id)
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      payload_json TEXT,
      paypal_response_json TEXT,
      submitted_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(dispute_id) REFERENCES disputes(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      dispute_id TEXT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      details_json TEXT,
      previous_hash TEXT,
      hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS paypal_api_log (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      endpoint_or_tool TEXT NOT NULL,
      http_status INTEGER,
      duration_ms INTEGER NOT NULL,
      dispute_id TEXT,
      details_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_snapshots (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      paypal_capture_id TEXT,
      channel3_product_id TEXT NOT NULL,
      title TEXT NOT NULL,
      brand TEXT,
      description TEXT,
      main_image_url TEXT,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      offer_domain TEXT,
      offer_url TEXT,
      captured_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_disputes_source ON disputes(source);
    CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
    CREATE INDEX IF NOT EXISTS idx_paypal_api_log ON paypal_api_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_snapshots_order ON product_snapshots(order_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_capture ON product_snapshots(paypal_capture_id);
  `);

  // Migrate shipments columns if needed
  try {
    const sCols = db.prepare("PRAGMA table_info(shipments)").all();
    if (!sCols.some(c => c.name === 'delivery_otp')) {
      db.exec("ALTER TABLE shipments ADD COLUMN delivery_otp TEXT");
    }
    if (!sCols.some(c => c.name === 'otp_verified')) {
      db.exec("ALTER TABLE shipments ADD COLUMN otp_verified INTEGER NOT NULL DEFAULT 0");
    }
    if (!sCols.some(c => c.name === 'unique_delivery_id')) {
      db.exec("ALTER TABLE shipments ADD COLUMN unique_delivery_id TEXT");
    }
    if (!sCols.some(c => c.name === 'verified_at')) {
      db.exec("ALTER TABLE shipments ADD COLUMN verified_at TEXT");
    }
  } catch (e) {
    logger.warn('Shipments column migration check:', { error: e.message });
  }

  // Migrate chat_messages columns if needed
  try {
    const cCols = db.prepare("PRAGMA table_info(chat_messages)").all();
    if (!cCols.some(c => c.name === 'sender_role')) {
      db.exec("ALTER TABLE chat_messages ADD COLUMN sender_role TEXT NOT NULL DEFAULT 'buyer'");
    }
    if (!cCols.some(c => c.name === 'dispute_id')) {
      db.exec("ALTER TABLE chat_messages ADD COLUMN dispute_id TEXT");
    }
  } catch (e) {
    logger.warn('Chat messages column migration check:', { error: e.message });
  }

  // Initialize default settings if absent
  initDefaultSettings();

  logger.info('Database schema successfully verified/initialized.');
}

// Auto-initialize on import so tables exist immediately
initDatabase();

function initDefaultSettings() {
  const defaultSettings = [
    ['auto_submit_enabled', 'false'],
    ['min_auto_submit_score', '85'],
    ['tiny_dispute_threshold', '5.0'],
    ['seller_time_cost', '4.0'],
    ['polling_interval_seconds', '60'],
    ['business_name', 'Apex Merchants & Creative Studio'],
    ['business_email', 'disputes@apexmerchants.com'],
    ['business_contact_name', 'Jordan Taylor (Operations Lead)'],
    ['business_address', '104 Innovation Way, Tech Park, CA 94107']
  ];

  const nowIso = new Date().toISOString();
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
  for (const [k, v] of defaultSettings) {
    insertSetting.run(k, v, nowIso);
  }
}

/**
 * Append-only cryptographic audit logging with SHA-256 hash chaining
 */
export function recordAuditLog({ disputeId = null, actor, action, details = {} }) {
  const lastRow = db.prepare('SELECT hash FROM audit_log ORDER BY rowid DESC LIMIT 1').get();
  const previousHash = lastRow?.hash || '0000000000000000000000000000000000000000000000000000000000000000';

  const id = `AUDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const nowIso = new Date().toISOString();
  const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);

  const hash = crypto
    .createHash('sha256')
    .update(`${previousHash}|${id}|${actor}|${action}|${detailsStr}|${nowIso}`)
    .digest('hex');

  db.prepare(`
    INSERT INTO audit_log (id, dispute_id, actor, action, details_json, previous_hash, hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, disputeId, actor, action, detailsStr, previousHash, hash, nowIso);

  return { id, hash, previousHash, previous_hash: previousHash };
}

/**
 * Log every PayPal call (MCP or REST) to paypal_api_log table
 */
export function recordPayPalApiLog({ kind, endpointOrTool, httpStatus = null, durationMs, disputeId = null, details = {} }) {
  const id = `PPLOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const nowIso = new Date().toISOString();
  const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);

  try {
    db.prepare(`
      INSERT INTO paypal_api_log (id, kind, endpoint_or_tool, http_status, duration_ms, dispute_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, kind, endpointOrTool, httpStatus, durationMs, disputeId, detailsStr, nowIso);
  } catch (err) {
    logger.error('Failed to write paypal_api_log:', { message: err.message });
  }

  return id;
}

export default db;
