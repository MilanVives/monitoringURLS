# CSV Import Logic - Duplicate Prevention & Update Handling

## Overview

The CSV import system now intelligently handles duplicate entries and updates, ensuring:
- ✅ Only the latest submission per email address is imported
- ✅ No duplicate servers in the database
- ✅ Updates to existing submissions are properly handled
- ✅ URL changes are tracked and history is reset appropriately

## How It Works

### 1. CSV Processing (csvService.js)

When a CSV is uploaded:

1. **All rows are read** from the CSV file
2. **Submissions are counted** per email address
3. **Latest submission is identified** by comparing submission timestamps
4. **Older submissions are marked** with `grayedOut: true`
5. **Only latest submissions** are passed to the database sync

**Example:**
```
Email: john@example.com has 3 submissions:
- 2026-01-01 10:00 (URL: https://v1.example.com) → grayedOut: true
- 2026-01-02 14:00 (URL: https://v2.example.com) → grayedOut: true  
- 2026-01-03 16:00 (URL: https://v3.example.com) → grayedOut: false ✓
```

Only the submission from 2026-01-03 is imported to the database.

### 2. Database Synchronization (databaseService.js)

For each latest submission:

#### Step 1: Find Existing Server by Email
```
If email exists in database:
  → Update that server with new data
  → If URL changed, reset status history
  → Keep same database _id
```

#### Step 2: Fallback to URL Match
```
If no server found by email but URL exists:
  → Update that server
  → Add email if it was missing
```

#### Step 3: Create New Server
```
If neither email nor URL exists:
  → Create new server entry
```

#### Step 4: Cleanup Old Servers
```
After import:
  → Find servers with emails NOT in current CSV
  → Remove those servers (they were removed or replaced)
```

## Behavior Examples

### Scenario 1: First Import
**CSV Data:**
```
john@example.com, https://app1.com
jane@example.com, https://app2.com
```

**Database After Import:**
```
✓ Server 1: john@example.com → https://app1.com
✓ Server 2: jane@example.com → https://app2.com
```

---

### Scenario 2: Update with Same URL
**CSV Data (2nd import):**
```
john@example.com, https://app1.com (updated documentation)
jane@example.com, https://app2.com
```

**Database After Import:**
```
✓ Server 1: john@example.com → https://app1.com (documentation updated)
✓ Server 2: jane@example.com → https://app2.com
```

**Result:** Server 1 is updated, history preserved

---

### Scenario 3: URL Change for Same Email
**CSV Data (3rd import):**
```
john@example.com, https://app1-v2.com (new URL!)
jane@example.com, https://app2.com
```

**Database After Import:**
```
✓ Server 1: john@example.com → https://app1-v2.com (history RESET)
✓ Server 2: jane@example.com → https://app2.com
```

**Result:** 
- Server 1 URL updated to new URL
- Status history reset (monitoring new URL)
- No duplicate entries created

---

### Scenario 4: Multiple Submissions in Same CSV
**CSV Data:**
```
john@example.com, https://app1.com,    2026-01-01 10:00
john@example.com, https://app1-v2.com, 2026-01-02 14:00
john@example.com, https://app1-v3.com, 2026-01-03 16:00 (LATEST)
jane@example.com, https://app2.com,    2026-01-01 10:00
```

**Database After Import:**
```
✓ Server 1: john@example.com → https://app1-v3.com (only latest)
✓ Server 2: jane@example.com → https://app2.com
```

**Result:** Only the latest submission per email is imported

---

### Scenario 5: Student Removed from CSV
**CSV Data (before):**
```
john@example.com, https://app1.com
jane@example.com, https://app2.com
bob@example.com,  https://app3.com
```

**CSV Data (after - Bob removed):**
```
john@example.com, https://app1.com
jane@example.com, https://app2.com
```

**Database After Import:**
```
✓ Server 1: john@example.com → https://app1.com
✓ Server 2: jane@example.com → https://app2.com
✗ Server 3: bob@example.com → https://app3.com (DELETED)
```

**Result:** Bob's server is automatically removed from database

---

## Key Features

### ✅ No Duplicates
- **Email-based deduplication:** Each email can only have one active server
- **Latest wins:** If multiple submissions, only the newest is kept
- **Clean database:** Old entries are automatically removed

### ✅ Smart Updates
- **Data refresh:** New information overwrites old
- **History preservation:** Status history kept if URL unchanged
- **History reset:** Status history cleared if URL changes (monitoring new endpoint)

