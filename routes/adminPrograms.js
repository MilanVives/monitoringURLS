const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Program = require('../models/Program');
const Server = require('../models/Server');
const { requireAuth } = require('../middleware/auth');
const { processCSV, detectCSVHeaders } = require('../services/csvService');
const dbService = require('../services/databaseService');
const { updateAllStatuses } = require('../services/uptimeService');
const { broadcastStatusUpdate } = require('../services/wsService');

const upload = multer({ dest: 'uploads/' });

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// GET /api/admin/programs
router.get('/', requireAuth, async (req, res) => {
  try {
    const programs = await Program.find().sort({ order: 1 });
    const counts = await Promise.all(
      programs.map(p => Server.countDocuments({ program: p._id }))
    );
    res.json(programs.map((p, i) => ({ ...p.toObject(), serverCount: counts[i] })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/programs
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const slug = toSlug(name);
    const maxOrder = await Program.findOne().sort({ order: -1 }).select('order');
    const order = maxOrder ? maxOrder.order + 1 : 0;
    const program = new Program({ name, slug, order });
    await program.save();
    res.json({ success: true, program });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'A program with this name already exists' });
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/programs/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, order } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (order !== undefined) updates.order = order;
    const program = await Program.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json({ success: true, program });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/programs/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Server.updateMany({ program: req.params.id }, { $set: { program: null } });
    await Program.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/programs/:id/fields
router.get('/:id/fields', requireAuth, async (req, res) => {
  try {
    const program = await Program.findById(req.params.id).select('tileFields');
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json(program.tileFields);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/programs/:id/fields
router.put('/:id/fields', requireAuth, async (req, res) => {
  try {
    const { latency, uptime, submissionCount, github, documentation, timeSinceSubmission, comments } = req.body;
    const program = await Program.findByIdAndUpdate(
      req.params.id,
      { $set: { tileFields: { latency, uptime, submissionCount, github, documentation, timeSinceSubmission, comments } } },
      { new: true }
    );
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json({ success: true, tileFields: program.tileFields });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/programs/:id/csv-mapping
router.get('/:id/csv-mapping', requireAuth, async (req, res) => {
  try {
    const program = await Program.findById(req.params.id).select('csvMapping');
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json(program.csvMapping);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/programs/:id/csv-mapping
router.put('/:id/csv-mapping', requireAuth, async (req, res) => {
  try {
    const { nameColumn, urlColumn, emailColumn, githubColumn, documentationColumn,
            submissionTimeColumn, commentsColumn, separator, skipLines } = req.body;
    const program = await Program.findByIdAndUpdate(
      req.params.id,
      { $set: { csvMapping: { nameColumn, urlColumn, emailColumn, githubColumn,
                              documentationColumn, submissionTimeColumn, commentsColumn,
                              separator, skipLines } } },
      { new: true }
    );
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json({ success: true, csvMapping: program.csvMapping });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/programs/:id/csv-preview
router.get('/:id/csv-preview', requireAuth, async (req, res) => {
  try {
    const program = await Program.findById(req.params.id).select('csvMapping');
    if (!program) return res.status(404).json({ error: 'Program not found' });
    const targetPath = path.join(__dirname, '..', 'Node.csv');
    if (!fs.existsSync(targetPath)) {
      return res.json({ headers: [], preview: [], message: 'No CSV file uploaded yet.' });
    }
    const separator = program.csvMapping.separator || ';';
    const readline = require('readline');
    const fileStream = fs.createReadStream(targetPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    const rows = [];
    let lineCount = 0;
    for await (const line of rl) {
      if (lineCount < 6) { rows.push(line.split(separator)); lineCount++; }
      else break;
    }
    res.json({ headers: rows.length > 0 ? rows[0] : [], preview: rows.slice(1, 6) });
  } catch (error) {
    res.status(500).json({ error: error.message, headers: [], preview: [] });
  }
});

// POST /api/admin/programs/:id/upload-csv
router.post('/:id/upload-csv', requireAuth, upload.single('csvFile'), async (req, res) => {
  try {
    const program = await Program.findById(req.params.id);
    if (!program) return res.status(404).json({ error: 'Program not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const uploadedPath = req.file.path;
    const targetPath = path.join(__dirname, '..', 'Node.csv');
    fs.copyFileSync(uploadedPath, targetPath);
    fs.unlinkSync(uploadedPath);

    const csvData = await processCSV(program.csvMapping, targetPath);
    const servers = await dbService.syncServersFromCSV(csvData, program._id);

    const { wss } = req.app.locals;
    await updateAllStatuses(servers, (url, status) => broadcastStatusUpdate(wss, url, status));

    res.json({ success: true, message: `Imported ${servers.length} servers` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/programs/:id/webhook
router.get('/:id/webhook', requireAuth, async (req, res) => {
  try {
    const program = await Program.findById(req.params.id).select('webhookEnabled webhookToken slug');
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json({
      webhookEnabled: program.webhookEnabled,
      webhookToken: program.webhookToken,
      slug: program.slug
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/admin/programs/:id/webhook-token
router.patch('/:id/webhook-token', requireAuth, async (req, res) => {
  try {
    const token = crypto.randomUUID();
    const program = await Program.findByIdAndUpdate(
      req.params.id,
      { webhookToken: token, webhookEnabled: true },
      { new: true }
    );
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json({ success: true, webhookToken: token, webhookEnabled: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/admin/programs/:id/webhook-enabled
router.patch('/:id/webhook-enabled', requireAuth, async (req, res) => {
  try {
    const { enabled } = req.body;
    const program = await Program.findByIdAndUpdate(
      req.params.id,
      { webhookEnabled: !!enabled },
      { new: true }
    );
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json({ success: true, webhookEnabled: program.webhookEnabled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
