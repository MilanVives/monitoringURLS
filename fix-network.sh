#!/bin/bash
# Script to fix network issues on production server

echo "Stopping all containers..."
docker compose -f compose.prod.yaml down

echo "Removing old networks..."
docker network rm monitoringurls_default 2>/dev/null || true
docker network rm monitoringurls_monitoring-network 2>/dev/null || true

echo "Pruning unused networks..."
docker network prune -f

echo "Starting services with correct network..."
docker compose -f compose.prod.yaml up -d

echo "Waiting for services to start..."
sleep 5

echo "Checking network configuration..."
docker network ls | grep monitoring

echo ""
echo "Checking which containers are on the network..."
docker network inspect monitoringurls_monitoring-network --format '{{range .Containers}}{{.Name}} {{end}}'

echo ""
echo "Testing connectivity from cloudflared to monitor..."
docker exec monitoring-cloudflared nslookup url-monitor 2>/dev/null || echo "nslookup not available, trying curl..."
docker exec monitoring-cloudflared wget -O- http://url-monitor:3000/api/urls 2>&1 | head -n 20

echo ""
echo "Done! Check the output above."
