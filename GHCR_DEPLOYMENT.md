# GitHub Container Registry (GHCR) Deployment

## Problem

Building Docker images on a 1GB RAM server causes freezing and OOM (Out of Memory) errors.

## Solution

Build images on GitHub Actions (free, powerful runners) and pull pre-built images on production server.

---

## Setup (One-Time)

### 1. Enable GitHub Actions

This is already done! The workflow file is at `.github/workflows/docker-build.yml`

### 2. Make Package Public (Important!)

After first push, the image will be private by default. Make it public:

1. Go to: https://github.com/MilanVives?tab=packages
2. Click on **monitoringurls** package
3. Click **"Package settings"** (right side)
4. Scroll to **"Danger Zone"**
5. Click **"Change visibility"**
6. Select **"Public"**
7. Type the repository name to confirm
8. Click **"I understand, change package visibility"**

This allows pulling without authentication.

---

## How It Works

### Automatic Build on Push:

```bash
git push origin main
  ↓
GitHub Actions triggers
  ↓
Builds Docker image on GitHub servers (16GB RAM)
  ↓
Pushes to ghcr.io/milanvives/monitoringurls:latest
  ↓
Production server can pull pre-built image
```

### Manual Build Trigger:

1. Go to: https://github.com/MilanVives/monitoringURLS/actions
2. Click **"Build and Push Docker Image"**
3. Click **"Run workflow"** → **"Run workflow"**
4. Wait ~2-3 minutes for build to complete

---

## Production Server Deployment

### First Time Setup:

```bash
# On production server
cd ~/monitoringurls
git pull origin main

# Use production compose file (no build step)
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d

# Check status
docker compose -f compose.prod.yaml ps
```

### Updates:

```bash
# Pull latest code
cd ~/monitoringurls
git pull origin main

# Pull latest image (already built on GitHub)
docker compose -f compose.prod.yaml pull monitor

# Restart with new image
docker compose -f compose.prod.yaml up -d

# Check logs
docker compose -f compose.prod.yaml logs -f monitor
```

---

## File Structure

**Development (Local):**
- Use: `compose.yaml`
- Builds image locally: `build: .`
- For development and testing

**Production (Server):**
- Use: `compose.prod.yaml`
- Pulls pre-built image: `image: ghcr.io/milanvives/monitoringurls:latest`
- No building needed

---

## Benefits

✅ **No RAM issues** - Building happens on GitHub (16GB RAM)
✅ **Fast deployment** - Just pull and restart (~10 seconds)
✅ **Consistent builds** - Same image everywhere
✅ **Version control** - Images tagged with git SHA
✅ **Free** - GitHub Actions free for public repos

---

## Troubleshooting

### Problem: Cannot pull image (401 Unauthorized)

**Solution:** Make package public (see step 2 above)

Or authenticate:
```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

### Problem: Old image cached

**Solution:** Force pull
```bash
docker compose -f compose.prod.yaml pull --no-cache monitor
docker compose -f compose.prod.yaml up -d --force-recreate monitor
```

### Problem: Build failed on GitHub

**Check logs:**
1. Go to: https://github.com/MilanVives/monitoringURLS/actions
2. Click on failed workflow
3. View logs to see error
4. Fix code and push again

### Problem: Image not updating

**Check image tag:**
```bash
# On production server
docker images | grep monitoringurls

# Should show recent timestamp
# If old, pull again:
docker compose -f compose.prod.yaml pull monitor
```

---

## Commands Reference

### On Production Server:

```bash
# Pull latest image
docker compose -f compose.prod.yaml pull

# Start services
docker compose -f compose.prod.yaml up -d

# Stop services
docker compose -f compose.prod.yaml down

# View logs
docker compose -f compose.prod.yaml logs -f monitor

# Restart monitor only
docker compose -f compose.prod.yaml restart monitor

# Update everything
git pull && \
docker compose -f compose.prod.yaml pull && \
docker compose -f compose.prod.yaml up -d
```

### On Development Machine:

```bash
# Build and test locally
docker compose up -d

# Push changes (triggers auto-build)
git push origin main

# Check build status
# Visit: https://github.com/MilanVives/monitoringURLS/actions
```

---

## Image Tags

GitHub Actions creates multiple tags:

- `latest` - Latest main branch build (use this)
- `main` - Same as latest
- `main-abc1234` - Specific commit SHA

**Production uses:** `ghcr.io/milanvives/monitoringurls:latest`

---

## Monitoring Builds

### GitHub Actions Dashboard:
https://github.com/MilanVives/monitoringURLS/actions

Shows:
- ✅ Build success/failure
- ⏱️ Build duration (~2-3 minutes)
- 📦 Image size
- 🔗 Links to logs

### Check Latest Image:
https://github.com/MilanVives/monitoringURLS/pkgs/container/monitoringurls

Shows:
- 📅 Last updated
- 📦 Image size
- 🏷️ Available tags
- 📥 Pull commands

---

## Summary

**Old Way (Problem):**
```
Production Server (1GB RAM)
  ↓
docker compose build  ← FREEZES HERE
  ↓
❌ OOM Error
```

**New Way (Solution):**
```
Developer Machine / GitHub Actions
  ↓
docker build ✅ (Success - 16GB RAM)
  ↓
Push to ghcr.io
  ↓
Production Server
  ↓
docker pull ✅ (Fast - just download)
  ↓
docker compose up ✅ (Success - no building)
```

**Your 1GB server now just pulls and runs - no building needed!** 🚀

---

**Last Updated:** 2026-01-02
