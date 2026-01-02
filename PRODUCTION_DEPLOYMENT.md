# Production Deployment Guide

## Quick Start

### 1. Clone Repository on Production Server

```bash
# SSH into your production server
ssh user@your-server

# Clone the repository
cd /opt
git clone <your-repo-url> monitoring
cd monitoring
```

### 2. Create .env File

```bash
cp .env.example .env
nano .env
```

Edit the values:
```env
MONGODB_URI=mongodb://mongodb:27017/monitoring
ADMIN_PASSWORD=your-secure-password-here
SESSION_SECRET=generate-random-secret-with-openssl-rand-base64-32
CLOUDFLARE_TUNNEL_TOKEN=your-cloudflare-tunnel-token-here
```

**Generate secure secrets:**
```bash
# Generate admin password
openssl rand -base64 16

# Generate session secret
openssl rand -base64 32
```

### 3. Deploy with Docker Compose

```bash
# Build and start all services
docker compose up -d --build

# Check if all services are running
docker compose ps

# Should show:
# - monitoring-mongodb (running, healthy)
# - url-monitor (running, healthy)
# - monitoring-cloudflared (running)
```

### 4. Upload CSV File

**Option A: Via Admin Panel (Recommended)**
1. Visit your dashboard URL (e.g., https://monitoring.your-domain.com/admin.html)
2. Login with admin password
3. Scroll to "Upload New CSV" section
4. Choose your CSV file
5. Click "Upload & Import"

**Option B: Via SCP**
```bash
# From your local machine
scp Node.csv user@your-server:/opt/monitoring/

# On production server
docker compose restart monitor
```

### 5. Verify Deployment

```bash
# Check logs
docker compose logs monitor --tail=50

# Should see:
# - "MongoDB connected successfully"
# - "Server running on http://localhost:3000"
# - "Processed X URLs"

# Test locally
curl http://localhost:3000/api/urls

# Should return JSON with servers
```

## Initial CSV File Not Required

The application will start without a CSV file. You can:
- Upload CSV via admin panel after deployment
- Add servers manually via admin panel
- The system creates an empty placeholder CSV file

## Updating the Application

```bash
# On production server
cd /opt/monitoring

# Pull latest changes
git pull

# Rebuild and restart
docker compose up -d --build

# Check logs
docker compose logs monitor --tail=50
```

## Cloudflare Tunnel Setup

See `CLOUDFLARE_TUNNEL_SETUP.md` for detailed instructions.

**Quick steps:**
1. Create tunnel at https://one.dash.cloudflare.com/
2. Copy tunnel token
3. Add to .env: `CLOUDFLARE_TUNNEL_TOKEN=...`
4. Configure public hostname (e.g., monitoring.your-domain.com)
5. Point to `monitor:3000` (HTTP)
6. Enable WebSocket support
7. Deploy with `docker compose up -d`

## Troubleshooting

### Container fails to build

**Error:** "Node.csv: not found"

**Solution:** This is now fixed. The container creates an empty CSV file automatically.

### MongoDB connection failed

```bash
# Check MongoDB is running
docker compose ps mongodb

# Check MongoDB logs
docker compose logs mongodb

# Restart MongoDB
docker compose restart mongodb
```

### Monitor service won't start

```bash
# Check logs
docker compose logs monitor

# Common issues:
# 1. MongoDB not ready - wait for healthy status
# 2. Port 3000 already in use - change PORT in .env
# 3. Missing environment variables - check .env file
```

### Cloudflared not connecting

```bash
# Check logs
docker compose logs cloudflared

# Common issues:
# 1. Invalid token - check CLOUDFLARE_TUNNEL_TOKEN
# 2. Missing token - ensure it's in .env
# 3. Network issues - check internet connectivity

# Restart cloudflared
docker compose restart cloudflared
```

## Security Checklist

- [ ] Changed default admin password
- [ ] Generated random session secret
- [ ] Using Cloudflare Tunnel for HTTPS
- [ ] Firewall configured (if needed)
- [ ] MongoDB not exposed to internet (only internal network)
- [ ] Regular backups configured
- [ ] Server and Docker images up to date

## Backup & Restore

### Backup MongoDB Data

```bash
# Backup to file
docker compose exec mongodb mongodump --db monitoring --out /data/backup

# Copy backup from container
docker cp monitoring-mongodb:/data/backup ./mongodb-backup-$(date +%Y%m%d)

# Create tar archive
tar -czf mongodb-backup-$(date +%Y%m%d).tar.gz mongodb-backup-$(date +%Y%m%d)
```

### Restore MongoDB Data

```bash
# Copy backup to container
docker cp ./mongodb-backup-20260102 monitoring-mongodb:/data/restore

# Restore database
docker compose exec mongodb mongorestore --db monitoring /data/restore/monitoring
```

### Backup CSV File

```bash
# Using volume backup
docker run --rm -v monitoring_csv_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/csv-backup-$(date +%Y%m%d).tar.gz -C /data .
```

## Monitoring & Maintenance

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f monitor
docker compose logs -f mongodb
docker compose logs -f cloudflared

# Last 100 lines
docker compose logs monitor --tail=100
```

### Check Resource Usage

```bash
# Container stats
docker stats monitoring-mongodb url-monitor monitoring-cloudflared

# Disk usage
docker system df
```

### Update Docker Images

```bash
# Pull latest base images
docker compose pull

# Rebuild services
docker compose up -d --build
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| MONGODB_URI | Yes | mongodb://mongodb:27017/monitoring | MongoDB connection |
| ADMIN_PASSWORD | Yes | admin123 | Admin panel password |
| SESSION_SECRET | Yes | (random) | Session encryption key |
| PORT | No | 3000 | Application port |
| CHECK_INTERVAL | No | 300000 | Health check interval (ms) |
| CLOUDFLARE_TUNNEL_TOKEN | No | - | Cloudflare tunnel token |

## Ports

- **3000** - Web application (HTTP)
- **27017** - MongoDB (internal only, not exposed in production)

## Volumes

- `mongodb_data` - Persistent MongoDB data
- `csv_data` - CSV file storage
- `./uploads` - Uploaded CSV files
- `./public` - Static files (optional, for development)

## Performance Tuning

### Adjust Check Interval

In `.env`:
```env
# Check every 5 minutes (300000 ms)
CHECK_INTERVAL=300000

# Check every 10 minutes (600000 ms)
CHECK_INTERVAL=600000
```

### MongoDB Memory Limit

In `compose.yaml`:
```yaml
mongodb:
  # ... existing config ...
  deploy:
    resources:
      limits:
        memory: 512M
```

## High Availability Setup

For production with high availability:

1. **Multiple Monitor Instances** (behind load balancer)
2. **MongoDB Replica Set** (instead of single instance)
3. **Redis Session Store** (instead of memory)
4. **Separate Monitoring** (Prometheus + Grafana)

See advanced documentation for HA setup.

## Support

- Check documentation in repository
- Review Docker logs for errors
- Test locally with `docker compose up` (development)
- Verify .env file has all required variables

---

**Ready to deploy!** Follow the steps above for a smooth production deployment.
