#!/bin/bash

# Script to deploy all database schemas and sample data to remote D1 databases
# This will push all tables and data to the remote databases

set -e  # Exit on error

echo "🚀 Starting database deployment to remote D1 databases..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to execute SQL on remote database
execute_remote() {
    local db_name=$1
    local config_file=$2
    local sql_file=$3
    local description=$4
    
    echo -e "${BLUE}📦 ${description}...${NC}"
    if wrangler d1 execute "${db_name}" --remote --file="${sql_file}" --config "${config_file}"; then
        echo -e "${GREEN}✅ ${description} - Success${NC}"
    else
        echo -e "${YELLOW}⚠️  ${description} - Failed (might already exist)${NC}"
    fi
    echo ""
}

# Deploy all schemas to remote
echo -e "${BLUE}📋 Deploying database schemas to remote...${NC}"
echo ""

execute_remote "auth-db" "wrangler.authworker.toml" "database-schemas/auth.sql" "Auth Worker Schema"
execute_remote "catalog-db" "wrangler.catalogworker.toml" "database-schemas/catalog.sql" "Catalog Worker Schema"
execute_remote "pricing-db" "wrangler.pricingworker.toml" "database-schemas/pricing.sql" "Pricing Worker Schema"
execute_remote "fulfillment-db" "wrangler.fulfillmentworker.toml" "database-schemas/fulfillment.sql" "Fulfillment Worker Schema"
execute_remote "cart-db" "wrangler.cartworker.toml" "database-schemas/cart.sql" "Cart Worker Schema"
execute_remote "payment-db" "wrangler.paymentworker.toml" "database-schemas/payment.sql" "Payment Worker Schema"
execute_remote "orders-db" "wrangler.ordersworker.toml" "database-schemas/orders.sql" "Orders Worker Schema"
execute_remote "rating-db" "wrangler.ratingworker.toml" "database-schemas/rating.sql" "Rating Worker Schema"

# Deploy sample data
echo -e "${BLUE}📦 Deploying sample data to remote...${NC}"
echo ""

if [ -f "database-schemas/sample-products-uuid.sql" ]; then
    execute_remote "catalog-db" "wrangler.catalogworker.toml" "database-schemas/sample-products-uuid.sql" "Catalog Sample Products"
else
    echo -e "${YELLOW}⚠️  sample-products-uuid.sql not found. Run: node scripts/generate-sample-data.js${NC}"
fi

if [ -f "database-schemas/sample-prices-uuid.sql" ]; then
    execute_remote "pricing-db" "wrangler.pricingworker.toml" "database-schemas/sample-prices-uuid.sql" "Pricing Sample Data"
else
    echo -e "${YELLOW}⚠️  sample-prices-uuid.sql not found. Run: node scripts/generate-sample-data.js${NC}"
fi

if [ -f "database-schemas/sample-inventory-uuid.sql" ]; then
    execute_remote "fulfillment-db" "wrangler.fulfillmentworker.toml" "database-schemas/sample-inventory-uuid.sql" "Inventory Sample Data"
else
    echo -e "${YELLOW}⚠️  sample-inventory-uuid.sql not found. Run: node scripts/generate-sample-data.js${NC}"
fi

echo -e "${GREEN}✨ Database deployment complete!${NC}"
echo ""
echo "📝 Next steps:"
echo "   1. Verify data: Check your Cloudflare dashboard or query the databases"
echo "   2. Test the catalog endpoint: Visit your catalog worker URL"
echo "   3. Test the frontend: Products should now appear in the catalog"

