#!/bin/bash

# Deploy All Workers Script
# This script deploys all Cloudflare Workers for the e-commerce application

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Worker configurations in deployment order
# (Order matters if workers depend on each other)
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
echo -e "${BLUE}========================================${NC}"
echo ""

# Track success/failure
SUCCESSFUL=()
FAILED=()

# Deploy each worker
for worker in "${WORKERS[@]}"; do
  CONFIG_FILE="wrangler.${worker}.toml"
  
  if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}✗${NC} Config file not found: ${CONFIG_FILE}"
    FAILED+=("$worker")
    continue
  fi
  
  echo -e "${YELLOW}Deploying ${worker}...${NC}"
  
  if wrangler deploy --config "$CONFIG_FILE"; then
    echo -e "${GREEN}✓${NC} Successfully deployed ${worker}"
    SUCCESSFUL+=("$worker")
  else
    echo -e "${RED}✗${NC} Failed to deploy ${worker}"
    FAILED+=("$worker")
  fi
  
  echo ""
done

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Deployment Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ ${#SUCCESSFUL[@]} -gt 0 ]; then
  echo -e "${GREEN}Successfully deployed (${#SUCCESSFUL[@]}):${NC}"
  for worker in "${SUCCESSFUL[@]}"; do
    echo -e "  ${GREEN}✓${NC} $worker"
  done
  echo ""
fi

if [ ${#FAILED[@]} -gt 0 ]; then
  echo -e "${RED}Failed to deploy (${#FAILED[@]}):${NC}"
  for worker in "${FAILED[@]}"; do
    echo -e "  ${RED}✗${NC} $worker"
  done
  echo ""
  exit 1
else
  echo -e "${GREEN}All workers deployed successfully!${NC}"
  exit 0
fi

