# Multi-Program Tab Dashboard — Design Spec

**Date:** 2026-05-19  
**Status:** Approved  
**Scope:** Phase 1 — sidebar navigation + per-program tile config. Microsoft Forms auto-import is a future phase.

---

## Overview

Replace the single flat dashboard with a sidebar-navigated multi-program view. Each sidebar item corresponds to one academic program (Node TI, Node AO, Cloud Infrastructure, DevOps). Programs are configurable from the admin panel — no code changes required to add or rename them.

---

## 1. Data Model

### New: `Program` collection

```js
{
  name: String,           // "Node TI"
  slug: String,           // "node-ti" — used in URL params and filtering
  order: Number,          // sidebar sort order
  csvMapping: {
    nameColumn: Number,
    urlColumn: Number,
    emailColumn: Number,
    githubColumn: Number,
    documentationColumn: Number,
    submissionTimeColumn: Number,
    commentsColumn: Number,
    separator: String,    // default ";"
    skipLines: Number     // default 1
  },
  tileFields: {
    latency:              { type: Boolean, default: true },
    uptime:               { type: Boolean, default: true },
    submissionCount:      { type: Boolean, default: true },
    github:               { type: Boolean, default: true },
    documentation:        { type: Boolean, default: false },
    timeSinceSubmission:  { type: Boolean, default: false },
    comments:             { type: Boolean, default: false }
  },
  createdAt: Date
}
```

### Updated: `Server` collection

Add one field:

```js
program: { type: ObjectId, ref: 'Program', default: null }
```

All other Server fields remain unchanged. `status` indicator is always shown on tiles and is not a toggle.

### Removed: `CSVMapping` collection

CSV mapping config moves into `Program.csvMapping`. The standalone `CSVMapping` collection and its model are deleted. The existing admin "CSV Mapping" tab is replaced by the per-program "CSV Mapping" sub-tab.

### Migration

No automatic migration. Admin clears the database via the existing "Clear Database" button in admin, then re-uploads each CSV selecting the correct program from a dropdown. Programs must be created before uploading.

---

## 2. Public Dashboard (`index.html`)

### Layout

- **Left sidebar** (fixed width ~180px): VIVES logo/title at top, one nav item per program, "Last check" timestamp at bottom.
- **Main area**: program title, status summary (N online · N offline · N degraded), tile grid.
- No "All Programs" view — sidebar shows only the four (or however many) configured programs.

### Sidebar nav item

Each item shows: program name + live student count badge. Active item highlighted in accent colour. Clicking switches the tile grid without a page reload.

### Tile grid

Each tile shows fields determined by that program's `tileFields` config. Status indicator is always shown. Tiles are otherwise identical in structure to the current design.

### URL state

Active program is reflected in the URL hash: `/#node-ti`. On load, the hash determines which program is selected. If no hash or hash is unrecognised, first program in order is selected.

### WebSocket

Existing broadcast mechanism unchanged. Frontend filters incoming status updates to only refresh tiles belonging to the currently visible program.

---

## 3. Admin Panel (`admin.html`)

### Layout

Same sidebar structure as the public dashboard. Below the program list, a `+ Add Program` link opens an inline form (name input → creates program with auto-generated slug and appended to bottom of sidebar order).

### Per-program sub-tabs

When a program is selected in the sidebar, three sub-tabs appear in the main area:

**Servers tab**
- Table of all servers in this program.
- Actions per row: hide/unhide, edit (name, url, email, github, docs, comments), delete.
- "Add Manual Server" button — same as current, but `programId` is pre-filled.
- "Upload CSV" button — opens upload modal with program pre-selected.

**Tile Fields tab**
- Toggle grid (on/off switches) for each configurable field: Latency, Uptime %, Submission count, GitHub link, Documentation link, Time since submission, Comments.
- "Save Fields" button — PATCH to `/api/admin/programs/:id/fields`.
- Status indicator is listed but locked on (not toggleable).

**CSV Mapping tab**
- Same column-index inputs as the current global CSV mapping UI.
- Scoped to this program only.
- "Save Mapping" button.

### Program management

- **Rename**: inline edit of the program name in the sidebar header area (slug does not change on rename to avoid breaking bookmarked URLs).
- **Reorder**: up/down arrows on each sidebar item to adjust `order`.
- **Delete**: requires confirmation. Removes the `Program` document. Servers that referenced it have `program` set to `null` and disappear from all tab views (they remain in DB but are unreachable via UI until re-assigned or deleted).

---

## 4. API Changes

### New public endpoints

```
GET /api/programs
  → [{ _id, name, slug, order, serverCount }]

GET /api/urls?program=<slug>
  → existing response shape, filtered to that program's servers
  → if no ?program param, returns all visible servers (backward compat)
```

### New admin endpoints

```
POST   /api/admin/programs
       body: { name }
       → creates Program with auto slug, appended order, default tileFields + csvMapping

PUT    /api/admin/programs/:id
       body: { name?, order? }

DELETE /api/admin/programs/:id
       → nullifies program field on all linked servers, then deletes Program

GET    /api/admin/programs/:id/fields
PUT    /api/admin/programs/:id/fields
       body: { latency, uptime, submissionCount, github, documentation,
               timeSinceSubmission, comments }  (all Boolean)

GET    /api/admin/programs/:id/csv-mapping
PUT    /api/admin/programs/:id/csv-mapping
       body: { nameColumn, urlColumn, emailColumn, githubColumn,
               documentationColumn, submissionTimeColumn, commentsColumn,
               separator, skipLines }
```

### Updated endpoints

```
POST /api/admin/upload-csv
     body: existing fields + programId (required)
     → tags all imported servers with the given programId

POST /api/admin/servers/manual
     body: existing fields + programId (required)
```

### Removed endpoints

```
GET    /api/admin/csv-mapping
POST   /api/admin/csv-mapping
PUT    /api/admin/csv-mapping/:id
DELETE /api/admin/csv-mapping/:id
GET    /api/admin/csv-preview         (moved to /api/admin/programs/:id/csv-preview)
GET    /api/admin/csv-mappings
```

---

## 5. Frontend Architecture Notes

- Sidebar is rendered from `/api/programs` on page load, not hardcoded.
- `index.html` fetches `/api/urls?program=<slug>` on tab switch (or initial load).
- `admin.html` fetches `/api/admin/programs` to build sidebar; sub-tab content loaded on demand.
- `tileFields` config is fetched once per program selection and used client-side to show/hide tile elements.
- No build step required — vanilla JS as per current codebase.

---

## 6. Out of Scope (Future Phase)

- Microsoft Office Forms webhook / auto-import
- Per-student detail page changes (server.html) — remains unchanged
- Access log changes
- Authentication changes

---

## 7. Open Questions (resolved during brainstorming)

| Question | Decision |
|---|---|
| Navigation style | Sidebar (option B) |
| Program membership | Tagged at CSV upload time |
| "All Programs" view | Not included |
| Program names | Configurable, stored in DB |
| Existing data | Clear DB and re-import |
| Tile configuration | Per-program field toggles |
| CSV mapping scope | Moves into Program document, per-program |
