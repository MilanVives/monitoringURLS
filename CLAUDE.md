# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Local development (requires MongoDB running)
node server.js

# With Docker (recommended — starts MongoDB + app + optional Cloudflare tunnel)
docker compose up -d --build

# Production deployment (pulls pre-built image from GHCR)
docker compose -f compose.prod.yaml pull && docker compose -f compose.prod.yaml up -d

# View logs
docker compose logs -f

# Reload CSV without restart (triggers re-sync + immediate status check)
curl -X POST http://localhost:3000/api/reload-csv
```

No test suite exists; manual testing via browser and `test-502-check.js` / `test-502.js` scripts.

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Default | Notes |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/monitoring` | Use `mongodb://mongodb:27017/monitoring` inside Docker |
| `ADMIN_PASSWORD` | `admin123` | Admin panel password |
| `CHECK_INTERVAL` | `300000` | Polling interval in ms |
| `CLOUDFLARE_TUNNEL_TOKEN` | — | Optional; omit to skip the cloudflared container |

## Architecture

**Single entry point:** `server.js` — registers all Express routes, starts the HTTP server, attaches the WebSocket server, then calls `initialize()`.

**Service layer** (`services/`):

- `uptimeService.js` — URL status checking with HEAD→GET fallback. Returns `online`, `offline`, or `degraded` (for 5xx responses). Also maintains an in-memory `Map` of per-URL uptime stats that parallels the MongoDB history.
- `databaseService.js` — All MongoDB operations. The `syncServersFromCSV` function performs upsert logic: lookup by email first, then by URL, then create new. Tracks `editCount` and `lastCsvData` hash to detect actual data changes between CSV imports.
- `csvService.js` — Reads `Node.csv` using column mappings from `CSVMapping` model. When multiple rows have the same email, only the most recent is kept (active); the rest are marked `grayedOut`. Column indices are configurable via admin panel.
- `wsService.js` — WebSocket server that broadcasts status change events to connected clients.

**Data flow:**
1. On startup, `initialize()` loads existing servers from MongoDB (or imports from `Node.csv` if DB is empty).
2. `urlData` array in `server.js` is the live working set; it mirrors the DB but is mutated in-place by add/delete/CSV-sync operations.
3. Scheduled `setInterval` (default 5 min) calls `updateAllStatuses()`, which writes each check to `statusHistory` in MongoDB (capped at 1000 entries per server) and broadcasts changes via WebSocket.

**Auth:** Session-based (`express-session`). `requireAuth` middleware checks `req.session.isAuthenticated`. Only one admin password; no per-user accounts.

**Frontend:** Static HTML/CSS in `public/`. Three pages: `index.html` (dashboard tiles), `server.html` (per-server history), `admin.html` (server management + CSV mapping + access logs). All communicate with the API via `fetch`; real-time updates arrive over WebSocket.

**CSV mapping:** The `CSVMapping` model stores column index mappings, separator, and skip-lines. Only one mapping can be `isActive: true` at a time. Admin panel supports creating and switching between mappings without code changes.

**Access logging:** `middleware/accessLogger.js` logs requests to specific paths (`/`, `/admin.html`, `/server.html`, `/api/admin`) into the `AccessLog` model. Captures IP and Cloudflare email headers for visitor tracking.

## Key Model Fields

`Server`:
- `currentStatus`: `online | offline | error | unknown`
- `statusHistory[]`: capped at 1000; each entry has `{status, latency, timestamp}`
- `editCount`: incremented each time CSV data hash changes on re-import
- `hidden`: excludes server from public dashboard without deleting
- `manuallyAdded`: set when server is added via admin panel (not CSV)

## Docker Setup

`compose.yaml` runs three services: `mongodb`, `monitor` (the app), and `cloudflared` (optional tunnel). The `monitor` service mounts `./public`, `./img`, and `./uploads` for hot-reloading frontend changes without rebuilding.

`compose.prod.yaml` pulls the pre-built image from GHCR (built automatically on every push to `main` via GitHub Actions at `.github/`).
