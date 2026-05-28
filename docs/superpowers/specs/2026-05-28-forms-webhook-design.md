# Design: Automatic Form Submission Ingestion via Power Automate Webhook

**Date:** 2026-05-28  
**Status:** Approved

## Problem

Form submissions from Microsoft Forms currently require a manual CSV download and file replacement. Each program has its own form. The goal is for new submissions to be picked up automatically without any human intervention.

## Approach

Power Automate (running under the teacher's VIVES account) triggers on each new Forms submission, maps the response fields to a fixed JSON structure, and POSTs it to a webhook endpoint on this app. No Azure AD admin consent required.

CSV import is kept as-is for bulk loading existing submissions. The webhook handles all new submissions going forward.

## Architecture

```
Microsoft Forms submission
        │
        ▼
Power Automate flow (per program)
  1. Trigger: "When a new response is submitted"
  2. Action:  "Get response details"
  3. Action:  HTTP POST → /api/webhook/forms/:slug
        │       Authorization: Bearer <webhookToken>
        │       Body: fixed JSON structure (see below)
        ▼
Webhook handler (new route)
  - Verify Bearer token against program.webhookToken
  - Upsert server via existing databaseService logic
  - Return 200 OK
```

## Data Contract

Power Automate POSTs a fixed JSON body (fields mapped manually in the flow):

```json
{
  "name":          "student full name",
  "email":         "student@vives.be",
  "url":           "https://production-url.example.com",
  "github":        "https://github.com/VIVES-Zuid/...",
  "documentation": "https://other-url.example.com (description)\n...",
  "submissionTime": "2026-01-01T21:47:00Z",
  "comments":      "optional remarks"
}
```

All fields except `email` and `url` are optional. If the same email submits again, the existing server record is updated (resubmission handling already exists in `databaseService.syncServersFromCSV`).

## Changes Required

### Model: `Program`

Add two fields to `programSchema`:

```js
webhookToken: { type: String, default: null },  // Bearer token for auth
webhookEnabled: { type: Boolean, default: false }
```

### Route: `POST /api/webhook/forms/:slug`

New public (unauthenticated session) route, auth via Bearer token:

1. Find program by `slug`
2. Check `program.webhookToken` matches `Authorization: Bearer <token>` header
3. Extract fields from JSON body
4. Call a new `syncSingleServer(data, programId)` function in `databaseService`
5. Return `200 { ok: true }` or appropriate error

### Service: `databaseService.syncSingleServer(data, programId)`

Extracted from existing `syncServersFromCSV` upsert block — handles one record:
- Lookup by email → update if found, create if not
- Hash-based change detection (`editCount`, `lastCsvData`)
- URL change → reset status history

### Admin Panel

Per-program section gains a "Webhook" subsection showing:
- Webhook URL (read-only, copy button): `https://<host>/api/webhook/forms/<slug>`
- Bearer token (masked, reveal + copy button)
- "Regenerate token" button → calls `PATCH /api/admin/programs/:id/webhook-token`
- Short setup instructions for the Power Automate flow

### Admin API

- `PATCH /api/admin/programs/:id/webhook-token` — generates a new `crypto.randomUUID()` token, saves to DB, returns it

## Security

- Bearer token is a `crypto.randomUUID()` (122 bits of entropy), stored in DB per program
- Tokens are never logged
- Endpoint returns `401` for missing/wrong token or unknown slug (no slug enumeration via 404)
- Rate limiting is handled by the existing Cloudflare tunnel in production

## What Is Not Changing

- CSV import flow (unchanged — still used for bulk initial load)
- `processCSV` / `csvService.js` (untouched)
- Existing uptime checking loop
- All other Program fields and admin functionality

## Power Automate Setup (per program)

1. Go to [make.powerautomate.com](https://make.powerautomate.com)
2. New flow → Automated cloud flow
3. Trigger: **Microsoft Forms — When a new response is submitted** → select the form
4. Add action: **Microsoft Forms — Get response details** → same form, Response ID from trigger
5. Add action: **HTTP** → Method: POST, URI: `<webhook URL>`, Headers: `Authorization: Bearer <token>`, Body: JSON with dynamic values mapped from step 4
6. Save and test with a real submission
