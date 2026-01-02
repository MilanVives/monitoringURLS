# CSV Import Update - Smart Deduplication

## What Changed

The CSV import function now intelligently handles duplicate entries and ensures only the latest submission per email address is stored in the database.

## Key Improvements

### ✅ No More Duplicates
- Each email address can only have **one active server** in the database
- If CSV contains multiple submissions from same email, only the **latest** is imported
- Old submissions are automatically **filtered out**

### ✅ Smart Updates
- Re-importing CSV with updated data **updates existing servers** (doesn't create new ones)
- If URL changes for same email, server is updated and **history is reset**
- If other fields change (name, docs, comments), they're **updated without resetting history**

### ✅ Automatic Cleanup
- Servers whose emails are **no longer in the CSV** are automatically **deleted**
- Keeps database in perfect sync with your CSV file
- No orphaned or outdated entries

## How It Works

### 1. CSV Processing
When you upload a CSV:
```
Step 1: Read all rows
Step 2: Find latest submission per email (by timestamp)
Step 3: Mark older submissions as "grayed out"
Step 4: Pass only latest submissions to database
```

### 2. Database Sync
For each latest submission:
```
Step 1: Check if server exists with this email
  → YES: Update that server
  → NO: Check if URL exists
    → YES: Update server and add email
    → NO: Create new server

Step 2: If URL changed, reset status history
Step 3: After all imports, delete servers with emails not in CSV
```

## Examples

### Example 1: Multiple Submissions Same Email

**CSV Contains:**
```
john@example.com, https://v1.com, 2026-01-01 10:00
john@example.com, https://v2.com, 2026-01-02 14:00  ← Latest
john@example.com, https://v3.com, 2026-01-01 16:00
```

**Result:**
- Only `https://v2.com` is imported (latest timestamp)
- No duplicates created
- Old submissions ignored

### Example 2: Updated Information

**First Import:**
```
john@example.com, https://app.com, "Old comments"
```

**Second Import:**
```
john@example.com, https://app.com, "Updated comments"
```

**Result:**
- Same server updated
- Comments changed to "Updated comments"
- Status history preserved (URL didn't change)

### Example 3: Changed URL

**First Import:**
```
john@example.com, https://old-app.com
```

**Second Import:**
```
john@example.com, https://new-app.com
```

**Result:**
- Server for john@example.com updated to new URL
- Status history **reset** (monitoring different URL now)
- No duplicate created

### Example 4: Removed Student

**First Import:**
```
john@example.com, https://app1.com
jane@example.com, https://app2.com
bob@example.com,  https://app3.com
```

**Second Import (Bob removed):**
```
john@example.com, https://app1.com
jane@example.com, https://app2.com
```

**Result:**
- John and Jane's servers remain
- Bob's server **automatically deleted**
- Database stays clean

## What You Need to Know

### ✅ Best Practices:

1. **Always include email addresses** in your CSV
   - Email is used to match and update existing servers
   - Without email, matching is less reliable

2. **Use consistent timestamps**
   - Latest submission determined by timestamp
   - Format: DD-MM-YYYY HH:mm

3. **Re-import full CSV file**
   - Don't import partial updates
   - System expects complete list for cleanup to work

4. **Check logs after import**
   - See which servers were updated/deleted
   - Verify expected behavior

### ⚠️ Important Notes:

1. **Email is the primary identifier**
   - Same email = same student
   - Changed email = treated as new student

2. **URL changes reset monitoring**
   - New URL means monitoring starts fresh
   - Old uptime history doesn't apply to new URL

3. **Cleanup is automatic**
   - Removed entries are deleted
   - Can't be undone (except by re-importing)

4. **Manual entries are independent**
   - Manually added servers aren't affected by CSV cleanup
   - Unless they have same email as CSV entry

## Testing

### Verify Deduplication:
1. Create CSV with duplicate emails
2. Upload via admin panel
3. Check server list - should only see one entry per email

### Verify Updates:
1. Import CSV
2. Modify data for one email
3. Re-import CSV
4. Check server - data should be updated

### Verify Cleanup:
1. Import CSV with 3 entries
2. Remove one entry from CSV
3. Re-import
4. Check database - removed entry should be gone

## Console Output

Check Docker logs to see sync operations:

```bash
docker compose logs monitor | grep -E "URL changed|Removing"
```

Example output:
```
URL changed for john@example.com: https://old.com -> https://new.com
Removing old server for bob@example.com: https://app.com
```

## Migration Notes

**Existing Deployments:**
- No manual migration needed
- Next CSV import will apply new logic
- Existing duplicates will be cleaned up automatically

**First Import After Update:**
- May see servers deleted if they have duplicate emails
- This is expected - keeping only latest per email
- Check logs to verify

## Files Modified

- `services/databaseService.js` - Updated sync logic
- Added comprehensive deduplication and cleanup

## Documentation

See `CSV_IMPORT_LOGIC.md` for detailed technical documentation including:
- Step-by-step algorithm
- All scenarios and edge cases
- Troubleshooting guide
- API impact details

---

**Summary:** CSV imports now intelligently handle duplicates, keeping only the latest submission per email and automatically cleaning up removed entries. No more duplicate servers! 🎉
