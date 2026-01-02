# Cloudflare Tunnel Setup Guide

## Overview

Cloudflare Tunnel (cloudflared) is now included in the Docker Compose setup. This allows you to securely expose your monitoring dashboard to the internet without opening ports or configuring firewalls.

## Benefits

✅ **No port forwarding required** - Works behind NAT/firewall
✅ **Free SSL/TLS** - Automatic HTTPS with Cloudflare certificate
✅ **DDoS protection** - Cloudflare's edge network protects your server
✅ **Easy deployment** - Just add token to .env file
✅ **No static IP needed** - Works from anywhere
✅ **Zero Trust security** - Optional access policies

## Prerequisites

1. **Cloudflare account** (free tier works fine)
2. **Domain registered with Cloudflare** (or transfer DNS to Cloudflare)
3. **Docker and Docker Compose** installed on your server

## Setup Instructions

### Step 1: Create Cloudflare Tunnel

1. **Login to Cloudflare Dashboard**
   - Go to: https://one.dash.cloudflare.com/

2. **Navigate to Tunnels**
   - Click on your account name
   - Go to **Zero Trust** → **Access** → **Tunnels**
   - Or direct link: https://one.dash.cloudflare.com/[your-account-id]/access/tunnels

3. **Create a New Tunnel**
   - Click **"Create a tunnel"**
   - Select **"Cloudflared"** as tunnel type
   - Give it a name (e.g., "monitoring-dashboard")
   - Click **"Save tunnel"**

4. **Copy Tunnel Token**
   - After creation, you'll see installation instructions
   - Copy the **tunnel token** (long string starting with `eyJ...`)
   - Keep this safe - you'll need it for the .env file

### Step 2: Configure Public Hostname

1. **In the Tunnel Configuration:**
   - Click **"Public Hostname"** tab
   - Click **"Add a public hostname"**

2. **Set up hostname:**
   - **Subdomain:** monitoring (or your choice)
   - **Domain:** your-domain.com (select from dropdown)
   - **Path:** leave empty
   - **Type:** HTTP
   - **URL:** `monitor:3000` (internal Docker service name)

3. **Additional Settings (Optional):**
   - **TLS Verification:** On (recommended)
   - **No TLS Verify:** Off
   - **HTTP2 Origin:** On
   - **Websocket:** On (required for real-time updates)

4. **Save Configuration**
   - Click **"Save hostname"**

### Step 3: Update .env File

On your production server:

```bash
# Navigate to project directory
cd /path/to/monitoring

# Edit .env file
nano .env

# Add your tunnel token
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Save and exit (Ctrl+X, Y, Enter)
```

Your `.env` file should look like:
```env
MONGODB_URI=mongodb://mongodb:27017/monitoring
ADMIN_PASSWORD=your-secure-password-here
SESSION_SECRET=your-random-secret-here
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 4: Deploy

```bash
# Start all services including cloudflared
docker compose up -d

# Verify all containers are running
docker compose ps

# Should show:
# - monitoring-mongodb (running)
# - url-monitor (running)
# - monitoring-cloudflared (running)

# Check cloudflared logs
docker compose logs cloudflared

# Should show: "Connection established" and "Registered tunnel connection"
```

### Step 5: Test Access

1. **Visit your public URL:**
   ```
   https://monitoring.your-domain.com
   ```

2. **Should see:**
   - UptimeService Status Dashboard
   - All server tiles
   - Green SSL padlock in browser

3. **Test Admin Panel:**
   ```
   https://monitoring.your-domain.com/admin.html
   ```

## Configuration Reference

### compose.yaml - Cloudflared Service

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  container_name: monitoring-cloudflared
  restart: unless-stopped
  command: tunnel run
  environment:
    - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
  depends_on:
    - monitor
  networks:
    - default
```

### Key Points:
- Uses latest cloudflared image
- Runs as a service (restarts automatically)
- Connects to `monitor:3000` internally
- No ports exposed on host machine
- Reads token from environment variable

## Troubleshooting

### Problem: Tunnel not connecting

**Check logs:**
```bash
docker compose logs cloudflared --tail=50
```

**Common issues:**
1. **Invalid token** - Double-check token copied correctly
2. **Missing token** - Ensure `CLOUDFLARE_TUNNEL_TOKEN` in .env
3. **Network issues** - Check internet connectivity

**Solution:**
```bash
# Restart cloudflared
docker compose restart cloudflared

# Check status
docker compose ps cloudflared
```

### Problem: 502 Bad Gateway

**Possible causes:**
1. Monitor service not running
2. MongoDB not connected
3. Internal routing issue

**Solution:**
```bash
# Check monitor service
docker compose logs monitor --tail=30

# Verify MongoDB connection
docker compose exec monitor curl http://localhost:3000/api/urls

# Restart all services
docker compose restart
```

### Problem: Tunnel token not found

