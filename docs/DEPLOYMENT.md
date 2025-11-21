# Database Deployment Guide

This guide explains how to deploy all database schemas and sample data to remote D1 databases.

## Quick Start

### Option 1: Automated Script (Recommended)

Run the deployment script to push everything to remote:

```bash
./scripts/deploy-databases.sh
```

This script will:
- Deploy all database schemas to remote
- Deploy sample products, prices, and inventory data
- Use consistent UUIDs across all databases

### Option 2: Manual Deployment

If you prefer to deploy manually, follow these steps:

## Step 1: Deploy Database Schemas

Deploy all schemas to remote databases:

```bash
# Auth Worker
wrangler d1 execute auth-db --remote --file=./database-schemas/auth.sql --config wrangler.authworker.toml

# Catalog Worker
wrangler d1 execute catalog-db --remote --file=./database-schemas/catalog.sql --config wrangler.catalogworker.toml

# Pricing Worker
wrangler d1 execute pricing-db --remote --file=./database-schemas/pricing.sql --config wrangler.pricingworker.toml

# Fulfillment Worker
wrangler d1 execute fulfillment-db --remote --file=./database-schemas/fulfillment.sql --config wrangler.fulfillmentworker.toml

# Cart Worker
wrangler d1 execute cart-db --remote --file=./database-schemas/cart.sql --config wrangler.cartworker.toml

# Payment Worker
wrangler d1 execute payment-db --remote --file=./database-schemas/payment.sql --config wrangler.paymentworker.toml

# Orders Worker
wrangler d1 execute orders-db --remote --file=./database-schemas/orders.sql --config wrangler.ordersworker.toml

# Rating Worker
wrangler d1 execute rating-db --remote --file=./database-schemas/rating.sql --config wrangler.ratingworker.toml
```

## Step 2: Generate Sample Data (if not already done)

Generate sample products with UUIDs:

```bash
node scripts/generate-sample-data.js
```

This creates:
- `database-schemas/sample-products-uuid.sql` - Products with extensive JSON attributes
- `database-schemas/sample-prices-uuid.sql` - Prices for all products
- `database-schemas/sample-inventory-uuid.sql` - Stock quantities for all products

**Note:** All three files use the same UUIDs, ensuring data consistency across databases.

## Step 3: Deploy Sample Data

Deploy the generated sample data:

```bash
# Catalog - Products
wrangler d1 execute catalog-db --remote --file=./database-schemas/sample-products-uuid.sql --config wrangler.catalogworker.toml

# Pricing - Prices
wrangler d1 execute pricing-db --remote --file=./database-schemas/sample-prices-uuid.sql --config wrangler.pricingworker.toml

# Fulfillment - Inventory
wrangler d1 execute fulfillment-db --remote --file=./database-schemas/sample-inventory-uuid.sql --config wrangler.fulfillmentworker.toml
```

## Sample Products Included

The script generates 5 products with extensive JSON attributes (100+ fields each):

1. **TechMax Pro 15 Ultra** (Smartphone)
   - Price: $1,299.99
   - Stock: 50 units
   - UUID: `c2c969af-c995-4f82-8e9c-0fd957c6a96f`

2. **GameForce X1 Pro** (Gaming Laptop)
   - Price: $3,499.99
   - Stock: 25 units
   - UUID: `256d1bf1-12be-410d-aea5-8efa46b4afd8`

3. **TabMax Pro 12.9** (Tablet)
   - Price: $1,099.99
   - Stock: 75 units
   - UUID: `73d784f0-4d52-46b2-8688-c4b8a53fea85`

4. **SoundWave Pro Max** (Wireless Earbuds)
   - Price: $299.99
   - Stock: 200 units
   - UUID: `b48ada74-a7bc-4447-9bcc-fa889152de57`

5. **FitMax Pro 2** (Smart Watch)
   - Price: $499.99
   - Stock: 150 units
   - UUID: `ec3b8661-f5af-4cb7-a18b-d4ee808d67d6`

## Verify Deployment

After deployment, verify the data:

```bash
# Check catalog products
wrangler d1 execute catalog-db --remote --command="SELECT COUNT(*) as count FROM products;" --config wrangler.catalogworker.toml

# Check prices
wrangler d1 execute pricing-db --remote --command="SELECT COUNT(*) as count FROM prices;" --config wrangler.pricingworker.toml

# Check inventory
wrangler d1 execute fulfillment-db --remote --command="SELECT COUNT(*) as count FROM inventory;" --config wrangler.fulfillmentworker.toml
```

## Regenerating Data

If you need to regenerate the sample data with new UUIDs:

```bash
# Delete old files (optional)
rm database-schemas/sample-*-uuid.sql

# Regenerate
node scripts/generate-sample-data.js

# Redeploy
./scripts/deploy-databases.sh
```

## Notes

- **UUIDs are consistent**: The same UUIDs are used across catalog, pricing, and fulfillment databases
- **Remote flag**: Always use `--remote` flag to deploy to production databases
- **Local testing**: Remove `--remote` flag to test on local databases first
- **Idempotent**: Running the deployment multiple times is safe (INSERT statements will fail if data exists)

## Troubleshooting

### Error: "Table already exists"
This is normal if you've already deployed schemas. The script will continue.

### Error: "UNIQUE constraint failed"
This means the data already exists. You can either:
1. Delete existing data first
2. Use `INSERT OR REPLACE` instead of `INSERT` (modify SQL files)
3. Skip data deployment if data already exists

### Error: "Database not found"
Make sure:
1. Databases are created in Cloudflare dashboard
2. Database IDs in `wrangler.*.toml` files are correct
3. You're authenticated with `wrangler login`

