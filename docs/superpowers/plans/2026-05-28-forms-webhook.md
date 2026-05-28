# Forms Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Power Automate webhook endpoint per program so new Microsoft Forms submissions are ingested automatically without manual CSV exports.

**Architecture:** Power Automate triggers on each new Forms response, maps fields to a fixed JSON body, and POSTs it to `POST /api/webhook/forms/:slug` with a Bearer token. The handler upserts the server record using extracted logic from the existing CSV sync. The admin panel gains a Webhook subtab showing the URL, token, and setup instructions.

**Tech Stack:** Express.js, Mongoose, Node.js `crypto.randomUUID()`, vanilla JS (admin panel)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `models/Program.js` | Modify | Add `webhookToken` and `webhookEnabled` fields |
| `services/databaseService.js` | Modify | Add `syncSingleServer(data, programId)` |
| `routes/webhook.js` | Create | `POST /:slug` — auth + upsert |
| `routes/adminPrograms.js` | Modify | Add `GET/PATCH /:id/webhook` and `PATCH /:id/webhook-token` |
| `server.js` | Modify | Register `/api/webhook/forms` router |
| `public/admin.html` | Modify | Add Webhook subtab |

---

## Task 1: Add webhook fields to Program model

**Files:**
- Modify: `models/Program.js`

- [ ] **Step 1: Add `webhookToken` and `webhookEnabled` to `programSchema`**

In `models/Program.js`, change the `programSchema` definition from:

```js
const programSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  slug:       { type: String, required: true, unique: true },
  order:      { type: Number, default: 0 },
  csvMapping: { type: csvMappingSchema, default: {} },
  tileFields: { type: tileFieldsSchema, default: {} },
  createdAt:  { type: Date, default: Date.now }
});
```

to:

```js
const programSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  slug:           { type: String, required: true, unique: true },
  order:          { type: Number, default: 0 },
  csvMapping:     { type: csvMappingSchema, default: {} },
  tileFields:     { type: tileFieldsSchema, default: {} },
  webhookToken:   { type: String, default: null },
  webhookEnabled: { type: Boolean, default: false },
  createdAt:      { type: Date, default: Date.now }
});
```

- [ ] **Step 2: Verify the app still starts**

```bash
node -e "require('./models/Program'); console.log('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add models/Program.js
git commit -m "feat: add webhookToken and webhookEnabled fields to Program model"
```

---

## Task 2: Add `syncSingleServer` to databaseService

**Files:**
- Modify: `services/databaseService.js`

- [ ] **Step 1: Add the function before the `module.exports` block**

In `services/databaseService.js`, add this function before `module.exports = { ... }`:

```js
async function syncSingleServer(data, programId) {
  const { name, url, email, github, documentation, submissionTime, comments } = data;

  const csvDataHash = JSON.stringify({ name, url, email, github, documentation, submissionTime, comments });

  let server;

  if (email) {
    server = await Server.findOne({ email });

    if (server) {
      const dataChanged = server.lastCsvData !== csvDataHash;
      const urlChanged = server.url !== url;

      server.name = name;
      server.url = url;
      server.github = github;
      server.documentation = documentation;
      server.submissionTime = submissionTime;
      server.comments = comments;
      server.updatedAt = new Date();
      if (programId) server.program = programId;

      if (dataChanged) {
        server.editCount = (server.editCount || 0) + 1;
        server.lastCsvData = csvDataHash;
      }
      if (urlChanged) {
        server.statusHistory = [];
        server.currentStatus = 'unknown';
        server.currentLatency = null;
      }

      await server.save();
    } else {
      const serverByUrl = await Server.findOne({ url });

      if (serverByUrl) {
        const dataChanged = serverByUrl.lastCsvData !== csvDataHash;
        serverByUrl.name = name;
        serverByUrl.email = email;
        serverByUrl.github = github;
        serverByUrl.documentation = documentation;
        serverByUrl.submissionTime = submissionTime;
        serverByUrl.comments = comments;
        serverByUrl.updatedAt = new Date();
        if (programId) serverByUrl.program = programId;
        if (dataChanged) {
          serverByUrl.editCount = (serverByUrl.editCount || 0) + 1;
          serverByUrl.lastCsvData = csvDataHash;
        }
        await serverByUrl.save();
        server = serverByUrl;
      } else {
        server = new Server({
          name, url, email, github, documentation, submissionTime, comments,
          currentStatus: 'unknown', editCount: 0,
          lastCsvData: csvDataHash, program: programId || null
        });
        await server.save();
      }
    }
  } else {
    server = await Server.findOne({ url });

    if (server) {
      const dataChanged = server.lastCsvData !== csvDataHash;
      server.name = name;
      server.email = email;
      server.github = github;
      server.documentation = documentation;
      server.submissionTime = submissionTime;
      server.comments = comments;
      server.updatedAt = new Date();
      if (programId) server.program = programId;
      if (dataChanged) {
        server.editCount = (server.editCount || 0) + 1;
        server.lastCsvData = csvDataHash;
      }
      await server.save();
    } else {
      server = new Server({
        name, url, email, github, documentation, submissionTime, comments,
        currentStatus: 'unknown', editCount: 0,
        lastCsvData: csvDataHash, program: programId || null
      });
      await server.save();
    }
  }

  return server;
}
```