### ✅ Automatic Cleanup
- **Removed students:** Servers deleted if email no longer in CSV
- **No orphans:** Database stays in sync with CSV

### ✅ Handles Edge Cases
- **No email:** Servers without email use URL as identifier
- **Changed email:** If email changes but URL same, treated as new server
- **Multiple changes:** Can handle name, URL, docs all changing

## Database Operations

### Find by Email (Primary)
```javascript
Server.findOne({ email: 'john@example.com' })
```
- Most reliable identifier
- Used for matching existing submissions

### Find by URL (Fallback)
```javascript
Server.findOne({ url: 'https://app1.com' })
```
- Used when no email provided
- Used to link URL-only servers to email

### Cleanup Query
```javascript
Server.find({ 
  email: { $exists: true, $ne: null, $nin: [latestEmails] }
})
```
- Finds servers with emails not in current CSV
- Removes outdated entries

## Console Logging

The system logs important operations:

```javascript
// URL changed for existing server
console.log(`URL changed for john@example.com: https://old.com -> https://new.com`)

// Old server removed
console.log(`Removing old server for bob@example.com: https://app3.com`)
```

Check Docker logs to see these operations:
```bash
docker compose logs monitor | grep "URL changed\|Removing"
```

## Recommendations

### For Best Results:

1. **Always include email addresses** in CSV
   - Email is the primary identifier
   - Enables proper tracking across URL changes

2. **Use consistent email format**
   - john@example.com (not JOHN@EXAMPLE.COM)
   - Casing matters in matching

3. **Include submission timestamp**
   - Enables proper "latest" determination
   - Format: DD-MM-YYYY HH:mm

4. **Re-import full CSV when updating**
   - Don't try to import partial updates
   - Full import ensures cleanup works properly

### What Happens Without Email:

If a server has no email:
- Matched only by URL
- Won't be cleaned up automatically
- Can result in orphaned entries
- Must be manually deleted if needed

## Testing the Logic

### Test Case 1: Duplicate Detection
```bash
# Create CSV with duplicate emails (different timestamps)
cat > test.csv << EOL
Id;Time;Email;Name;URL
1;2026-01-01 10:00;test@example.com;Test V1;https://test1.com
2;2026-01-02 14:00;test@example.com;Test V2;https://test2.com
EOL

# Upload CSV
# Result: Only Test V2 with https://test2.com should be imported
```

### Test Case 2: URL Change
```bash
# First import
# Email: test@example.com, URL: https://test1.com

# Second import with changed URL
# Email: test@example.com, URL: https://test2.com

# Result: 
# - Same server updated (same _id)
# - URL changed to test2.com
# - Status history reset
```

### Test Case 3: Cleanup
```bash
# First import: 3 servers
# Second import: 2 servers (one removed)

# Result:
# - 2 servers remain
# - Removed server deleted from database
```

## Troubleshooting

### Problem: Duplicates Still Appearing

**Possible Causes:**
1. Servers with no email (can't match properly)
2. Email case mismatch (john@example.com vs JOHN@example.com)
3. Manual entries mixed with CSV imports

**Solution:**
1. Ensure all CSV entries have email addresses
2. Use consistent email casing
3. Avoid mixing manual entries with same emails as CSV

### Problem: Server Not Updating

**Possible Causes:**
1. Email in database doesn't match CSV email
2. CSV not using latest data
3. Grayed-out entries being imported somehow

**Solution:**
1. Check exact email match (spaces, casing)
2. Verify CSV has correct latest data
3. Check submission timestamps are valid

### Problem: Unexpected Deletions

**Possible Causes:**
1. Partial CSV imported (missing students)
2. Email changed for student (treated as new person)

**Solution:**
1. Always import complete CSV files
2. Keep emails consistent across submissions

## API Impact

### GET /api/urls
Returns only non-hidden servers (already filtered)
- No duplicates in response
- Only latest submissions

### POST /api/admin/upload-csv
- Processes full CSV
- Deduplicates automatically
- Returns count of imported servers

### GET /api/admin/servers
Shows all servers including hidden
- Can see cleanup results here
- Verify no duplicate emails

## Future Enhancements

Potential improvements:
- Email history tracking (show previous emails for same server)
- Archive deleted servers instead of hard delete
- Merge tool for conflicting entries
- Email change notifications
- Import diff preview before applying

---

**Last Updated:** 2026-01-02
**Version:** 1.1 - Smart Deduplication
