# Multi-Program Sidebar Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single flat dashboard with a sidebar-navigated multi-program view where each program (Node TI, Node AO, etc.) owns its CSV column mapping and tile field toggles, with full admin CRUD for programs.

**Architecture:** A new `Program` Mongoose model holds per-program CSV mapping and tile field toggles. `Server` gains a `program: ObjectId` reference. Admin routes in `routes/adminPrograms.js` handle all program management. Both `index.html` and `admin.html` render a sidebar from `/api/programs` and switch content on URL hash change without page reload. The standalone `CSVMapping` model is deleted; config moves into `Program.csvMapping`.

**Tech Stack:** Node.js 18+, Express 5, Mongoose 9, MongoDB 7, vanilla JS (no build step)

**Security note:** User-supplied fields (server name, URL, email, comments) from CSV imports are escaped via a shared `esc()` helper before DOM insertion to prevent XSS.

---

## File Map

**New files:**
- `models/Program.js` — Program Mongoose model with `csvMapping` + `tileFields` subdocuments
- `routes/adminPrograms.js` — all admin program endpoints (CRUD, fields, mapping, upload, preview)

**Modified files:**
- `models/Server.js` — add `program: ObjectId ref`
- `services/csvService.js` — `processCSV(csvMapping, filePath)` instead of global DB lookup
- `services/databaseService.js` — `syncServersFromCSV(csvData, programId)`, add `getVisibleServersByProgram`
- `server.js` — register new routes, update `/api/urls`, add `/api/programs`, remove CSVMapping endpoints
- `public/index.html` — sidebar + hash routing + tileFields-driven tile rendering
- `public/admin.html` — sidebar + per-program sub-tabs

**Deleted files:**
- `models/CSVMapping.js`

---

### Task 1: Create `models/Program.js`

**Files:**
- Create: `models/Program.js`

- [ ] **Step 1: Write the model file**

```javascript
// models/Program.js
const mongoose = require('mongoose');

const csvMappingSchema = new mongoose.Schema({
  nameColumn:           { type: Number, default: 4 },
  urlColumn:            { type: Number, default: 8 },
  emailColumn:          { type: Number, default: 3 },
  githubColumn:         { type: Number, default: 7 },
  documentationColumn:  { type: Number, default: 9 },
  submissionTimeColumn: { type: Number, default: 2 },
  commentsColumn:       { type: Number, default: 20 },
  separator:            { type: String, default: ';' },
  skipLines:            { type: Number, default: 1 }
}, { _id: false });

const tileFieldsSchema = new mongoose.Schema({
  latency:             { type: Boolean, default: true },
  uptime:              { type: Boolean, default: true },
  submissionCount:     { type: Boolean, default: true },
  github:              { type: Boolean, default: true },
  documentation:       { type: Boolean, default: false },
  timeSinceSubmission: { type: Boolean, default: false },
  comments:            { type: Boolean, default: false }
}, { _id: false });

const programSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  slug:       { type: String, required: true, unique: true },
  order:      { type: Number, default: 0 },
  csvMapping: { type: csvMappingSchema, default: () => ({}) },
  tileFields: { type: tileFieldsSchema, default: () => ({}) },
  createdAt:  { type: Date, default: Date.now }
});

module.exports = mongoose.model('Program', programSchema);
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "require('./models/Program'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add models/Program.js
git commit -m "feat: add Program model with csvMapping and tileFields"
```

---

### Task 2: Add `program` field to `Server` model

**Files:**
- Modify: `models/Server.js`

- [ ] **Step 1: Add program field after `manuallyAdded`**

In `models/Server.js`, add this line after `manuallyAdded: { type: Boolean, default: false },`:

```javascript
program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', default: null },
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "require('./models/Server'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add models/Server.js
git commit -m "feat: add program reference field to Server model"
```

---

### Task 3: Create `routes/adminPrograms.js`

**Files:**
- Create: `routes/adminPrograms.js`

- [ ] **Step 1: Write the route file**

```javascript
// routes/adminPrograms.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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
    const headers = await detectCSVHeaders(targetPath, separator);
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

module.exports = router;
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "require('./routes/adminPrograms'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add routes/adminPrograms.js
git commit -m "feat: add admin program CRUD, tile fields, CSV mapping, upload routes"
```

---

### Task 4: Update `services/csvService.js`

**Files:**
- Modify: `services/csvService.js`

- [ ] **Step 1: Replace the entire file**

```javascript
// services/csvService.js
const fs = require('fs');
const csv = require('csv-parser');
const { getTimeDifference } = require('../utils/dateUtils');
const { initializeUptimeHistory } = require('./uptimeService');

async function detectCSVHeaders(filePath, separator = ';') {
  return new Promise((resolve, reject) => {
    const readline = require('readline');
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let firstLine = null;
    rl.on('line', (line) => {
      if (!firstLine) { firstLine = line; rl.close(); fileStream.destroy(); }
    });
    rl.on('close', () => resolve(firstLine ? firstLine.split(separator) : []));
    rl.on('error', reject);
  });
}

async function processCSV(csvMapping, filePath = 'Node.csv') {
  const {
    nameColumn, urlColumn, emailColumn, githubColumn,
    documentationColumn, submissionTimeColumn, commentsColumn,
    separator = ';', skipLines = 1
  } = csvMapping;

  return new Promise((resolve, reject) => {
    const allRecords = [];

    fs.createReadStream(filePath)
      .pipe(csv({ separator, headers: false, skipLines }))
      .on('data', (row) => {
        const columns = Object.values(row);
        const name = columns[nameColumn];
        const url = columns[urlColumn];
        const email = columns[emailColumn];
        const github = columns[githubColumn];
        const documentation = columns[documentationColumn];
        const submissionTime = columns[submissionTimeColumn];
        const comments = columns[commentsColumn];

        if (name && url && url.toLowerCase() !== 'ok' && !url.toLowerCase().includes('volledig')) {
          const timeDiff = getTimeDifference(submissionTime);
          initializeUptimeHistory(url);
          allRecords.push({
            name, url, email, status: 'unknown', github, documentation,
            submissionTime, comments,
            timeSinceSubmission: `${timeDiff.days} days and ${timeDiff.hours} hours ago`,
            uptimeStats: 'Collecting data...'
          });
        }
      })
      .on('end', () => {
        const submissionCounts = {};
        allRecords.forEach(rec => {
          if (rec.email) submissionCounts[rec.email] = (submissionCounts[rec.email] || 0) + 1;
        });

        const latestByEmail = {};
        allRecords.forEach((rec, idx) => {
          if (!rec.email) return;
          const [day, month, yearAndTime] = rec.submissionTime.split('-');
          const [year, time] = yearAndTime.split(' ');
          const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}`;
          const recDate = new Date(isoString);
          if (!latestByEmail[rec.email] || recDate > latestByEmail[rec.email].date) {
            latestByEmail[rec.email] = { date: recDate, _idx: idx };
          }
        });

        resolve(allRecords.map((rec, idx) => {
          const submissionCount = rec.email ? submissionCounts[rec.email] : 1;
          const grayedOut = !!(rec.email && latestByEmail[rec.email] && latestByEmail[rec.email]._idx !== idx);
          return { ...rec, grayedOut, submissionCount };
        }));
      })
      .on('error', reject);
  });
}