- [ ] **Step 2: Export the new function**

Change the `module.exports` block to include `syncSingleServer`:

```js
module.exports = {
  syncServersFromCSV,
  syncSingleServer,
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

- [ ] **Step 3: Verify the module loads**

```bash
node -e "const db = require('./services/databaseService'); console.log(typeof db.syncSingleServer)"
```

Expected output: `function`

- [ ] **Step 4: Commit**

```bash
git add services/databaseService.js
git commit -m "feat: add syncSingleServer to databaseService for single-record upsert"
```

---

## Task 3: Create webhook route and register it

**Files:**
- Create: `routes/webhook.js`
- Modify: `server.js`

- [ ] **Step 1: Create `routes/webhook.js`**

```js
const express = require('express');
const router = express.Router();
const Program = require('../models/Program');
const { syncSingleServer } = require('../services/databaseService');

router.post('/:slug', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let program = null;
  try {
    program = await Program.findOne({ slug: req.params.slug });
  } catch (_) {}

  if (
    !program ||
    !program.webhookEnabled ||
    !program.webhookToken ||
    program.webhookToken !== token
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, email, url, github, documentation, submissionTime, comments } = req.body;

  if (!email || !url) {
    return res.status(400).json({ error: 'email and url are required' });
  }

  try {
    await syncSingleServer(
      { name, email, url, github, documentation, submissionTime, comments },
      program._id
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Register the route in `server.js`**

In `server.js`, after the line `const adminProgramsRouter = require('./routes/adminPrograms');`, add:

```js
const webhookRouter = require('./routes/webhook');
```

Then after the line `app.use('/api/admin/programs', adminProgramsRouter);`, add:

```js
app.use('/api/webhook/forms', webhookRouter);
```

- [ ] **Step 3: Start the app and verify the endpoint exists (returns 401, not 404)**

```bash
node server.js &
sleep 2
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/webhook/forms/test-slug
```

Expected output: `401`

Kill the test server after:

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add routes/webhook.js server.js
git commit -m "feat: add POST /api/webhook/forms/:slug endpoint"
```

---

## Task 4: Add webhook management API endpoints

**Files:**
- Modify: `routes/adminPrograms.js`

- [ ] **Step 1: Add GET `/:id/webhook` endpoint**

In `routes/adminPrograms.js`, before `module.exports = router;`, add:

```js
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
```

- [ ] **Step 2: Add PATCH `/:id/webhook-token` endpoint**

After the GET above, add:

```js
// PATCH /api/admin/programs/:id/webhook-token
router.patch('/:id/webhook-token', requireAuth, async (req, res) => {
  try {
    const token = require('crypto').randomUUID();
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
```

- [ ] **Step 3: Add PATCH `/:id/webhook-enabled` endpoint**

After the token endpoint, add:

```js
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
```

- [ ] **Step 4: Test the endpoints (app must be running with a real program in DB)**

```bash
# Start app
node server.js &
sleep 2

# Login first
COOKIE=$(curl -s -c /tmp/cookie.txt -b /tmp/cookie.txt -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}' | grep -o '"success":true')
echo "Login: $COOKIE"

# Get a program ID (replace PROGRAM_ID with an actual ID from your DB)
curl -s -b /tmp/cookie.txt http://localhost:3000/api/admin/programs | head -c 200

kill %1
```

Expected: login returns `"success":true`, programs endpoint returns a JSON array.

- [ ] **Step 5: Commit**

```bash
git add routes/adminPrograms.js
git commit -m "feat: add webhook management endpoints to admin programs API"
```

---

## Task 5: Add Webhook subtab to admin panel

**Files:**
- Modify: `public/admin.html`

- [ ] **Step 1: Add 'Webhook' to the subtabs array**

In `public/admin.html`, find this line (around line 353):

```js
[['servers','Servers'],['tile-fields','Tile Fields'],['csv-mapping','CSV Mapping'],['access-logs','Access Logs']].forEach(([key, label], i) => {
```

Replace it with:

```js
[['servers','Servers'],['tile-fields','Tile Fields'],['csv-mapping','CSV Mapping'],['webhook','Webhook'],['access-logs','Access Logs']].forEach(([key, label], i) => {
```

- [ ] **Step 2: Add the `switchSubtab` handler for the new tab**

Find (around line 373):

```js
      else if (tab === 'csv-mapping') loadCsvMappingTab(id);
      else if (tab === 'access-logs') loadAccessLogsTab();
```

Replace with:

```js
      else if (tab === 'csv-mapping') loadCsvMappingTab(id);
      else if (tab === 'webhook')     loadWebhookTab(id);
      else if (tab === 'access-logs') loadAccessLogsTab();
```

- [ ] **Step 3: Add the `loadWebhookTab` function**

Find the line `async function loadCsvMappingTab(programId) {` and insert the following function **before** it:

```js
    async function loadWebhookTab(programId) {
      const content = document.getElementById('subtab-content');
      content.textContent = 'Loading...';
      const res = await fetch('/api/admin/programs/' + programId + '/webhook', { credentials: 'same-origin' });
      const data = await res.json();
      content.textContent = '';

      const card = document.createElement('div');
      card.className = 'card';

      const h3 = document.createElement('h3');
      h3.textContent = 'Power Automate Webhook';
      card.appendChild(h3);

      const note = document.createElement('p');
      note.style.cssText = 'color:#888;font-size:13px;margin-bottom:20px;';
      note.textContent = 'Each new Microsoft Forms submission is automatically ingested when Power Automate posts to this endpoint.';
      card.appendChild(note);

      // Enable toggle
      const toggleRow = document.createElement('div');
      toggleRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:20px;';
      const toggleLabel = document.createElement('span');
      toggleLabel.style.fontWeight = 'bold';
      toggleLabel.textContent = 'Webhook enabled';
      const toggleSwitch = document.createElement('label');
      toggleSwitch.className = 'toggle-switch';
      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.checked = data.webhookEnabled;
      toggleInput.onchange = async () => {
        await fetch('/api/admin/programs/' + programId + '/webhook-enabled', {
          method: 'PATCH', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: toggleInput.checked })
        });
      };
      const toggleTrack = document.createElement('span');
      toggleTrack.className = 'toggle-track';
      toggleSwitch.appendChild(toggleInput);
      toggleSwitch.appendChild(toggleTrack);
      toggleRow.appendChild(toggleLabel);
      toggleRow.appendChild(toggleSwitch);
      card.appendChild(toggleRow);

      // Webhook URL
      const urlGroup = document.createElement('div');
      urlGroup.className = 'form-group';
      const urlLabel = document.createElement('label');
      urlLabel.textContent = 'Webhook URL';
      const urlRow = document.createElement('div');
      urlRow.style.cssText = 'display:flex;gap:8px;';
      const urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.readOnly = true;
      urlInput.value = window.location.origin + '/api/webhook/forms/' + data.slug;
      urlInput.style.fontFamily = 'monospace;';
      const urlCopyBtn = document.createElement('button');
      urlCopyBtn.className = 'btn btn-sm';
      urlCopyBtn.style.cssText = 'background:#666;color:white;white-space:nowrap;';
      urlCopyBtn.textContent = 'Copy';
      urlCopyBtn.onclick = () => { navigator.clipboard.writeText(urlInput.value); urlCopyBtn.textContent = 'Copied!'; setTimeout(() => urlCopyBtn.textContent = 'Copy', 2000); };
      urlRow.appendChild(urlInput);
      urlRow.appendChild(urlCopyBtn);
      urlGroup.appendChild(urlLabel);
      urlGroup.appendChild(urlRow);
      card.appendChild(urlGroup);

      // Bearer token
      const tokenGroup = document.createElement('div');
      tokenGroup.className = 'form-group';
      const tokenLabel = document.createElement('label');
      tokenLabel.textContent = 'Bearer Token';
      const tokenRow = document.createElement('div');
      tokenRow.style.cssText = 'display:flex;gap:8px;';
      const tokenInput = document.createElement('input');
      tokenInput.type = 'password';
      tokenInput.readOnly = true;
      tokenInput.id = 'webhook-token-input';
      tokenInput.value = data.webhookToken || '';
      tokenInput.placeholder = data.webhookToken ? '••••••••••••••••' : 'No token yet — click Regenerate';
      tokenInput.style.fontFamily = 'monospace';
      const revealBtn = document.createElement('button');
      revealBtn.className = 'btn btn-sm';
      revealBtn.style.cssText = 'background:#666;color:white;';
      revealBtn.textContent = 'Reveal';
      revealBtn.onclick = () => {
        tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
        revealBtn.textContent = tokenInput.type === 'password' ? 'Reveal' : 'Hide';
      };
      const tokenCopyBtn = document.createElement('button');
      tokenCopyBtn.className = 'btn btn-sm';
      tokenCopyBtn.style.cssText = 'background:#666;color:white;';
      tokenCopyBtn.textContent = 'Copy';
      tokenCopyBtn.onclick = () => { navigator.clipboard.writeText(tokenInput.value); tokenCopyBtn.textContent = 'Copied!'; setTimeout(() => tokenCopyBtn.textContent = 'Copy', 2000); };
      tokenRow.appendChild(tokenInput);
      tokenRow.appendChild(revealBtn);
      tokenRow.appendChild(tokenCopyBtn);
      tokenGroup.appendChild(tokenLabel);
      tokenGroup.appendChild(tokenRow);
      card.appendChild(tokenGroup);

      // Regenerate button
      const regenBtn = document.createElement('button');
      regenBtn.className = 'btn btn-warning';
      regenBtn.style.marginTop = '4px';
      regenBtn.textContent = 'Regenerate Token';
      regenBtn.onclick = async () => {
        if (!confirm('Regenerate the token? The old token will stop working immediately.')) return;
        const r = await fetch('/api/admin/programs/' + programId + '/webhook-token', {
          method: 'PATCH', credentials: 'same-origin'
        });
        const d = await r.json();
        if (d.webhookToken) {
          tokenInput.value = d.webhookToken;
          tokenInput.type = 'text';
          revealBtn.textContent = 'Hide';
          toggleInput.checked = true;
          regenMsg.textContent = 'New token generated. Copy it now.';
          regenMsg.className = 'msg-success';
        }
      };
      card.appendChild(regenBtn);

      const regenMsg = document.createElement('div');
      regenMsg.id = 'regen-msg';
      card.appendChild(regenMsg);

      // Setup instructions
      const hr = document.createElement('hr');
      hr.style.cssText = 'margin:24px 0;border:none;border-top:1px solid #eee;';
      card.appendChild(hr);

      const instructionsTitle = document.createElement('h3');
      instructionsTitle.style.marginBottom = '12px';
      instructionsTitle.textContent = 'Power Automate Setup';
      card.appendChild(instructionsTitle);

      const steps = [
        'Go to make.powerautomate.com → New flow → Automated cloud flow',
        'Trigger: Microsoft Forms — "When a new response is submitted" → select your form',
        'Add action: Microsoft Forms — "Get response details" → same form, Response ID from trigger',
        'Add action: HTTP → Method: POST, URI: (paste Webhook URL above)',
        'HTTP Headers: Authorization = Bearer (paste Bearer Token above)',
        'HTTP Body (Content-Type: application/json):\n{\n  "name": <Naam>,\n  "email": <Responder email>,\n  "url": <URL Live Productie Frontend>,\n  "github": <Github Username>,\n  "documentation": <Alle andere URLs>,\n  "submissionTime": <Submit date>,\n  "comments": <Opmerkingen>\n}',
        'Save and test with a real form submission'
      ];

      const ol = document.createElement('ol');
      ol.style.cssText = 'padding-left:20px;line-height:1.8;font-size:14px;';
      steps.forEach(step => {
        const li = document.createElement('li');
        li.style.marginBottom = '6px';
        const pre = step.includes('\n');
        if (pre) {
          const parts = step.split('\n');
          li.textContent = parts[0];
          const code = document.createElement('pre');
          code.style.cssText = 'background:#f5f5f5;padding:10px;border-radius:4px;margin-top:6px;font-size:12px;overflow-x:auto;';
          code.textContent = parts.slice(1).join('\n');
          li.appendChild(code);
        } else {
          li.textContent = step;
        }
        ol.appendChild(li);
      });
      card.appendChild(ol);

      content.appendChild(card);
    }

```

- [ ] **Step 4: Start the app and verify the tab appears**

```bash
node server.js
```

Open `http://localhost:3000/admin.html`, log in, select a program, and click the **Webhook** subtab. Verify:
- The tab loads without errors
- The webhook URL shows the correct URL with the program's slug
- The "Regenerate Token" button generates a token, enables the toggle, and shows it in the field
- Copying the URL and token works
- The toggle calls the enabled endpoint (check Network tab in browser DevTools)

- [ ] **Step 5: Test a full webhook call**

With the app running and a token generated for a program with slug `test`:

```bash
TOKEN="paste-token-here"
curl -s -X POST http://localhost:3000/api/webhook/forms/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test Student","email":"test@vives.be","url":"https://example.com","github":"https://github.com/test","submissionTime":"2026-05-28T10:00:00Z","comments":""}'
```

Expected: `{"ok":true}`

Then verify the server appears in the Servers tab for that program.

- [ ] **Step 6: Test rejection cases**

```bash
# Wrong token → 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/webhook/forms/test \
  -H "Authorization: Bearer wrong-token" \
  -H "Content-Type: application/json" -d '{}'

# Unknown slug → 401 (not 404)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/webhook/forms/does-not-exist \
  -H "Authorization: Bearer anything" \
  -H "Content-Type: application/json" -d '{}'

# Missing email → 400
curl -s -X POST http://localhost:3000/api/webhook/forms/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Expected outputs: `401`, `401`, `{"error":"email and url are required"}`

- [ ] **Step 7: Commit**

```bash
git add public/admin.html
git commit -m "feat: add Webhook subtab to admin panel with token management and setup guide"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All five spec sections covered — model fields (Task 1), syncSingleServer (Task 2), webhook endpoint (Task 3), admin API (Task 4), admin panel (Task 5 with URL, token, regenerate, instructions)
- [x] **Placeholders:** None — all code blocks are complete
- [x] **Security:** Returns 401 for unknown slug AND wrong token. Token never logged. `confirm()` before regenerate.
- [x] **Type consistency:** `syncSingleServer` signature matches between Task 2 definition and Task 3/4 usage. `webhookToken`/`webhookEnabled` field names consistent across all tasks.
- [x] **PATCH /:id/webhook-enabled** endpoint added (Task 4 Step 3) and wired up in UI toggle (Task 5 Step 3)
