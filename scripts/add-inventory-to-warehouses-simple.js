/**
 * Simple script to add inventory entries for existing products
 * Uses direct SQL execution with wrangler
 */

import { execSync } from 'child_process';

const CHENNAI_WAREHOUSE = 'WH-CHN-001';
const BANGALORE_WAREHOUSE = 'WH-BLR-001';

// Get product IDs from catalog database
async function getProductIds() {
  try {
    const result = execSync(
      `wrangler d1 execute catalog-db --command "SELECT product_id FROM products WHERE deleted_at IS NULL LIMIT 5" --config wrangler.catalogworker.toml --remote --json`,
      { encoding: 'utf-8' }
    );
    
    const data = JSON.parse(result);
    if (data && data[0] && data[0].results) {
      return data[0].results.map(row => row.product_id);
    }
    return [];
  } catch (error) {
    console.error('Error fetching products:', error.message);
    throw error;
  }
}

// Add inventory entry
async function addInventory(productId, warehouseId, quantity) {
  const inventoryId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const sql = `
    INSERT INTO inventory (inventory_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at)
    VALUES ('${inventoryId}', '${productId}', '${warehouseId}', ${quantity}, 0, '${now}', '${now}')
  `;

  try {
    const result = execSync(
      `wrangler d1 execute fulfillment-db --command "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}" --config wrangler.fulfillmentworker.toml --remote --json`,
      { encoding: 'utf-8' }
    );
    
    const data = JSON.parse(result);
    return data && data[0] && data[0].success;
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return false; // Already exists
    }
    throw error;
  }
}

async function main() {
  console.log('🚀 Adding inventory to warehouses...\n');
  
  const products = await getProductIds();
  if (products.length < 3) {
    console.error('❌ Need at least 3 products, found:', products.length);
    process.exit(1);
  }

  console.log(`✅ Found ${products.length} products\n`);

  // Add 2 products to Chennai
  console.log('📦 Adding to Chennai warehouse...');
  let chennaiCount = 0;
  for (let i = 0; i < 2; i++) {
    const quantity = 75 + i * 25; // 75, 100
    if (await addInventory(products[i], CHENNAI_WAREHOUSE, quantity)) {
      console.log(`  ✅ Product ${products[i].substring(0, 8)}... (${quantity} units)`);
      chennaiCount++;
    } else {
      console.log(`  ⚠️  Product ${products[i].substring(0, 8)}... already exists`);
    }
  }

  // Add 1 product to Bangalore
  console.log('\n📦 Adding to Bangalore warehouse...');
  const quantity = 90;
  if (await addInventory(products[2], BANGALORE_WAREHOUSE, quantity)) {
    console.log(`  ✅ Product ${products[2].substring(0, 8)}... (${quantity} units)`);
  } else {
    console.log(`  ⚠️  Product ${products[2].substring(0, 8)}... already exists`);
  }

  console.log('\n✨ Done!');
  console.log(`  Chennai: ${chennaiCount} products`);
  console.log(`  Bangalore: 1 product`);
}

main().catch(console.error);

