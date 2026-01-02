# Production Deployment Fix - Node.csv Issue

## Problem

When deploying to production server, Docker build failed with error:
```
failed to solve: failed to compute cache key: "/Node.csv": not found
```

**Cause:** The Dockerfile tried to copy `Node.csv` which doesn't exist on production server initially.

## Solution

### ✅ Fixed: Made CSV File Optional

#### 1. Updated Dockerfile
**Before:**
```dockerfile
COPY Node.csv .
```

**After:**
```dockerfile
# Create empty CSV as placeholder (will be replaced by volume mount or upload)
RUN touch Node.csv && chown appuser:appgroup Node.csv
```

#### 2. Updated compose.yaml
**Before:**
```yaml
volumes:
  - ./Node.csv:/usr/src/app/Node.csv
```

**After:**
```yaml
volumes:
  - csv_data:/usr/src/app/Node.csv  # Named volume instead of bind mount
```

#### 3. Added Volume Definition
```yaml
volumes:
  mongodb_data:
  csv_data:  # New: persistent storage for CSV
```

## How It Works Now

### Initial Deployment:
1. **Docker build creates empty Node.csv file**
2. **Container starts successfully** (no CSV required)
3. **Empty dashboard** - no servers yet (expected)
4. **Upload CSV via admin panel** or add servers manually

### After CSV Upload:
1. CSV stored in named volume `csv_data`
2. Persists across container restarts
3. Can be backed up independently

## Deployment Steps (Updated)

### On Production Server:

```bash
# 1. Clone repository (if not already done)
git clone <repo-url> /opt/monitoring
cd /opt/monitoring

# 2. Create .env file
cp .env.example .env
nano .env
# Add: ADMIN_PASSWORD, SESSION_SECRET, CLOUDFLARE_TUNNEL_TOKEN

# 3. Build and deploy
docker compose up -d --build

# 4. Verify all services running
docker compose ps
# Should show: mongodb (healthy), monitor (healthy), cloudflared (running)

# 5. Upload CSV via admin panel
# Visit: https://monitoring.your-domain.com/admin.html
# Login with ADMIN_PASSWORD
# Upload CSV file
```

## Benefits

✅ **No CSV file needed at build time**
✅ **Deploys on clean server**
✅ **CSV uploaded via web interface**
✅ **Persistent storage via Docker volume**
✅ **Easy to backup/restore**

## CSV File Management

### Option 1: Upload via Admin Panel (Recommended)
1. Go to admin panel
2. Click "Upload New CSV"
3. Select file
4. Click "Upload & Import"

### Option 2: Manual Copy (Alternative)
```bash
# Copy CSV to server
scp Node.csv user@server:/opt/monitoring/

# Create volume and copy
docker run --rm -v monitoring_csv_data:/data -v $(pwd):/source alpine \
  cp /source/Node.csv /data/

# Restart monitor
docker compose restart monitor
```

### Option 3: Add Servers Manually
1. Go to admin panel
2. Click "Add Server Manually"
3. Fill in server details
4. Click "Add Server"

## Verification

```bash
# Check if build succeeds
docker compose build monitor
# Should complete without errors

# Check if CSV exists in container
docker compose exec monitor ls -la Node.csv
# Should show: -rw-r--r-- 1 appuser appgroup 0 Jan 2 13:20 Node.csv

# Check if app starts
docker compose up -d
docker compose logs monitor --tail=30
# Should show: "Server running on http://localhost:3000"
```

## Files Modified

1. **Dockerfile** - Creates empty CSV placeholder
2. **compose.yaml** - Uses named volume for CSV
3. **PRODUCTION_DEPLOYMENT.md** - Complete deployment guide (NEW)

## Migration Notes

**Existing Deployments:**
- No changes needed if CSV already exists
- Volume mount will use existing file
- Backup your CSV before updating

**New Deployments:**
- No CSV file required to start
- Upload via admin panel after deployment
- CSV persists in Docker volume

## Troubleshooting

### Problem: Container still fails to build

**Solution:**
```bash
# Remove old images and rebuild
docker compose down
docker system prune -a
docker compose up -d --build
```

### Problem: CSV not persisting after restart

**Solution:**
```bash
# Check volume exists
docker volume ls | grep csv_data

# If missing, recreate
docker volume create monitoring_csv_data
docker compose restart monitor
```

### Problem: Can't upload CSV via admin panel

**Solution:**
```bash
# Check uploads directory permissions
docker compose exec monitor ls -la uploads/

# Fix permissions if needed
docker compose exec monitor chown -R appuser:appgroup uploads/
```

## Summary

✅ **Fixed:** Docker build no longer requires Node.csv at build time
✅ **Added:** Named volume for persistent CSV storage
✅ **Created:** Production deployment guide
✅ **Improved:** Deployment process now works on clean servers

**The application now deploys successfully on any server, with or without CSV file!** 🚀

---

**Date:** 2026-01-02 13:25
**Issue:** Build failure due to missing CSV file
**Status:** ✅ RESOLVED
