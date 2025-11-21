#!/bin/bash

# Script to clear product data from remote databases
# This will delete all products, prices, and inventory from the remote databases

echo "🧹 Clearing product data from REMOTE databases..."
echo ""

echo "⚠️  WARNING: This will delete ALL products, prices, and inventory!"
echo "   Press Ctrl+C to cancel, or wait 3 seconds to continue..."
sleep 3

echo ""
echo "🗑️  Deleting products from Catalog DB..."
wrangler d1 execute catalog-db \
  --command="DELETE FROM products;" \
  --config wrangler.catalogworker.toml \
  --remote

if [ $? -eq 0 ]; then
  echo "✅ Products deleted successfully!"
else
  echo "❌ Failed to delete products"
  exit 1
fi

echo ""
echo "🗑️  Deleting prices from Pricing DB..."
wrangler d1 execute pricing-db \
  --command="DELETE FROM prices;" \
  --config wrangler.pricingworker.toml \
  --remote

if [ $? -eq 0 ]; then
  echo "✅ Prices deleted successfully!"
else
  echo "❌ Failed to delete prices"
  exit 1
fi

echo ""
echo "🗑️  Deleting inventory from Fulfillment DB..."
wrangler d1 execute fulfillment-db \
  --command="DELETE FROM inventory;" \
  --config wrangler.fulfillmentworker.toml \
  --remote

if [ $? -eq 0 ]; then
  echo "✅ Inventory deleted successfully!"
else
  echo "❌ Failed to delete inventory"
  exit 1
fi

echo ""
echo "🎉 All product data cleared from remote databases!"
echo ""
echo "💡 To reload sample data, run:"
echo "   ./scripts/load-sample-data.sh --remote"

