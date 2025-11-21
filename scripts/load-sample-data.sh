#!/bin/bash

# Script to load sample data into Catalog, Pricing, and Fulfillment databases
# This loads products, prices, and inventory data

# Check if --remote flag is provided
REMOTE_FLAG=""
if [ "$1" == "--remote" ]; then
  REMOTE_FLAG="--remote"
  echo "🌐 Loading into REMOTE database..."
else
  echo "💻 Loading into LOCAL database..."
  echo "   (Use --remote flag to load into production database)"
fi

echo "📦 Loading Sample Data into Databases..."
echo ""

# Clear existing data first
echo "🧹 Clearing existing data..."
echo ""

echo "   Clearing products..."
wrangler d1 execute catalog-db \
  --command="DELETE FROM products;" \
  --config wrangler.catalogworker.toml \
  $REMOTE_FLAG > /dev/null 2>&1

echo "   Clearing prices..."
wrangler d1 execute pricing-db \
  --command="DELETE FROM prices;" \
  --config wrangler.pricingworker.toml \
  $REMOTE_FLAG > /dev/null 2>&1

echo "   Clearing inventory..."
wrangler d1 execute fulfillment-db \
  --command="DELETE FROM inventory;" \
  --config wrangler.fulfillmentworker.toml \
  $REMOTE_FLAG > /dev/null 2>&1

echo "✅ Existing data cleared!"
echo ""

# Load Products into Catalog DB
echo "1️⃣  Loading products into Catalog DB..."
wrangler d1 execute catalog-db \
  --file=./database-schemas/sample-products-uuid.sql \
  --config wrangler.catalogworker.toml \
  $REMOTE_FLAG

if [ $? -eq 0 ]; then
  echo "✅ Products loaded successfully!"
else
  echo "❌ Failed to load products"
  exit 1
fi

echo ""

# Load Prices into Pricing DB
echo "2️⃣  Loading prices into Pricing DB..."
wrangler d1 execute pricing-db \
  --file=./database-schemas/sample-prices-uuid.sql \
  --config wrangler.pricingworker.toml \
  $REMOTE_FLAG

if [ $? -eq 0 ]; then
  echo "✅ Prices loaded successfully!"
else
  echo "❌ Failed to load prices"
  exit 1
fi

echo ""

# Load Inventory into Fulfillment DB
echo "3️⃣  Loading inventory into Fulfillment DB..."
wrangler d1 execute fulfillment-db \
  --file=./database-schemas/sample-inventory-uuid.sql \
  --config wrangler.fulfillmentworker.toml \
  $REMOTE_FLAG

if [ $? -eq 0 ]; then
  echo "✅ Inventory loaded successfully!"
else
  echo "❌ Failed to load inventory"
  exit 1
fi

echo ""
echo "🎉 All sample data loaded successfully!"
echo ""
echo "📊 Summary:"
echo "   - Products: 5 items"
echo "   - Prices: 5 items"
echo "   - Inventory: 5 items (distributed across warehouses)"
echo ""
echo "💡 To regenerate fresh sample data, run:"
echo "   node scripts/generate-sample-data.js"

