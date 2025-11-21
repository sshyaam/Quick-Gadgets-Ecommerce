#!/bin/bash

# Deploy All Workers Script (Parallel Version)
# This script deploys all Cloudflare Workers in parallel for faster deployment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Worker configurations
WORKERS=(
  "authworker"
  "catalogworker"
  "pricingworker"
  "fulfillmentworker"
  "cartworker"
  "paymentworker"
  "ordersworker"
  "ratingworker"
  "realtimeworker"
  "logworker"
  "healthcheckworker"
)

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Deploying All Cloudflare Workers${NC}"
echo -e "${BLUE}  (Parallel Deployment)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to deploy a single worker
deploy_worker() {
  local worker=$1
  local CONFIG_FILE="wrangler.${worker}.toml"
  
  if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}✗${NC} ${worker}: Config file not found: ${CONFIG_FILE}" >&2
    return 1
  fi
  
  echo -e "${YELLOW}Deploying ${worker}...${NC}" >&2
  
  if wrangler deploy --config "$CONFIG_FILE" > /tmp/${worker}.log 2>&1; then
    echo -e "${GREEN}✓${NC} ${worker}: Successfully deployed" >&2
    return 0
  else
    echo -e "${RED}✗${NC} ${worker}: Failed to deploy (check /tmp/${worker}.log)" >&2
    return 1
  fi
}

# Export function for parallel execution
export -f deploy_worker
export RED GREEN YELLOW BLUE NC

# Deploy all workers in parallel
echo "Starting parallel deployment..."
echo ""

# Use xargs to run deployments in parallel (max 3 at a time to avoid rate limits)
printf '%s\n' "${WORKERS[@]}" | xargs -n 1 -P 3 -I {} bash -c 'deploy_worker "$@"' _ {}

# Wait for all background jobs
wait

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Deployment Complete${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Check individual logs in /tmp/<worker>.log if any deployments failed"