**Error:** `error="Required 'TUNNEL_TOKEN' not found"`

**Solution:**
```bash
# Check .env file
cat .env | grep CLOUDFLARE_TUNNEL_TOKEN

# If missing, add it:
echo "CLOUDFLARE_TUNNEL_TOKEN=your-token-here" >> .env

# Restart
docker compose up -d --force-recreate cloudflared
```

### Problem: Cannot access dashboard

**Checklist:**
- [ ] Tunnel shows "Connected" in Cloudflare dashboard
- [ ] Public hostname configured correctly
- [ ] DNS record created (automatic with tunnel)
- [ ] Monitor service is running (`docker compose ps monitor`)
- [ ] Can access locally (`curl http://localhost:3000`)

## Security Best Practices

### 1. Change Admin Password
```bash
# In .env file
ADMIN_PASSWORD=use-a-very-strong-password-here
```

### 2. Enable Cloudflare Access (Optional)

Restrict access to authenticated users only:

1. Go to **Zero Trust** → **Access** → **Applications**
2. Click **"Add an application"**
3. Select **"Self-hosted"**
4. **Application name:** Monitoring Dashboard
5. **Session Duration:** 24 hours
6. **Application domain:** monitoring.your-domain.com
7. **Add policy:**
   - Name: Email Authentication
   - Action: Allow
   - Include: Emails ending in @your-company.com
8. **Save application**

Now users must authenticate via email before accessing.

### 3. Enable Rate Limiting

In Cloudflare Dashboard:
1. Go to **Security** → **WAF**
2. Create rate limiting rule
3. Limit: 100 requests per minute per IP
4. Action: Challenge or Block

### 4. Use Strong Session Secret
```bash
# Generate random secret
openssl rand -base64 32

# Add to .env
SESSION_SECRET=generated-random-secret-here
```

## Advanced Configuration

### Multiple Tunnels (Production + Staging)

You can run multiple tunnels for different environments:

**Production:**
```yaml
cloudflared-prod:
  image: cloudflare/cloudflared:latest
  environment:
    - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN_PROD}
```

**Staging:**
```yaml
cloudflared-staging:
  image: cloudflare/cloudflared:latest
  environment:
    - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN_STAGING}
```

### Custom Configuration File

If you need more control, use config file:

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  volumes:
    - ./cloudflared-config.yml:/etc/cloudflared/config.yml:ro
  command: tunnel --config /etc/cloudflared/config.yml run
```

**cloudflared-config.yml:**
```yaml
tunnel: your-tunnel-id
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: monitoring.example.com
    service: http://monitor:3000
  - service: http_status:404
```

## Monitoring Tunnel Health

### Check Tunnel Status

**In Cloudflare Dashboard:**
- Go to **Zero Trust** → **Access** → **Tunnels**
- Should show green "Healthy" status
- Shows connected connectors and traffic

**In Docker:**
```bash
# View live logs
docker compose logs -f cloudflared

# Should show regular keepalive messages
# "Registered tunnel connection"
```

### Metrics

View tunnel metrics in Cloudflare:
- Total requests
- Errors
- Response times
- Traffic by country

## Cost

**Cloudflare Tunnel is FREE:**
- ✅ Unlimited bandwidth
- ✅ Unlimited requests
- ✅ Included in free Cloudflare plan
- ✅ No hidden charges

**Optional paid features:**
- Zero Trust Access (advanced auth) - $0-7/user/month
- Argo Smart Routing - $0.10/GB
- Load Balancing - $5/month

## Comparison: Cloudflare Tunnel vs Alternatives

| Feature | Cloudflare Tunnel | Ngrok | VPS Reverse Proxy |
|---------|------------------|-------|-------------------|
| Cost | FREE | $8-$20/mo | $5-10/mo VPS |
| Setup | Very Easy | Easy | Complex |
| SSL | Free Auto | Free Auto | Manual (Let's Encrypt) |
| DDoS Protection | Included | Basic | None |
| Static URL | Yes | Paid only | Yes |
| Custom Domain | Yes | Paid only | Yes |
| Rate Limiting | Advanced | Basic | Manual |
| Firewall | Advanced | None | Manual |

## Support

**Cloudflare Docs:**
- https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/

**Community:**
- Cloudflare Community: https://community.cloudflare.com/

**Troubleshooting:**
- Check tunnel status in dashboard
- Review cloudflared logs: `docker compose logs cloudflared`
- Test local access first: `curl http://localhost:3000`

## Summary

✅ **Added cloudflared service to compose.yaml**
✅ **Token-based authentication (set in .env)**
✅ **Automatic SSL/TLS with Cloudflare**
✅ **No port forwarding needed**
✅ **Production-ready configuration**

Just add your `CLOUDFLARE_TUNNEL_TOKEN` to the `.env` file on your production server and run `docker compose up -d`!

---

**Last Updated:** 2026-01-02
**Version:** 1.0
