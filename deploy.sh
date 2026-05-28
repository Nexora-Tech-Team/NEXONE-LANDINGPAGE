#!/bin/bash
# Deploy script untuk VPS
# Path: ~/nexora-node/apps/product-nexone
set -e

echo "==> [1/4] Pulling latest changes from GitHub..."
git pull origin main

echo "==> [2/4] Building Docker images (no cache)..."
docker compose build --no-cache

echo "==> [3/4] Restarting services..."
docker compose up -d

echo "==> [4/4] Cleaning up old images..."
docker image prune -f

echo ""
echo "==> Deploy selesai!"
docker compose ps