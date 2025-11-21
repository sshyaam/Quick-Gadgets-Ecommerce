#!/bin/bash

# Test script for all worker endpoints
# Usage: ./scripts/test-workers.sh

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Worker URLs (update these with your actual URLs)
AUTH_URL="https://auth-worker.shyaamdps.workers.dev"
CATALOG_URL="https://catalog-worker.shyaamdps.workers.dev"
PRICING_URL="https://pricing-worker.shyaamdps.workers.dev"
FULFILLMENT_URL="https://fulfillment-worker.shyaamdps.workers.dev"
CART_URL="https://cart-worker.shyaamdps.workers.dev"
PAYMENT_URL="https://payment-worker.shyaamdps.workers.dev"
ORDERS_URL="https://orders-worker.shyaamdps.workers.dev"
RATING_URL="https://rating-worker.shyaamdps.workers.dev"
LOG_URL="https://log-worker.shyaamdps.workers.dev"
REALTIME_URL="https://realtime-worker.shyaamdps.workers.dev"
HEALTH_URL="https://health-check-worker.shyaamdps.workers.dev"

API_KEY="ECOMSECRET"

echo -e "${BLUE}🧪 Testing Worker Endpoints${NC}\n"

# Test function
test_endpoint() {
    local method=$1
    local url=$2
    local description=$3
    local data=$4
    local headers=$5
    
    echo -e "${BLUE}Testing: ${description}${NC}"
    echo -e "  ${method} ${url}"
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -H "$headers" \
            -d "$data" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -H "$headers" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "  ${GREEN}✅ Success (${http_code})${NC}"
        echo -e "  Response: $(echo "$body" | head -c 200)..."
    else
        echo -e "  ${RED}❌ Failed (${http_code})${NC}"
        echo -e "  Response: $body"
    fi
    echo ""
}

# Health Checks
echo -e "${YELLOW}=== Health Checks ===${NC}\n"
test_endpoint "GET" "${AUTH_URL}/health" "Auth Worker Health"
test_endpoint "GET" "${CATALOG_URL}/health" "Catalog Worker Health"
test_endpoint "GET" "${PRICING_URL}/health" "Pricing Worker Health"
test_endpoint "GET" "${FULFILLMENT_URL}/health" "Fulfillment Worker Health"
test_endpoint "GET" "${CART_URL}/health" "Cart Worker Health"
test_endpoint "GET" "${PAYMENT_URL}/health" "Payment Worker Health"
test_endpoint "GET" "${ORDERS_URL}/health" "Orders Worker Health"
test_endpoint "GET" "${RATING_URL}/health" "Rating Worker Health"
test_endpoint "GET" "${LOG_URL}/health" "Log Worker Health"
test_endpoint "GET" "${REALTIME_URL}/health" "Realtime Worker Health"
test_endpoint "GET" "${HEALTH_URL}/health" "Health Check Worker"

# Root endpoints
echo -e "${YELLOW}=== Root Endpoints ===${NC}\n"
test_endpoint "GET" "${AUTH_URL}/" "Auth Worker Root"
test_endpoint "GET" "${CATALOG_URL}/" "Catalog Worker Root"

# Catalog endpoints
echo -e "${YELLOW}=== Catalog Endpoints ===${NC}\n"
test_endpoint "GET" "${CATALOG_URL}/products?page=1&limit=10" "Get Products"
test_endpoint "GET" "${CATALOG_URL}/product/test-product-id" "Get Single Product (will fail - no product)"

# Auth endpoints (public)
echo -e "${YELLOW}=== Auth Endpoints (Public) ===${NC}\n"
test_endpoint "POST" "${AUTH_URL}/signup" "Signup (test)" \
    '{"name":"Test User","email":"test@example.com","password":"testpass123","contactNumber":"9876543210","address":{"name":"Test Name","contactNumber":"9876543210","doorNumber":"123","street":"Test Street","pincode":"400001","city":"Mumbai","state":"Maharashtra"}}'

# Inter-worker endpoints (require API key)
echo -e "${YELLOW}=== Inter-Worker Endpoints ===${NC}\n"
test_endpoint "GET" "${PRICING_URL}/product/test-id" "Get Price (inter-worker)" "" "X-API-Key: ${API_KEY}"
test_endpoint "GET" "${FULFILLMENT_URL}/stock/test-id" "Get Stock (inter-worker)" "" "X-API-Key: ${API_KEY}"

echo -e "${GREEN}✨ Testing complete!${NC}"

