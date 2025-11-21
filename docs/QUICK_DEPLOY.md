# Quick Deployment Guide

## ✅ Fulfillment Database - Already Deployed!

The fulfillment database schema and warehouse data have been successfully deployed:
- ✅ Schema created (warehouses, inventory, shipping_rules, pincode_coverage)
- ✅ Warehouse data inserted (8 warehouses across India)
- ✅ Shipping rules created (INR pricing)

## 📦 Deploy Sample Products Data

Now deploy the sample products, prices, and inventory:

```bash
# 1. Deploy products to catalog
wrangler d1 execute catalog-db --remote --file=./database-schemas/sample-products-uuid.sql --config wrangler.catalogworker.toml

# 2. Deploy prices to pricing (INR)
wrangler d1 execute pricing-db --remote --file=./database-schemas/sample-prices-uuid.sql --config wrangler.pricingworker.toml

# 3. Deploy inventory to fulfillment (with warehouse support)
wrangler d1 execute fulfillment-db --remote --file=./database-schemas/sample-inventory-uuid.sql --config wrangler.fulfillmentworker.toml
```

## 🧪 Test Your Workers

```bash
# Run automated tests
./scripts/test-workers.sh

# Or test manually
curl https://catalog-worker.shyaamdps.workers.dev/products?page=1&limit=10
curl https://auth-worker.shyaamdps.workers.dev/health
```

## 📝 Product UUIDs Generated

- **TechMax Pro 15 Ultra**: `07ba92f1-0ffd-401e-8bee-1732baa2ac2d`
- **GameForce X1 Pro**: `32e4930c-5810-4cd6-b1c6-41e517038fe5`
- **TabMax Pro 12.9**: `fc4e2e7d-c544-46e7-989f-342e5ce0366d`
- **SoundWave Pro Max**: `8845139b-9955-4eef-a86d-e95a95d80502`
- **FitMax Pro 2**: `01ee3b1e-ce6b-4a44-842e-b2718ad72926`

All products have:
- ✅ Extensive JSON attributes (100+ fields)
- ✅ Prices in INR
- ✅ Stock assigned to Mumbai warehouse (WH-MUM-001)

## 🔄 If You Need to Regenerate Data

```bash
# Regenerate with new UUIDs
node scripts/generate-sample-data.js

# Then redeploy
wrangler d1 execute catalog-db --remote --file=./database-schemas/sample-products-uuid.sql --config wrangler.catalogworker.toml
wrangler d1 execute pricing-db --remote --file=./database-schemas/sample-prices-uuid.sql --config wrangler.pricingworker.toml
wrangler d1 execute fulfillment-db --remote --file=./database-schemas/sample-inventory-uuid.sql --config wrangler.fulfillmentworker.toml
```

