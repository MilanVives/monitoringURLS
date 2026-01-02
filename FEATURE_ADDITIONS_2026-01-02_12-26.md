# Feature Additions - Comments Field & Manual Entry

## Changes Implemented:

### 1. Comments Field ✅

**Added comments field throughout the application:**

#### Database Schema (models/Server.js)
- Added `comments` field to Server schema
- Field is optional and stores text content from CSV

#### CSV Import (services/csvService.js)
- Added `commentsColumn` to CSV mapping configuration (default: column 20)
- Comments are now extracted and stored during CSV import

#### Server Detail Page (public/server.html)
- Added "Comments" section displaying full comment text
- Shows below other server information
- Hidden if no comments exist
- Supports multi-line text display

#### Admin Mapping Editor (public/admin.html)
- Added "Comments Column" input field
- Allows configuration of which CSV column contains comments
- Default value: 20

**How to Use:**
1. Comments are automatically imported from CSV if present in column 20
2. To change column: Admin Panel → Edit Column Mapping → Comments Column
3. View comments: Click server tile → See "Comments" section

---

### 2. Manual Server Entry ✅

**New feature: Add servers manually without CSV import**

#### Admin Panel UI
- New "Add Server Manually" button in Database Actions section
- Modal form with all server fields:
  - Server Name (required)
  - URL (required)
  - Email
  - GitHub URL
  - Documentation URL
  - Comments (multi-line text area)
- Automatic timestamp generation for submission time

#### Backend API
- New endpoint: `POST /api/admin/servers/manual`
- Creates new server in MongoDB
- Initializes uptime monitoring automatically
- Returns created server object

**How to Use:**

1. **Access Admin Panel:** `http://localhost:3000/admin.html`
2. **Click "Add Server Manually"** (green button in Database Actions)
3. **Fill in the form:**
   - Server Name: e.g., "Test Server"
   - URL: e.g., "https://example.com"
   - Email: (optional) e.g., "admin@example.com"
   - GitHub: (optional) e.g., "https://github.com/user/repo"
   - Documentation: (optional) e.g., "https://docs.example.com"
   - Comments: (optional) Any notes about the server
4. **Click "Add Server"**
5. Server appears immediately in the server list
6. Monitoring starts automatically

**Benefits:**
- No need for CSV file to add single servers
- Quick testing of new deployments
- Manual backup entries
- Override/supplement CSV data

---

## Files Modified:

1. **models/Server.js** - Added comments field to schema
2. **models/CSVMapping.js** - Added commentsColumn to mapping
3. **services/csvService.js** - Extract and store comments from CSV
4. **services/databaseService.js** - Handle comments in sync
5. **public/server.html** - Display comments on detail page
6. **public/admin.html** - Added comments to mapping editor + manual entry form
7. **server.js** - Added manual entry API endpoint

---

## API Endpoint:

### POST /api/admin/servers/manual
**Authentication:** Required (admin session)

**Request Body:**
```json
{
  "name": "Server Name",
  "url": "https://example.com",
  "email": "user@example.com",
  "github": "https://github.com/user/repo",
  "documentation": "https://docs.example.com",
  "comments": "Additional notes about this server"
}
```

**Response:**
```json
{
  "success": true,
  "server": {
    "_id": "...",
    "name": "Server Name",
    "url": "https://example.com",
    ...
  }
}
```

---

## Testing:

### Test Comments Field:
```bash
# 1. Import CSV with comments
# Comments should appear on server detail pages

# 2. View server detail page
curl http://localhost:3000/server.html?id=<server_id>
# Should show comments section if present

# 3. Check mapping includes comments column
curl -b cookies.txt http://localhost:3000/api/admin/csv-mapping
# Should show commentsColumn: 20
```

### Test Manual Entry:
```bash
# 1. Login to admin panel
curl -c cookies.txt -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}'

# 2. Add server manually
curl -b cookies.txt -X POST http://localhost:3000/api/admin/servers/manual \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Server",
    "url": "https://example.com",
    "email": "test@example.com",
    "comments": "This is a test server"
  }'

# 3. Verify server was added
curl http://localhost:3000/api/urls
# Should include the new server
```

---

## Use Cases:

### Comments Field:
1. **Student Submissions:** Store assignment notes, special instructions
2. **Deployment Notes:** Document deployment specifics, configurations
3. **Issue Tracking:** Note known issues or workarounds
4. **Documentation References:** Additional context not in URLs

### Manual Entry:
1. **Quick Testing:** Add test servers without CSV
2. **Emergency Monitoring:** Quickly add critical servers
3. **Development:** Test monitoring without CSV import
4. **One-off Servers:** Monitor servers that aren't in regular CSV exports

---

## Default Column Mapping:

Updated default mapping with comments field:

| Field | Default Column | Description |
|-------|----------------|-------------|
| Name | 4 | Student/Server name |
| URL | 8 | Live deployment URL |
| Email | 3 | Contact email |
| GitHub | 7 | Repository URL |
| Documentation | 9 | Documentation/other URLs |
| Submission Time | 2 | Timestamp |
| **Comments** | **20** | **Additional notes/remarks** |

---

## Future Enhancements:

Potential improvements:
- Edit existing server details from admin panel
- Bulk manual entry (multiple servers at once)
- Import/export server list (JSON format)
- Comments with markdown support
- Comment history/versioning

---

## Notes:

⚠️ **Important:**
- Manual entries are treated the same as CSV imports
- They will appear in the main dashboard immediately
- Manual entries persist in MongoDB like CSV imports
- No automatic sync with CSV - manual entries are independent

✅ **Best Practices:**
- Use descriptive server names for manual entries
- Always include URL (required for monitoring)
- Add comments for context/notes
- Test URL before adding to ensure it's reachable

