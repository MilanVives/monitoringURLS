# CSV Column Mapping - Quick Guide

## Overview
The CSV Column Mapping feature allows you to configure which columns from your CSV file correspond to the required data fields in the monitoring dashboard.

## Visual Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin Panel                               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  CSV Column Mapping                                  │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │                                                      │   │
│  │  [Edit Column Mapping]  [Preview CSV]               │   │
│  │                                                      │   │
│  │  Current Mapping: Default Mapping                   │   │
│  │  Name: Col 4 | URL: Col 8 | Email: Col 3 ...       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
          Click "Edit Column Mapping"
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│            CSV Column Mapping Configuration                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  CSV Preview (First 5 rows):                                │
│  ┌────────┬────────┬────────┬────────┬────────┬──────────┐  │
│  │ Col 0  │ Col 1  │ Col 2  │ Col 3  │ Col 4  │ Col 5... │  │
│  │ Id     │ Begin  │ Time   │ Email  │ Name   │ Name1... │  │
│  ├────────┼────────┼────────┼────────┼────────┼──────────┤  │
│  │ 1      │ 1-1... │ 1-1... │ r098..│ Quint..│ Quint... │  │
│  │ 2      │ 2-1... │ 2-1... │ r123..│ John.. │ John...  │  │
│  └────────┴────────┴────────┴────────┴────────┴──────────┘  │
│                                                              │
│  Mapping Name: [Default Mapping          ]                  │
│  Separator:    [;]                                           │
│                                                              │
│  Student Name Column:      [4]                               │
│  URL Column:               [8]                               │
│  Email Column:             [3]                               │
│  GitHub Column:            [7]                               │
│  Documentation Column:     [9]                               │
│  Submission Time Column:   [2]                               │
│                                                              │
│                      [Save Mapping] [Cancel]                 │
└─────────────────────────────────────────────────────────────┘
```

## Step-by-Step Instructions

### 1. Access the Admin Panel
- Navigate to `http://localhost:3000/admin.html`
- Login with admin password

### 2. View Current Mapping
- Look for "CSV Column Mapping" section
- See current active mapping configuration

### 3. Preview Your CSV (Optional but Recommended)
- Click **"Preview CSV"** button
- View first 5 rows of your CSV file
- Note the column numbers (start at 0)

### 4. Edit Mapping
- Click **"Edit Column Mapping"** button
- Modal opens with:
  - CSV preview table (with column numbers)
  - Mapping configuration fields

### 5. Configure Columns
Enter the correct column number for each field:

| Field | Description | Example Value |
|-------|-------------|---------------|
| Student Name | Full name of student | 4 |
| URL | Live deployment URL | 8 |
| Email | Student email address | 3 |
| GitHub | GitHub repository URL | 7 |
| Documentation | Documentation/other URLs | 9 |
| Submission Time | When submitted (DD-MM-YYYY HH:mm) | 2 |

### 6. Save Configuration
- Click **"Save Mapping"**
- Confirmation message appears
- New mapping is now active

### 7. Re-import CSV
- Upload CSV file again (or click Reload CSV)
- New mapping will be applied automatically

## Example: Adapting to Different CSV Format

**Original CSV (Semicolon-separated):**
```
Id;Start;Complete;Email;Name;Name1;User;GitHub;URL;Docs;...
1;1-1-26;1-1-26;john@ex.com;John;John;john123;https://gh.com;https://app.com;https://docs.com;...
```
Column indices: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9...

**New CSV (Comma-separated, different order):**
```
Name,Email,URL,GitHub,Docs,SubmissionTime,...
John,john@ex.com,https://app.com,https://gh.com,https://docs.com,1-1-2026 10:00,...
```
Column indices: 0, 1, 2, 3, 4, 5...

**Mapping Update Required:**
- Change separator from `;` to `,`
- Update column numbers:
  - Name: 0 (was 4)
  - Email: 1 (was 3)
  - URL: 2 (was 8)
  - GitHub: 3 (was 7)
  - Documentation: 4 (was 9)
  - Submission Time: 5 (was 2)

## Tips & Best Practices

✅ **DO:**
- Always preview CSV before editing mapping
- Test with small CSV files first
- Use descriptive mapping names
- Document any custom mappings

❌ **DON'T:**
- Forget to re-import CSV after changing mapping
- Use negative column numbers
- Skip the CSV preview step

## Troubleshooting

**Problem:** CSV data not importing correctly
**Solution:** 
1. Click "Preview CSV" to verify column layout
2. Check that column numbers are correct (0-indexed)
3. Verify separator character is correct

**Problem:** Some fields are empty
**Solution:**
1. Ensure column number matches the actual column position
2. Check that CSV has data in those columns
3. Verify no extra spaces in separator field

**Problem:** Mapping changes not taking effect
**Solution:**
1. Confirm "Save Mapping" was clicked
2. Re-upload or reload the CSV file
3. Check that mapping is marked as "active"

## Advanced Usage

### Multiple Mapping Profiles
You can create and save multiple mapping configurations for different CSV sources:

1. Edit mapping and save with descriptive name (e.g., "Format A")
2. Create another mapping with different name (e.g., "Format B")
3. Only one mapping is active at a time (most recently saved)
4. Switch between mappings by editing and re-saving

### Custom Separators
The system supports any separator character:
- `;` - Semicolon (default)
- `,` - Comma
- `\t` - Tab
- `|` - Pipe
- Any other single character

## Support

If you encounter issues with CSV mapping:
1. Check the column numbers start at 0
2. Verify the separator character
3. Ensure CSV file is properly formatted
4. Review the CSV preview for accuracy
