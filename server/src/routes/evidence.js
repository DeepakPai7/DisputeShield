import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db/database.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(config.uploadDir)) {
      fs.mkdirSync(config.uploadDir, { recursive: true });
    }
    cb(null, config.uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// POST /api/disputes/:id/evidence - Add manual evidence or note
router.post('/:id/evidence', upload.single('file'), (req, res) => {
  try {
    const dispute = db.prepare('SELECT * FROM disputes WHERE id = ? OR paypal_dispute_id = ?').get(req.params.id, req.params.id);
    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const { title, category = 'OTHER', notes } = req.body;
    const file = req.file;

    if (!title && !file && !notes) {
      return res.status(400).json({ error: 'Either title, notes, or an attached file is required' });
    }

    const itemId = `EVID-${Date.now()}`;
    const evidenceTitle = title || (file ? file.originalname : 'Merchant Evidence Note');
    const content = {
      notes: notes || '',
      original_name: file ? file.originalname : null,
      mime_type: file ? file.mimetype : null
    };

    db.prepare(`
      INSERT INTO evidence_items (id, dispute_id, category, title, content_json, file_path, file_mimetype, file_size, is_manual, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      itemId,
      dispute.id,
      category,
      evidenceTitle,
      JSON.stringify(content),
      file ? file.path : null,
      file ? file.mimetype : 'text/plain',
      file ? file.size : (notes?.length || 0),
      new Date().toISOString()
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_log (id, dispute_id, actor, action, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `AUDIT-${Date.now()}`,
      dispute.id,
      'Seller',
      'Manual Evidence Added',
      JSON.stringify({ title: evidenceTitle, category, hasFile: Boolean(file) }),
      new Date().toISOString()
    );

    res.json({
      success: true,
      message: 'Evidence successfully attached to dispute packet',
      item: {
        id: itemId,
        title: evidenceTitle,
        category,
        file_path: file ? file.path : null,
        created_at: new Date().toISOString()
      }
    });
  } catch (err) {
    logger.error(`Error uploading evidence for ${req.params.id}:`, { message: err.message });
    res.status(500).json({ error: 'Evidence upload failed: ' + err.message });
  }
});

export default router;