module.exports = { processCSV, detectCSVHeaders };
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "require('./services/csvService'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add services/csvService.js
git commit -m "refactor: csvService accepts mapping object and filePath instead of global DB lookup"
```

---

### Task 5: Update `services/databaseService.js`

**Files:**
- Modify: `services/databaseService.js`

- [ ] **Step 1: Update `syncServersFromCSV` signature**

Change the function signature to:
```javascript
async function syncServersFromCSV(csvData, programId) {
```

- [ ] **Step 2: Add `program` to every `new Server({...})` call inside the function**

There are two `new Server({...})` blocks. Add `program: programId || null` to both:

```javascript
server = new Server({
  name, url, email, github, documentation, submissionTime, comments,
  currentStatus: 'unknown', editCount: 0, lastCsvData: csvDataHash,
  program: programId || null
});
```

- [ ] **Step 3: Assign program to existing servers when programId is provided**

In each block that finds an existing server by email or by URL, add after `server.updatedAt = new Date();`:

```javascript
if (programId) server.program = programId;
```

- [ ] **Step 4: Add `getVisibleServersByProgram` after `getVisibleServers`**

```javascript
async function getVisibleServersByProgram(programId) {
  return await Server.find({ hidden: false, program: programId }).sort({ createdAt: -1 });
}
```

- [ ] **Step 5: Add to `module.exports`**

```javascript
module.exports = {
  syncServersFromCSV,
  updateServerStatus,
  getVisibleServers,
  getVisibleServersByProgram,
  getAllServers,
  getServerById,
  getServerWithHistory,
  hideServer,
  unhideServer,
  deleteServer,
  updateServer,
  clearAllServers,
  getServerStatistics
};
```

- [ ] **Step 6: Verify syntax**

```bash
node -e "require('./services/databaseService'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add services/databaseService.js
git commit -m "feat: add programId to syncServersFromCSV and add getVisibleServersByProgram"
```

---

### Task 6: Update `server.js`

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Update imports — remove CSVMapping, update csvService import, add router**

Replace:
```javascript
const { processCSV, getActiveMapping, detectCSVHeaders } = require('./services/csvService');
```
with:
```javascript
const { processCSV } = require('./services/csvService');
```

Delete:
```javascript
const CSVMapping = require('./models/CSVMapping');
```

Add after the existing require block:
```javascript
const adminProgramsRouter = require('./routes/adminPrograms');
```

- [ ] **Step 2: Register the router and expose `wss` in `app.locals`**

After `app.use(express.static(path.join(__dirname, 'public')));`, add:
```javascript
app.use('/api/admin/programs', adminProgramsRouter);
```

After `const wss = setupWebSocketServer(server);`, add:
```javascript
app.locals.wss = wss;
```

- [ ] **Step 3: Replace `GET /api/urls` to support `?program=<slug>` filter**

Replace the entire existing `/api/urls` handler with:

```javascript
app.get('/api/urls', async (req, res) => {
  try {
    let servers;
    if (req.query.program) {
      const Program = require('./models/Program');
      const program = await Program.findOne({ slug: req.query.program });
      if (!program) return res.json([]);
      servers = await dbService.getVisibleServersByProgram(program._id);
    } else {
      servers = await dbService.getVisibleServers();
    }
    const urlData = servers.map(server => {
      const timeDiff = server.submissionTime
        ? require('./utils/dateUtils').getTimeDifference(server.submissionTime) : null;
      const totalChecks = server.statusHistory.length;
      const onlineCount = server.statusHistory.filter(h => h.status === 'online').length;
      const uptimePercent = totalChecks > 0 ? Math.round((onlineCount / totalChecks) * 100) : 0;
      return {
        _id: server._id.toString(),
        name: server.name,
        url: server.url,
        email: server.email,
        github: server.github,
        documentation: server.documentation,
        comments: server.comments,
        status: server.currentStatus,
        latency: server.currentLatency,
        submissionTime: server.submissionTime,
        timeSinceSubmission: timeDiff ? `${timeDiff.days} days and ${timeDiff.hours} hours ago` : 'N/A',
        uptimeStats: `${uptimePercent}% uptime (last ${totalChecks} checks)`,
        grayedOut: false,
        submissionCount: server.editCount || 0
      };
    });
    res.json(urlData);
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 4: Add `GET /api/programs` public endpoint**

After the `/api/urls` handler:

```javascript
app.get('/api/programs', async (req, res) => {
  try {
    const Program = require('./models/Program');
    const Server = require('./models/Server');
    const programs = await Program.find().sort({ order: 1 });
    const counts = await Promise.all(
      programs.map(p => Server.countDocuments({ program: p._id, hidden: false }))
    );
    res.json(programs.map((p, i) => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      order: p.order,
      serverCount: counts[i],
      tileFields: p.tileFields
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 5: Update `POST /api/admin/servers/manual` to accept `programId`**

In that handler, change the destructuring to:
```javascript
const { name, url, email, github, documentation, comments, submissionTime, programId } = req.body;
```

In `new Server({...})`, add:
```javascript
program: programId || null
```

- [ ] **Step 6: Remove old endpoints**

Delete these handlers entirely from `server.js`:
- `app.get('/api/admin/csv-mapping', ...)`
- `app.get('/api/admin/csv-mappings', ...)`
- `app.post('/api/admin/csv-mapping', ...)`
- `app.put('/api/admin/csv-mapping/:id', ...)`
- `app.delete('/api/admin/csv-mapping/:id', ...)`
- `app.get('/api/admin/csv-preview', ...)`
- `app.post('/api/admin/upload-csv', ...)` — replaced by per-program route
- `app.post('/api/reload-csv', ...)` — no longer meaningful

- [ ] **Step 7: Simplify `initialize()` — remove CSV auto-import on empty DB**

In `initialize()`, replace the else branch that imports CSV:
```javascript
} else {
  urlData = [];
  console.log('[INIT] Database empty. Create programs and upload CSVs via admin panel.');
}
```

Remove the inner try/catch CSV block entirely.

- [ ] **Step 8: Verify server starts**

```bash
node server.js
```

Expected:
```
Server running on http://localhost:3000
[INIT] Loading servers from database...
```

```bash
curl http://localhost:3000/api/programs
```

Expected: `[]`

- [ ] **Step 9: Commit**

```bash
git add server.js
git commit -m "feat: register program routes, update /api/urls, add /api/programs, remove CSVMapping endpoints"
```

---

### Task 7: Delete `models/CSVMapping.js` and update `.gitignore`

**Files:**
- Delete: `models/CSVMapping.js`
- Modify: `.gitignore`

- [ ] **Step 1: Delete the file**

```bash
rm models/CSVMapping.js
```

- [ ] **Step 2: Add `.superpowers/` to `.gitignore`**

Open `.gitignore` and add:
```
.superpowers/
```

- [ ] **Step 3: Verify server starts without errors**

```bash
node server.js
```

Expected: no `Cannot find module './models/CSVMapping'` errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete CSVMapping model and ignore .superpowers/ brainstorm files"
```

---

### Task 8: Rewrite `public/index.html`

**Files:**
- Modify: `public/index.html` (full rewrite)

Note: All user-supplied string values (server name, URL, comments, etc.) are passed through `esc()` before DOM insertion to prevent XSS.

- [ ] **Step 1: Replace the entire file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VIVES Monitoring Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; display: flex; height: 100vh; overflow: hidden; }

    .sidebar {
      width: 200px; flex-shrink: 0; background: #1a1a2e;
      display: flex; flex-direction: column; height: 100vh; position: fixed; left: 0; top: 0;
    }
    .sidebar-logo {
      padding: 16px 14px; border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex; align-items: center; gap: 10px;
    }
    .sidebar-logo img { height: 32px; width: auto; }
    .sidebar-logo span { color: white; font-weight: bold; font-size: 14px; }
    .sidebar-nav { flex: 1; padding: 8px 0; overflow-y: auto; }
    .sidebar-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 11px 16px; color: #aaa; cursor: pointer; font-size: 14px; transition: background 0.15s;
    }
    .sidebar-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
    .sidebar-item.active { background: #e53935; color: #fff; font-weight: bold; }
    .sidebar-item .badge { background: rgba(255,255,255,0.15); border-radius: 10px; padding: 1px 7px; font-size: 11px; }
    .sidebar-item.active .badge { background: rgba(255,255,255,0.25); }
    .sidebar-footer { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.1); color: #555; font-size: 11px; }

    .main { margin-left: 200px; flex: 1; height: 100vh; overflow-y: auto; padding: 24px; }
    .main-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
    .main-title { font-size: 22px; font-weight: bold; color: #222; }
    .main-subtitle { color: #666; font-size: 13px; margin-top: 4px; }
    .admin-link {
      display: inline-block; padding: 8px 16px; background: #FF9800;
      color: white; border-radius: 4px; text-decoration: none; font-size: 14px; flex-shrink: 0;
    }

    .dashboard { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .tile {
      background: white; border-radius: 8px; padding: 15px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.08); cursor: pointer;
      transition: transform 0.15s; border-left: 5px solid #ccc;
    }
    .tile:hover { transform: translateY(-3px); }
    .tile.online   { border-left-color: #4CAF50; }
    .tile.offline  { border-left-color: #F44336; }
    .tile.degraded { border-left-color: #FF9800; }
    .tile.unknown  { border-left-color: #FFC107; }
    .tile.grayed-out { opacity: 0.45; pointer-events: none; filter: grayscale(80%); }
    .tile .name { font-weight: bold; font-size: 16px; margin-bottom: 6px; }
    .tile .url { color: #666; word-break: break-all; font-size: 12px; margin-bottom: 8px; }
    .tile .status {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 13px; font-weight: bold; margin-bottom: 6px;
    }
    .tile .status.online   { background: #E8F5E9; color: #4CAF50; }
    .tile .status.offline  { background: #FFEBEE; color: #F44336; }
    .tile .status.degraded { background: #FFF3E0; color: #FF9800; }
    .tile .status.unknown  { background: #FFF8E1; color: #FFA000; }
    .latency-bar { height: 5px; border-radius: 3px; margin: 5px 0 8px; background: #eee; }
    .latency-fast { background: #4CAF50; }
    .latency-medium { background: #FFC107; }
    .latency-slow { background: #F44336; }
    .latency-unavailable { background: #bbb; }
    .tile .meta { font-size: 12px; color: #888; margin-top: 4px; }
    .tile .links { margin-top: 8px; display: flex; gap: 10px; }
    .tile .links a { font-size: 12px; color: #2196F3; text-decoration: none; }
    .tile .links a:hover { text-decoration: underline; }

    @keyframes pulse {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.03); }
      100% { transform: scale(1); }
    }
  </style>
</head>
<body>
  <aside class="sidebar">
    <div class="sidebar-logo">
      <img src="/img/logo.svg" alt="Logo" />
      <span>VIVES Monitor</span>
    </div>
    <nav class="sidebar-nav" id="sidebar-nav">
      <div class="sidebar-item" style="color:#555;font-size:12px;">Loading...</div>
    </nav>
    <div class="sidebar-footer" id="last-check">Last check: —</div>
  </aside>

  <main class="main">
    <div class="main-header">
      <div>
        <div class="main-title" id="program-title">—</div>
        <div class="main-subtitle" id="program-subtitle"></div>
      </div>
      <a href="/admin.html" class="admin-link">Admin Panel</a>
    </div>
    <div class="dashboard" id="dashboard"></div>
  </main>

  <script>
    // Escape user-supplied strings before DOM insertion
    function esc(str) {
      const d = document.createElement('div');
      d.textContent = str || '';
      return d.innerHTML;
    }

    let programs = [];
    let currentSlug = null;

    async function loadPrograms() {
      try {
        const res = await fetch('/api/programs');
        programs = await res.json();
        renderSidebar();
        const hash = window.location.hash.replace('#', '');
        const target = programs.find(p => p.slug === hash) || programs[0];
        if (target) {
          selectProgram(target.slug);
        } else {
          document.getElementById('program-title').textContent = 'No programs configured';
          const d = document.getElementById('dashboard');
          d.textContent = '';
          const p = document.createElement('p');
          p.style.color = '#888';
          p.style.gridColumn = '1 / -1';
          p.textContent = 'No programs set up yet. Visit the Admin Panel.';
          d.appendChild(p);
        }
      } catch (err) {
        console.error('Failed to load programs', err);
      }
    }

    function renderSidebar() {
      const nav = document.getElementById('sidebar-nav');
      nav.textContent = '';
      if (programs.length === 0) {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.style.color = '#555';
        item.style.fontSize = '12px';
        item.textContent = 'No programs yet';
        nav.appendChild(item);
        return;
      }
      programs.forEach(p => {
        const item = document.createElement('div');
        item.className = 'sidebar-item' + (p.slug === currentSlug ? ' active' : '');
        item.onclick = () => selectProgram(p.slug);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;

        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = p.serverCount;

        item.appendChild(nameSpan);
        item.appendChild(badge);
        nav.appendChild(item);
      });
    }

    function selectProgram(slug) {
      currentSlug = slug;
      window.location.hash = slug;
      renderSidebar();
      fetchData(slug);
    }

    async function fetchData(slug) {
      try {
        const res = await fetch('/api/urls?program=' + encodeURIComponent(slug));
        const data = await res.json();
        const program = programs.find(p => p.slug === slug);
        const tileFields = program ? program.tileFields : null;

        document.getElementById('program-title').textContent = program ? program.name : slug;
        const online = data.filter(d => d.status === 'online').length;
        const offline = data.filter(d => d.status === 'offline').length;
        const degraded = data.filter(d => d.status === 'degraded').length;
        document.getElementById('program-subtitle').textContent =
          data.length + ' students · ' + online + ' online · ' + offline + ' offline' +
          (degraded ? ' · ' + degraded + ' degraded' : '');

        renderDashboard(data, tileFields);
        document.getElementById('last-check').textContent = 'Last check: just now';
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    }

    function renderDashboard(data, tileFields) {
      const dashboard = document.getElementById('dashboard');
      dashboard.textContent = '';
      if (data.length === 0) {
        const p = document.createElement('p');
        p.style.color = '#888';
        p.style.gridColumn = '1 / -1';
        p.textContent = 'No servers in this program yet. Upload a CSV in the Admin Panel.';
        dashboard.appendChild(p);
        return;
      }
      const tf = tileFields || {};
      const statusLabels = { online: 'Online', offline: 'Offline', degraded: 'Degraded', unknown: 'Unknown' };

      data.forEach(item => {
        const tile = document.createElement('div');
        tile.className = 'tile ' + item.status + (item.grayedOut ? ' grayed-out' : '');
        tile.dataset.url = item.url;
        tile.onclick = () => { if (!item.grayedOut && item._id) window.location.href = '/server.html?id=' + item._id; };

        // Name
        const nameEl = document.createElement('div');
        nameEl.className = 'name';
        nameEl.textContent = item.name +
          (tf.submissionCount !== false && typeof item.submissionCount === 'number' ? ' (' + item.submissionCount + ')' : '');
        tile.appendChild(nameEl);

        // URL
        const urlEl = document.createElement('div');
        urlEl.className = 'url';
        if (item.url) {
          const a = document.createElement('a');
          a.href = item.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = item.url;
          a.onclick = e => e.stopPropagation();
          urlEl.appendChild(a);
        } else {
          urlEl.textContent = 'No URL';
        }
        tile.appendChild(urlEl);

        // Status badge
        const statusEl = document.createElement('div');
        statusEl.className = 'status ' + item.status;
        statusEl.textContent = statusLabels[item.status] || item.status;
        tile.appendChild(statusEl);

        // Latency
        if (tf.latency !== false) {
          const latencyClass = typeof item.latency !== 'number' ? 'latency-unavailable'
            : item.latency <= 300 ? 'latency-fast'
            : item.latency <= 1000 ? 'latency-medium' : 'latency-slow';
          const metaEl = document.createElement('div');
          metaEl.className = 'meta';
          metaEl.textContent = 'Latency: ' + (typeof item.latency === 'number' ? item.latency + ' ms' : '—');
          const bar = document.createElement('div');
          bar.className = 'latency-bar ' + latencyClass;
          metaEl.appendChild(bar);
          tile.appendChild(metaEl);
        }

        // Uptime
        if (tf.uptime !== false) {
          const m = document.createElement('div');
          m.className = 'meta';
          m.textContent = item.uptimeStats;
          tile.appendChild(m);
        }

        // Time since submission
        if (tf.timeSinceSubmission) {
          const m = document.createElement('div');
          m.className = 'meta';
          m.textContent = 'Submitted ' + item.timeSinceSubmission;
          tile.appendChild(m);
        }

        // Comments
        if (tf.comments && item.comments) {
          const m = document.createElement('div');
          m.className = 'meta';
          m.textContent = item.comments;
          tile.appendChild(m);
        }

        // Links
        const links = [];
        if (tf.github !== false && item.github) links.push({ href: item.github, label: 'GitHub' });
        if (tf.documentation && item.documentation) links.push({ href: item.documentation, label: 'Docs' });
        if (links.length) {
          const linksEl = document.createElement('div');
          linksEl.className = 'links';
          links.forEach(({ href, label }) => {
            const a = document.createElement('a');
            a.href = href;
            a.target = '_blank';
            a.textContent = label;
            a.onclick = e => e.stopPropagation();
            linksEl.appendChild(a);
          });
          tile.appendChild(linksEl);
        }

        dashboard.appendChild(tile);
      });
    }

    function setupWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(protocol + '//' + window.location.host);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        updateTileStatus(data.url, data.status);
      };
      ws.onclose = () => setTimeout(setupWebSocket, 5000);
    }

    function updateTileStatus(url, status) {
      const tile = document.querySelector('.tile[data-url="' + CSS.escape(url) + '"]');
      if (!tile) return;
      tile.className = tile.className.replace(/\b(online|offline|degraded|unknown)\b/, status);
      const statusEl = tile.querySelector('.status');
      if (statusEl) {
        statusEl.className = 'status ' + status;
        statusEl.textContent = { online: 'Online', offline: 'Offline', degraded: 'Degraded', unknown: 'Unknown' }[status] || status;
      }
      tile.style.animation = 'pulse 0.5s';
      tile.addEventListener('animationend', () => { tile.style.animation = ''; }, { once: true });
    }

    window.addEventListener('hashchange', () => {
      const slug = window.location.hash.replace('#', '');
      if (slug && slug !== currentSlug && programs.find(p => p.slug === slug)) selectProgram(slug);
    });

    document.addEventListener('DOMContentLoaded', () => {
      loadPrograms();
      setupWebSocket();
      setInterval(() => { if (currentSlug) fetchData(currentSlug); }, 5 * 60 * 1000);
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Open browser and verify**

```bash
node server.js
```

Open http://localhost:3000. Verify:
- Sidebar appears on the left with logo
- Programs load (empty list if none created yet)
- URL hash updates on tab click (`/#node-ti`)
- Tiles render with `tileFields`-controlled fields

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: rewrite public dashboard with sidebar navigation and tileFields-driven tiles"
```

---

### Task 9: Rewrite `public/admin.html`

**Files:**
- Modify: `public/admin.html` (full rewrite)

Note: User-supplied fields in the Servers tab are set via `textContent`, not string interpolation, to prevent XSS. Program names (admin-controlled) are used in template literals.

- [ ] **Step 1: Replace the entire file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin — VIVES Monitoring</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; }

    .sidebar {
      width: 200px; background: #1a1a2e; position: fixed;
      left: 0; top: 0; height: 100vh; display: flex; flex-direction: column;
    }
    .sidebar-logo {
      padding: 16px 14px; border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex; align-items: center; gap: 10px;
    }
    .sidebar-logo img { height: 32px; }
    .sidebar-logo span { color: white; font-weight: bold; font-size: 14px; }
    .sidebar-nav { flex: 1; padding: 8px 0; overflow-y: auto; }
    .sidebar-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 11px 16px; color: #aaa; cursor: pointer; font-size: 14px; transition: background 0.15s;
    }
    .sidebar-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
    .sidebar-item.active { background: #e53935; color: #fff; font-weight: bold; }
    .sidebar-item .badge { background: rgba(255,255,255,0.15); border-radius: 10px; padding: 1px 7px; font-size: 11px; }
    .sidebar-item.active .badge { background: rgba(255,255,255,0.25); }
    .sidebar-add {
      padding: 10px 16px; color: #ffb74d; cursor: pointer; font-size: 13px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }
    .sidebar-add:hover { color: #ffa726; }
    .sidebar-footer { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.1); }
    .sidebar-footer a { color: #e53935; font-size: 13px; cursor: pointer; text-decoration: none; }

    .main { margin-left: 200px; min-height: 100vh; padding: 24px; }

    .login-screen {
      display: none; position: fixed; inset: 0; background: #f5f5f5;
      z-index: 999; align-items: center; justify-content: center;
    }
    .login-form { max-width: 400px; width: 90%; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    .login-form h2 { margin-bottom: 20px; }

    .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.08); margin-bottom: 20px; }
    .card h3 { margin-bottom: 16px; font-size: 16px; }

    .subtabs { display: flex; border-bottom: 2px solid #eee; margin-bottom: 20px; }
    .subtab { padding: 10px 20px; cursor: pointer; color: #888; font-size: 14px; border-bottom: 2px solid transparent; margin-bottom: -2px; }
    .subtab.active { color: #e53935; border-bottom-color: #e53935; font-weight: bold; }

    .program-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .program-header h2 { font-size: 20px; }

    .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .btn-primary { background: #2196F3; color: white; } .btn-primary:hover { background: #1976D2; }
    .btn-success { background: #4CAF50; color: white; } .btn-success:hover { background: #388E3C; }
    .btn-danger  { background: #F44336; color: white; } .btn-danger:hover  { background: #D32F2F; }
    .btn-warning { background: #FF9800; color: white; } .btn-warning:hover { background: #F57C00; }
    .btn-sm { padding: 5px 10px; font-size: 12px; }

    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 13px; }
    .form-group input, .form-group textarea {
      width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;
    }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

    .server-item { padding: 14px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
    .server-item:last-child { border-bottom: none; }
    .server-item.hidden { opacity: 0.55; background: #fafafa; }
    .server-actions { display: flex; gap: 8px; flex-shrink: 0; }

    .toggle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; background: #f9f9f9; border-radius: 6px; padding: 10px 14px; }
    .toggle-label { font-size: 14px; }
    .toggle-switch { position: relative; width: 36px; height: 20px; cursor: pointer; }
    .toggle-switch input { display: none; }
    .toggle-track { position: absolute; inset: 0; background: #ccc; border-radius: 10px; transition: background 0.2s; }
    .toggle-track::after { content: ''; position: absolute; width: 16px; height: 16px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: left 0.2s; }
    .toggle-switch input:checked + .toggle-track { background: #4CAF50; }
    .toggle-switch input:checked + .toggle-track::after { left: 18px; }

    .badge-status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    .badge-status.online  { background: #E8F5E9; color: #4CAF50; }
    .badge-status.offline { background: #FFEBEE; color: #F44336; }
    .badge-status.unknown { background: #FFF8E1; color: #FFA000; }

    .msg-success { color: #4CAF50; background: #E8F5E9; padding: 10px; border-radius: 4px; margin-top: 10px; }
    .msg-error   { color: #F44336; background: #FFEBEE; padding: 10px; border-radius: 4px; margin-top: 10px; }

    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .stat-box { background: #f9f9f9; border-radius: 6px; padding: 14px; text-align: center; }
    .stat-box .stat-value { font-size: 24px; font-weight: bold; }
    .stat-box .stat-label { color: #666; font-size: 13px; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; border: 1px solid #eee; text-align: left; }
    th { background: #f5f5f5; }

    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; }
    .modal-box { background: white; border-radius: 8px; padding: 30px; width: 90%; max-height: 90vh; overflow-y: auto; }
  </style>
</head>
<body>

  <div class="login-screen" id="login-screen">
    <div class="login-form">
      <h2>Admin Login</h2>
      <form id="login-form">
        <div class="form-group"><label>Password</label><input type="password" id="password" required></div>
        <button type="submit" class="btn btn-primary">Login</button>
      </form>
      <div id="login-error" style="display:none;" class="msg-error"></div>
    </div>
  </div>

  <aside class="sidebar" id="sidebar" style="display:none;">
    <div class="sidebar-logo">
      <img src="/img/logo.svg" alt="Logo" />
      <span>Admin</span>
    </div>
    <nav class="sidebar-nav" id="sidebar-nav"></nav>
    <div class="sidebar-add" onclick="showAddProgramModal()">+ Add Program</div>
    <div class="sidebar-footer"><a onclick="logout()">Logout</a></div>
  </aside>

  <main class="main" id="main-content" style="display:none;">
    <div id="content-area"></div>
  </main>

  <!-- Add Program Modal -->
  <div class="modal-overlay" id="add-program-modal">
    <div class="modal-box" style="max-width:400px;">
      <h3 style="margin-bottom:16px;">Add Program</h3>
      <div class="form-group">
        <label>Program Name</label>
        <input type="text" id="new-program-name" placeholder="e.g. Node TI">
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-primary" onclick="createProgram()">Create</button>
        <button class="btn" style="background:#666;color:white;" onclick="hideModal('add-program-modal')">Cancel</button>
      </div>
      <div id="add-program-msg"></div>
    </div>
  </div>

  <!-- Edit Server Modal -->
  <div class="modal-overlay" id="edit-server-modal">
    <div class="modal-box" style="max-width:600px;">
      <h3 style="margin-bottom:16px;">Edit Server</h3>
      <input type="hidden" id="edit-server-id">
      <div class="form-row">
        <div class="form-group"><label>Name *</label><input type="text" id="edit-name"></div>
        <div class="form-group"><label>URL *</label><input type="url" id="edit-url"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Email</label><input type="email" id="edit-email"></div>
        <div class="form-group"><label>GitHub URL</label><input type="url" id="edit-github"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Documentation URL</label><input type="url" id="edit-documentation"></div>
        <div class="form-group"><label>Comments</label><input type="text" id="edit-comments"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-primary" onclick="submitEditServer()">Save</button>
        <button class="btn" style="background:#666;color:white;" onclick="hideModal('edit-server-modal')">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Add Server Modal -->
  <div class="modal-overlay" id="add-server-modal">
    <div class="modal-box" style="max-width:600px;">
      <h3 style="margin-bottom:16px;">Add Server Manually</h3>
      <input type="hidden" id="add-server-program-id">
      <div class="form-row">
        <div class="form-group"><label>Name *</label><input type="text" id="add-name"></div>
        <div class="form-group"><label>URL *</label><input type="url" id="add-url" placeholder="https://example.com"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Email</label><input type="email" id="add-email"></div>
        <div class="form-group"><label>GitHub URL</label><input type="url" id="add-github"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Documentation URL</label><input type="url" id="add-documentation"></div>
        <div class="form-group"><label>Comments</label><input type="text" id="add-comments"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-primary" onclick="submitAddServer()">Add Server</button>
        <button class="btn" style="background:#666;color:white;" onclick="hideModal('add-server-modal')">Cancel</button>
      </div>
      <div id="add-server-msg"></div>
    </div>
  </div>

  <script>
    let programs = [];
    let currentProgramId = null;
    let serversCache = [];

    function showModal(id) { document.getElementById(id).style.display = 'flex'; }
    function hideModal(id) { document.getElementById(id).style.display = 'none'; }

    // ── Auth ──────────────────────────────────────────────────────────────
    async function checkAuth() {
      const res = await fetch('/api/admin/check-auth', { credentials: 'same-origin' });
      const data = await res.json();
      data.authenticated ? showAdmin() : showLoginScreen();
    }

    function showLoginScreen() {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('sidebar').style.display = 'none';
      document.getElementById('main-content').style.display = 'none';
    }

    function showAdmin() {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('sidebar').style.display = 'flex';
      document.getElementById('main-content').style.display = 'block';
      loadPrograms();
    }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password: document.getElementById('password').value })
      });
      const data = await res.json();
      if (data.success) {
        showAdmin();
      } else {
        const err = document.getElementById('login-error');
        err.textContent = 'Invalid password';
        err.style.display = 'block';
      }
    });

    async function logout() {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
      showLoginScreen();
    }

    // ── Programs sidebar ──────────────────────────────────────────────────
    async function loadPrograms() {
      const res = await fetch('/api/admin/programs', { credentials: 'same-origin' });
      programs = await res.json();
      renderSidebar();
      if (programs.length > 0) selectProgram(programs[0]._id);
      else showNoProgramsView();
    }

    async function reloadPrograms() {
      const res = await fetch('/api/admin/programs', { credentials: 'same-origin' });
      programs = await res.json();
      renderSidebar();
    }

    function renderSidebar() {
      const nav = document.getElementById('sidebar-nav');
      nav.textContent = '';
      programs.forEach(p => {
        const item = document.createElement('div');
        item.className = 'sidebar-item' + (p._id === currentProgramId ? ' active' : '');
        item.onclick = () => selectProgram(p._id);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;

        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = p.serverCount;

        item.appendChild(nameSpan);
        item.appendChild(badge);
        nav.appendChild(item);
      });
    }

    function selectProgram(id) {
      currentProgramId = id;
      renderSidebar();
      showProgramView(id);
    }

    function showNoProgramsView() {
      const area = document.getElementById('content-area');
      area.textContent = '';
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'text-align:center;padding:60px 20px;color:#888;';
      const p = document.createElement('p');
      p.style.marginBottom = '16px';
      p.textContent = 'No programs configured yet.';
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = '+ Add First Program';
      btn.onclick = showAddProgramModal;
      wrapper.appendChild(p);
      wrapper.appendChild(btn);
      area.appendChild(wrapper);
    }

    // ── Program view with sub-tabs ─────────────────────────────────────────
    function showProgramView(programId) {
      const program = programs.find(p => p._id === programId);
      if (!program) return;
      const area = document.getElementById('content-area');
      area.textContent = '';

      // Header
      const header = document.createElement('div');
      header.className = 'program-header';

      const titleBlock = document.createElement('div');
      const h2 = document.createElement('h2');
      h2.textContent = program.name;
      const countSpan = document.createElement('span');
      countSpan.style.cssText = 'color:#888;font-size:13px;';
      countSpan.textContent = program.serverCount + ' servers';
      titleBlock.appendChild(h2);
      titleBlock.appendChild(countSpan);

      const btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display:flex;gap:8px;';

      const renameBtn = document.createElement('button');
      renameBtn.className = 'btn btn-warning btn-sm';
      renameBtn.textContent = 'Rename';
      renameBtn.onclick = () => showRenameProgramModal(program._id, program.name);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-danger btn-sm';
      deleteBtn.textContent = 'Delete Program';
      deleteBtn.onclick = () => confirmDeleteProgram(program._id, program.name);

      const dashLink = document.createElement('a');
      dashLink.href = '/';
      dashLink.className = 'btn btn-sm';
      dashLink.style.cssText = 'background:#666;color:white;text-decoration:none;';
      dashLink.textContent = 'Dashboard';

      btnGroup.appendChild(renameBtn);
      btnGroup.appendChild(deleteBtn);
      btnGroup.appendChild(dashLink);
      header.appendChild(titleBlock);
      header.appendChild(btnGroup);
      area.appendChild(header);

      // Sub-tabs
      const tabs = document.createElement('div');
      tabs.className = 'subtabs';
      [['servers','Servers'],['tile-fields','Tile Fields'],['csv-mapping','CSV Mapping'],['access-logs','Access Logs']].forEach(([key, label], i) => {
        const tab = document.createElement('div');
        tab.className = 'subtab' + (i === 0 ? ' active' : '');
        tab.textContent = label;
        tab.onclick = () => switchSubtab(tab, key);
        tabs.appendChild(tab);
      });
      area.appendChild(tabs);

      const content = document.createElement('div');
      content.id = 'subtab-content';
      area.appendChild(content);

      loadServersTab(programId);
    }

    function switchSubtab(el, tab) {
      document.querySelectorAll('.subtab').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      const id = currentProgramId;
      if (tab === 'servers')      loadServersTab(id);
      else if (tab === 'tile-fields')  loadTileFieldsTab(id);
      else if (tab === 'csv-mapping')  loadCsvMappingTab(id);
      else if (tab === 'access-logs')  loadAccessLogsTab();
    }

    // ── Servers tab ───────────────────────────────────────────────────────
    async function loadServersTab(programId) {
      const content = document.getElementById('subtab-content');
      content.textContent = 'Loading...';
      const res = await fetch('/api/admin/servers', { credentials: 'same-origin' });
      const all = await res.json();
      serversCache = all.filter(s => {
        const prog = s.program;
        return prog === programId || prog?._id === programId || prog?.toString?.() === programId;
      });
      renderServersTab(programId);
    }

    function renderServersTab(programId) {
      const content = document.getElementById('subtab-content');
      content.textContent = '';

      const card = document.createElement('div');
      card.className = 'card';

      // Card header
      const cardHeader = document.createElement('div');
      cardHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
      const cardTitle = document.createElement('h3');
      cardTitle.style.margin = '0';
      cardTitle.textContent = 'Servers';

      const btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display:flex;gap:8px;';

      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-success btn-sm';
      addBtn.textContent = 'Add Manually';
      addBtn.onclick = () => showAddServerModal(programId);

      const uploadLabel = document.createElement('label');
      uploadLabel.className = 'btn btn-primary btn-sm';
      uploadLabel.style.cursor = 'pointer';
      uploadLabel.textContent = 'Upload CSV';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.csv';
      fileInput.style.display = 'none';
      fileInput.onchange = (e) => handleCsvUpload(e, programId);
      uploadLabel.appendChild(fileInput);

      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn btn-danger btn-sm';
      clearBtn.textContent = 'Clear DB';
      clearBtn.onclick = confirmClearDatabase;

      btnGroup.appendChild(addBtn);
      btnGroup.appendChild(uploadLabel);
      btnGroup.appendChild(clearBtn);
      cardHeader.appendChild(cardTitle);
      cardHeader.appendChild(btnGroup);
      card.appendChild(cardHeader);

      // Server list
      const list = document.createElement('div');
      list.id = 'servers-list';

      if (serversCache.length === 0) {
        const p = document.createElement('p');
        p.style.color = '#888';
        p.textContent = 'No servers in this program yet.';
        list.appendChild(p);
      } else {
        serversCache.forEach(s => {
          const item = document.createElement('div');
          item.className = 'server-item' + (s.hidden ? ' hidden' : '');

          const info = document.createElement('div');
          info.style.flex = '1';

          const nameEl = document.createElement('div');
          nameEl.style.fontWeight = 'bold';
          nameEl.style.fontSize = '15px';
          nameEl.textContent = s.name;
          if (s.hidden) {
            const badge = document.createElement('span');
            badge.style.cssText = 'background:#FF9800;color:white;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:6px;';
            badge.textContent = 'HIDDEN';
            nameEl.appendChild(badge);
          }

          const urlEl = document.createElement('div');
          urlEl.style.cssText = 'color:#666;font-size:12px;margin:3px 0;';
          urlEl.textContent = s.url;

          const statusBadge = document.createElement('span');
          statusBadge.className = 'badge-status ' + s.currentStatus;
          statusBadge.textContent = s.currentStatus;

          info.appendChild(nameEl);
          info.appendChild(urlEl);
          info.appendChild(statusBadge);

          if (s.email) {
            const emailSpan = document.createElement('span');
            emailSpan.style.cssText = 'color:#888;font-size:12px;margin-left:8px;';
            emailSpan.textContent = s.email;
            info.appendChild(emailSpan);
          }

          const actions = document.createElement('div');
          actions.className = 'server-actions';

          const editBtn = document.createElement('button');
          editBtn.className = 'btn btn-primary btn-sm';
          editBtn.textContent = 'Edit';
          editBtn.onclick = () => showEditModal(s._id);

          const toggleBtn = document.createElement('button');
          toggleBtn.className = s.hidden ? 'btn btn-success btn-sm' : 'btn btn-warning btn-sm';
          toggleBtn.textContent = s.hidden ? 'Unhide' : 'Hide';
          toggleBtn.onclick = () => toggleHide(s._id, !s.hidden);

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'btn btn-danger btn-sm';
          deleteBtn.textContent = 'Delete';
          deleteBtn.onclick = () => confirmDeleteServer(s._id, s.name);

          actions.appendChild(editBtn);
          actions.appendChild(toggleBtn);
          actions.appendChild(deleteBtn);

          item.appendChild(info);
          item.appendChild(actions);
          list.appendChild(item);
        });
      }

      const msgDiv = document.createElement('div');
      msgDiv.id = 'servers-msg';

      card.appendChild(list);
      card.appendChild(msgDiv);
      content.appendChild(card);
    }

    async function handleCsvUpload(event, programId) {
      const file = event.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('csvFile', file);
      const msgEl = document.getElementById('servers-msg');
      msgEl.className = '';
      msgEl.textContent = 'Uploading...';
      try {
        const res = await fetch('/api/admin/programs/' + programId + '/upload-csv', {
          method: 'POST', credentials: 'same-origin', body: formData
        });
        const data = await res.json();
        msgEl.className = data.success ? 'msg-success' : 'msg-error';
        msgEl.textContent = data.success ? data.message : data.error;
        if (data.success) { await reloadPrograms(); loadServersTab(programId); }
      } catch (err) {
        msgEl.className = 'msg-error';
        msgEl.textContent = err.message;
      }
      event.target.value = '';
    }

    async function toggleHide(id, hide) {
      await fetch('/api/admin/servers/' + id + '/' + (hide ? 'hide' : 'unhide'), { method: 'POST', credentials: 'same-origin' });
      loadServersTab(currentProgramId);
    }

    function confirmDeleteServer(id, name) {
      if (confirm('Delete "' + name + '"? Cannot be undone.')) deleteServer(id);
    }

    async function deleteServer(id) {
      await fetch('/api/admin/servers/' + id, { method: 'DELETE', credentials: 'same-origin' });
      loadServersTab(currentProgramId);
    }

    function confirmClearDatabase() {
      if (confirm('Delete ALL servers? Cannot be undone.') && confirm('Absolutely sure?')) clearDatabase();
    }

    async function clearDatabase() {
      await fetch('/api/admin/clear-database', { method: 'POST', credentials: 'same-origin' });
      await reloadPrograms();
      loadServersTab(currentProgramId);
    }

    function showEditModal(id) {
      const s = serversCache.find(s => s._id === id);
      if (!s) return;
      ['name','url','email','github','documentation','comments'].forEach(f => {
        document.getElementById('edit-' + f).value = s[f] || '';
      });
      document.getElementById('edit-server-id').value = s._id;
      showModal('edit-server-modal');
    }

    async function submitEditServer() {
      const id = document.getElementById('edit-server-id').value;
      const data = {};
      ['name','url','email','github','documentation','comments'].forEach(f => {
        data[f] = document.getElementById('edit-' + f).value;
      });
      await fetch('/api/admin/servers/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify(data)
      });
      hideModal('edit-server-modal');
      loadServersTab(currentProgramId);
    }

    function showAddServerModal(programId) {
      document.getElementById('add-server-program-id').value = programId;
      ['name','url','email','github','documentation','comments'].forEach(f => {
        document.getElementById('add-' + f).value = '';
      });
      document.getElementById('add-server-msg').textContent = '';
      showModal('add-server-modal');
    }

    async function submitAddServer() {
      const programId = document.getElementById('add-server-program-id').value;
      const data = { programId };
      ['name','url','email','github','documentation','comments'].forEach(f => {
        data[f] = document.getElementById('add-' + f).value;
      });
      data.submissionTime = new Date().toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }).replace(',', '');
      const res = await fetch('/api/admin/servers/manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify(data)
      });
      const result = await res.json();
      const msgEl = document.getElementById('add-server-msg');
      msgEl.className = result.success ? 'msg-success' : 'msg-error';
      msgEl.textContent = result.success ? 'Server added!' : result.error;
      if (result.success) setTimeout(() => { hideModal('add-server-modal'); loadServersTab(programId); }, 800);
    }

    // ── Tile Fields tab ───────────────────────────────────────────────────
    async function loadTileFieldsTab(programId) {
      const content = document.getElementById('subtab-content');
      content.textContent = 'Loading...';
      const res = await fetch('/api/admin/programs/' + programId + '/fields', { credentials: 'same-origin' });
      const fields = await res.json();

      const defs = [
        { key: 'latency',             label: 'Latency (ms)' },
        { key: 'uptime',              label: 'Uptime %' },
        { key: 'submissionCount',     label: 'Submission count' },
        { key: 'github',              label: 'GitHub link' },
        { key: 'documentation',       label: 'Documentation link' },
        { key: 'timeSinceSubmission', label: 'Time since submission' },
        { key: 'comments',            label: 'Comments' },
      ];

      content.textContent = '';
      const card = document.createElement('div');
      card.className = 'card';

      const h3 = document.createElement('h3');
      h3.textContent = 'Tile Fields';
      const note = document.createElement('p');
      note.style.cssText = 'color:#888;font-size:13px;margin-bottom:16px;';
      note.textContent = 'Status indicator is always shown.';

      const grid = document.createElement('div');
      grid.className = 'toggle-grid';

      defs.forEach(({ key, label }) => {
        const row = document.createElement('div');
        row.className = 'toggle-row';

        const labelEl = document.createElement('span');
        labelEl.className = 'toggle-label';
        labelEl.textContent = label;

        const sw = document.createElement('label');
        sw.className = 'toggle-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = 'tf-' + key;
        input.checked = !!fields[key];
        const track = document.createElement('div');
        track.className = 'toggle-track';
        sw.appendChild(input);
        sw.appendChild(track);

        row.appendChild(labelEl);
        row.appendChild(sw);
        grid.appendChild(row);
      });

      const footer = document.createElement('div');
      footer.style.cssText = 'margin-top:16px;text-align:right;';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-primary';
      saveBtn.textContent = 'Save Fields';
      saveBtn.onclick = () => saveTileFields(programId);
      footer.appendChild(saveBtn);

      const msgDiv = document.createElement('div');
      msgDiv.id = 'fields-msg';

      card.appendChild(h3);
      card.appendChild(note);
      card.appendChild(grid);
      card.appendChild(footer);
      card.appendChild(msgDiv);
      content.appendChild(card);
    }

    async function saveTileFields(programId) {
      const keys = ['latency','uptime','submissionCount','github','documentation','timeSinceSubmission','comments'];
      const body = {};
      keys.forEach(k => { body[k] = document.getElementById('tf-' + k)?.checked ?? false; });
      const res = await fetch('/api/admin/programs/' + programId + '/fields', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify(body)
      });
      const result = await res.json();
      const msgEl = document.getElementById('fields-msg');
      msgEl.className = result.success ? 'msg-success' : 'msg-error';
      msgEl.textContent = result.success ? 'Fields saved!' : result.error;
      if (result.success) {
        const prog = programs.find(p => p._id === programId);
        if (prog) prog.tileFields = result.tileFields;
      }
    }

    // ── CSV Mapping tab ───────────────────────────────────────────────────
    async function loadCsvMappingTab(programId) {
      const content = document.getElementById('subtab-content');
      content.textContent = 'Loading...';
      const res = await fetch('/api/admin/programs/' + programId + '/csv-mapping', { credentials: 'same-origin' });
      const m = await res.json();
      content.textContent = '';

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>CSV Column Mapping</h3>
        <p style="color:#888;font-size:13px;margin-bottom:16px;">Column indices start at 0.</p>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group"><label>Separator</label><input type="text" id="m-separator" value="" style="max-width:80px;"></div>
          <div class="form-group"><label>Skip Lines</label><input type="number" id="m-skipLines" value="1" min="0" style="max-width:80px;"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Name Column</label><input type="number" id="m-nameColumn" value="4" min="0"></div>
          <div class="form-group"><label>URL Column</label><input type="number" id="m-urlColumn" value="8" min="0"></div>
          <div class="form-group"><label>Email Column</label><input type="number" id="m-emailColumn" value="3" min="0"></div>
          <div class="form-group"><label>GitHub Column</label><input type="number" id="m-githubColumn" value="7" min="0"></div>
          <div class="form-group"><label>Documentation Column</label><input type="number" id="m-documentationColumn" value="9" min="0"></div>
          <div class="form-group"><label>Submission Time Column</label><input type="number" id="m-submissionTimeColumn" value="2" min="0"></div>
          <div class="form-group"><label>Comments Column</label><input type="number" id="m-commentsColumn" value="20" min="0"></div>
        </div>
        <div style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="save-mapping-btn">Save Mapping</button>
          <button class="btn btn-sm" style="background:#666;color:white;" id="preview-csv-btn">Preview CSV</button>
        </div>
        <div id="mapping-msg"></div>
        <div id="csv-preview" style="margin-top:16px;overflow-x:auto;"></div>
      `;

      // Set values after creating DOM (avoids XSS via m.separator etc.)
      card.querySelector('#m-separator').value = m.separator || ';';
      card.querySelector('#m-skipLines').value = m.skipLines ?? 1;
      card.querySelector('#m-nameColumn').value = m.nameColumn ?? 4;
      card.querySelector('#m-urlColumn').value = m.urlColumn ?? 8;
      card.querySelector('#m-emailColumn').value = m.emailColumn ?? 3;
      card.querySelector('#m-githubColumn').value = m.githubColumn ?? 7;
      card.querySelector('#m-documentationColumn').value = m.documentationColumn ?? 9;
      card.querySelector('#m-submissionTimeColumn').value = m.submissionTimeColumn ?? 2;
      card.querySelector('#m-commentsColumn').value = m.commentsColumn ?? 20;

      card.querySelector('#save-mapping-btn').onclick = () => saveCsvMapping(programId);
      card.querySelector('#preview-csv-btn').onclick = () => loadCsvPreview(programId);

      content.appendChild(card);
    }

    async function saveCsvMapping(programId) {
      const fields = ['separator','skipLines','nameColumn','urlColumn','emailColumn','githubColumn','documentationColumn','submissionTimeColumn','commentsColumn'];
      const body = {};
      fields.forEach(f => {
        const el = document.getElementById('m-' + f);
        body[f] = el.type === 'number' ? parseInt(el.value) : el.value;
      });
      const res = await fetch('/api/admin/programs/' + programId + '/csv-mapping', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify(body)
      });
      const result = await res.json();
      const msgEl = document.getElementById('mapping-msg');
      msgEl.className = result.success ? 'msg-success' : 'msg-error';
      msgEl.textContent = result.success ? 'Mapping saved!' : result.error;
    }

    async function loadCsvPreview(programId) {
      const res = await fetch('/api/admin/programs/' + programId + '/csv-preview', { credentials: 'same-origin' });
      const data = await res.json();
      const preview = document.getElementById('csv-preview');
      preview.textContent = '';
      if (!data.headers?.length) {
        const p = document.createElement('p');
        p.style.color = '#888';
        p.textContent = data.message || 'No CSV uploaded yet.';
        preview.appendChild(p);
        return;
      }
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      data.headers.forEach((h, i) => {
        const th = document.createElement('th');
        th.textContent = 'Col ' + i + ' — ' + h.substring(0, 20);
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      data.preview.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
          const td = document.createElement('td');
          td.textContent = cell ? cell.substring(0, 30) : '';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      preview.appendChild(table);
    }

    // ── Access Logs tab ───────────────────────────────────────────────────
    async function loadAccessLogsTab() {
      const content = document.getElementById('subtab-content');
      content.textContent = 'Loading...';
      const [statsRes, logsRes, uniqueRes] = await Promise.all([
        fetch('/api/admin/access-logs/stats', { credentials: 'same-origin' }),
        fetch('/api/admin/access-logs?limit=50', { credentials: 'same-origin' }),
        fetch('/api/admin/access-logs/unique', { credentials: 'same-origin' })
      ]);
      const stats = await statsRes.json();
      const logsData = await logsRes.json();
      const uniqueData = await uniqueRes.json();
      const adminVisits = stats.topPaths?.find(p => p._id.includes('/admin'))?.count || 0;
      content.textContent = '';

      const card = document.createElement('div');
      card.className = 'card';

      // Header
      const cardHeader = document.createElement('div');
      cardHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
      const cardTitle = document.createElement('h3');
      cardTitle.style.margin = '0';
      cardTitle.textContent = 'Access Logs (Last 24h)';
      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn btn-danger btn-sm';
      clearBtn.textContent = 'Clear Logs';
      clearBtn.onclick = confirmClearAccessLogs;
      cardHeader.appendChild(cardTitle);
      cardHeader.appendChild(clearBtn);
      card.appendChild(cardHeader);

      // Stats
      const statsGrid = document.createElement('div');
      statsGrid.className = 'stats-grid';
      [
        { value: stats.totalToday || 0, label: 'Total Visits', color: '#2196F3' },
        { value: stats.uniqueIPsToday || 0, label: 'Unique IPs', color: '#4CAF50' },
        { value: stats.uniqueUsers || 0, label: 'Unique Users', color: '#9C27B0' },
        { value: adminVisits, label: 'Admin Visits', color: '#FF9800' }
      ].forEach(({ value, label, color }) => {
        const box = document.createElement('div');
        box.className = 'stat-box';
        const v = document.createElement('div');
        v.className = 'stat-value';
        v.style.color = color;
        v.textContent = value;
        const l = document.createElement('div');
        l.className = 'stat-label';
        l.textContent = label;
        box.appendChild(v);
        box.appendChild(l);
        statsGrid.appendChild(box);
      });
      card.appendChild(statsGrid);

      // Logs table
      const logsWrapper = document.createElement('div');
      logsWrapper.style.cssText = 'max-height:300px;overflow-y:auto;margin-bottom:24px;';
      if (!logsData.logs?.length) {
        const p = document.createElement('p');
        p.style.color = '#888';
        p.textContent = 'No logs yet.';
        logsWrapper.appendChild(p);
      } else {
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Time</th><th>User</th><th>IP</th><th>Path</th></tr>';
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        logsData.logs.forEach(l => {
          const tr = document.createElement('tr');
          [
            new Date(l.timestamp).toLocaleString(),
            l.cloudflareEmail || '—',
            l.ip,
            l.path
          ].forEach((val, i) => {
            const td = document.createElement('td');
            td.textContent = val;
            if (i === 2) td.style.fontFamily = 'monospace';
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        logsWrapper.appendChild(table);
      }
      card.appendChild(logsWrapper);

      // Unique visitors
      const uvTitle = document.createElement('h3');
      uvTitle.style.marginBottom = '12px';
      uvTitle.textContent = 'Unique Visitors';
      card.appendChild(uvTitle);

      const uvGrid = document.createElement('div');
      uvGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:20px;';

      const buildUVTable = (title, rows, cols) => {
        const div = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.style.marginBottom = '8px';
        h4.textContent = title;
        div.appendChild(h4);
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const hr = document.createElement('tr');
        cols.forEach(c => { const th = document.createElement('th'); th.textContent = c; hr.appendChild(th); });
        thead.appendChild(hr);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        if (!rows.length) {
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = cols.length;
          td.textContent = 'No data';
          tr.appendChild(td);
          tbody.appendChild(tr);
        } else {
          rows.forEach(r => {
            const tr = document.createElement('tr');
            r.forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
            tbody.appendChild(tr);
          });
        }
        table.appendChild(tbody);
        div.appendChild(table);
        return div;
      };

      uvGrid.appendChild(buildUVTable('IP Addresses',
        (uniqueData.ips || []).map(i => [i.ip, i.accessCount, new Date(i.lastAccess).toLocaleString()]),
        ['IP', 'Visits', 'Last Access']));

      uvGrid.appendChild(buildUVTable('Authenticated Users',
        (uniqueData.users || []).map(u => [u.email, u.accessCount, new Date(u.lastAccess).toLocaleString()]),
        ['Email', 'Visits', 'Last Access']));

      card.appendChild(uvGrid);
      content.appendChild(card);
    }

    function confirmClearAccessLogs() {
      if (confirm('Clear all access logs?')) clearAccessLogs();
    }

    async function clearAccessLogs() {
      await fetch('/api/admin/access-logs/clear', { method: 'DELETE', credentials: 'same-origin' });
      loadAccessLogsTab();
    }

    // ── Program management ─────────────────────────────────────────────────
    function showAddProgramModal() {
      document.getElementById('new-program-name').value = '';
      document.getElementById('add-program-msg').textContent = '';
      showModal('add-program-modal');
    }

    async function createProgram() {
      const name = document.getElementById('new-program-name').value.trim();
      if (!name) return;
      const res = await fetch('/api/admin/programs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ name })
      });
      const result = await res.json();
      if (result.success) {
        hideModal('add-program-modal');
        await reloadPrograms();
        selectProgram(result.program._id);
      } else {
        const msgEl = document.getElementById('add-program-msg');
        msgEl.className = 'msg-error';
        msgEl.textContent = result.error;
      }
    }

    function showRenameProgramModal(id, currentName) {
      const name = prompt('New program name:', currentName);
      if (name && name !== currentName) renameProgram(id, name);
    }

    async function renameProgram(id, name) {
      await fetch('/api/admin/programs/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ name })
      });
      await reloadPrograms();
      showProgramView(id);
    }

    function confirmDeleteProgram(id, name) {
      if (confirm('Delete program "' + name + '"? Servers will be unlinked but not deleted.')) deleteProgram(id);
    }

    async function deleteProgram(id) {
      await fetch('/api/admin/programs/' + id, { method: 'DELETE', credentials: 'same-origin' });
      await reloadPrograms();
      if (programs.length > 0) selectProgram(programs[0]._id);
      else showNoProgramsView();
    }

    document.addEventListener('DOMContentLoaded', checkAuth);
  </script>
</body>
</html>
```

- [ ] **Step 2: Start server and test the full admin flow**

```bash
node server.js
```

Open http://localhost:3000/admin.html. Verify:
1. Login works
2. Sidebar shows; `+ Add Program` creates a program visible in sidebar
3. Per-program Servers / Tile Fields / CSV Mapping / Access Logs sub-tabs all load
4. Tile field toggles save and are reflected on the public dashboard
5. CSV upload assigns servers to the correct program
6. Access logs display correctly

- [ ] **Step 3: Commit**

```bash
git add public/admin.html
git commit -m "feat: rewrite admin panel with program sidebar and per-program sub-tabs"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Full flow from clean state**

1. Log in to admin panel
2. Create 4 programs: "Node TI", "Node AO", "Cloud Infrastructure", "DevOps"
3. Set different tile field configs for two programs (e.g. Node TI shows GitHub, Cloud Infra enables Docs)
4. Upload a real CSV to "Node TI" — verify server count badge updates in sidebar
5. Set CSV column mapping, click "Preview CSV" to confirm columns resolve correctly

- [ ] **Step 2: Verify public dashboard**

1. Open http://localhost:3000 — sidebar shows 4 programs with counts
2. Click "Node TI" — tiles render with the tileFields config you set
3. Click "Node AO" — shows empty state
4. Refresh page — correct tab re-opens from hash (`/#node-ti`)
5. Click a tile — server detail page (server.html) still works

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: multi-program sidebar dashboard — complete"
```
