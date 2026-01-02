#!/bin/bash
# Diagnostic script for network issues

echo "=== Container Status ==="
docker compose -f compose.prod.yaml ps

echo ""
echo "=== Networks ==="
docker network ls | grep monitoring

echo ""
echo "=== Monitor Container Details ==="
docker inspect url-monitor --format '{{range .NetworkSettings.Networks}}Network: {{.NetworkID}} IP: {{.IPAddress}}{{end}}'

echo ""
echo "=== Cloudflared Container Details ==="
docker inspect monitoring-cloudflared --format '{{range .NetworkSettings.Networks}}Network: {{.NetworkID}} IP: {{.IPAddress}}{{end}}'

echo ""
echo "=== MongoDB Container Details ==="
docker inspect monitoring-mongodb --format '{{range .NetworkSettings.Networks}}Network: {{.NetworkID}} IP: {{.IPAddress}}{{end}}'

echo ""
echo "=== Check if monitor is listening on port 3000 ==="
docker exec url-monitor netstat -tlnp 2>/dev/null | grep 3000 || docker exec url-monitor ss -tlnp 2>/dev/null | grep 3000 || echo "netstat/ss not available"

echo ""
echo "=== Test from cloudflared to monitor (by container name) ==="
docker exec monitoring-cloudflared wget -O- --timeout=5 http://url-monitor:3000/api/urls 2>&1 | head -5

echo ""
echo "=== Test from cloudflared to monitor (by service name) ==="
docker exec monitoring-cloudflared wget -O- --timeout=5 http://monitor:3000/api/urls 2>&1 | head -5

echo ""
echo "=== Cloudflared logs (last 20 lines) ==="
docker logs --tail=20 monitoring-cloudflared

echo ""
echo "=== Monitor logs (last 20 lines) ==="
docker logs --tail=20 url-monitor
