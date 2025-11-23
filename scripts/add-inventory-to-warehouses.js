/**
 * Script to add inventory entries for existing products in Chennai and Bangalore warehouses
 * 
 * Usage:
 *   node scripts/add-inventory-to-warehouses.js
 * 
 * This script:
 * - Gets existing products from catalog database
 * - Adds 2 products to Chennai warehouse (WH-CHN-001)
 * - Adds 1 product to Bangalore warehouse (WH-BLR-001)
 */

import { randomUUID } from 'crypto';
import { execSync } from 'child_process';

// Warehouse IDs
const CHENNAI_WAREHOUSE = 'WH-CHN-001';
const BANGALORE_WAREHOUSE = 'WH-BLR-001';

// Get database name from wrangler config
function getDatabaseName() {
  try {
    const wranglerConfig = execSync('grep "database_name" wrangler.fulfillmentworker.toml | head -1', { encoding: 'utf-8' });
    const match = wranglerConfig.match(/database_name\s*=\s*"([^"]+)"/);
    if (match) {
      return match[1];
    }
  } catch (error) {
    console.error('Error reading wrangler config:', error.message);
  }
  return null;
}

// Get catalog database name
function getCatalogDatabaseName() {
  try {
    const wranglerConfig = execSync('grep "database_name" wrangler.catalogworker.toml | head -1', { encoding: 'utf-8' });
    const match = wranglerConfig.match(/database_name\s*=\s*"([^"]+)"/);
    if (match) {
      return match[1];
    }
  } catch (error) {
    console.error('Error reading catalog wrangler config:', error.message);
  }
  return null;
}

async function getExistingProducts() {
  const catalogDbName = getCatalogDatabaseName();
  if (!catalogDbName) {
    throw new Error('Could not find catalog database name');
  }

  try {
    // Query products from catalog database
    const query = `SELECT product_id FROM products WHERE deleted_at IS NULL LIMIT 10`;
    const result = execSync(
      `wrangler d1 execute ${catalogDbName} --command "${query.replace(/"/g, '\\"')}" --json`,
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

async function addInventoryEntry(productId, warehouseId, quantity) {
  const dbName = getDatabaseName();
  if (!dbName) {
    throw new Error('Could not find fulfillment database name');
  }

  const inventoryId = randomUUID();
  const now = new Date().toISOString();

  const insertQuery = `
    INSERT INTO inventory (inventory_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at)
    VALUES ('${inventoryId}', '${productId}', '${warehouseId}', ${quantity}, 0, '${now}', '${now}')
  `;

  try {
    const result = execSync(
      `wrangler d1 execute ${dbName} --command "${insertQuery.replace(/"/g, '\\"')}" --json`,
      { encoding: 'utf-8' }
    );
    
    const data = JSON.parse(result);
    if (data && data[0] && data[0].success) {
      console.log(`✅ Added ${quantity} units of product ${productId.substring(0, 8)}... to warehouse ${warehouseId}`);
      return true;
    } else {
      console.error(`❌ Failed to add inventory:`, data);
      return false;
    }
  } catch (error) {
    // Check if it's a unique constraint error (product already exists in warehouse)
    if (error.message.includes('UNIQUE constraint') || error.message.includes('already exists')) {
      console.log(`⚠️  Product ${productId.substring(0, 8)}... already exists in warehouse ${warehouseId}, skipping...`);
      return false;
    }
    console.error(`❌ Error adding inventory for product ${productId}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting inventory addition script...\n');

  try {
    // Get existing products
    console.log('📦 Fetching existing products...');
    const products = await getExistingProducts();
    
    if (products.length === 0) {
      console.error('❌ No products found in catalog database');
      process.exit(1);
    }

    console.log(`✅ Found ${products.length} products\n`);

    // Add 2 products to Chennai warehouse
    console.log(`📦 Adding products to Chennai warehouse (${CHENNAI_WAREHOUSE})...`);
    let chennaiCount = 0;
    for (let i = 0; i < Math.min(2, products.length); i++) {
      const quantity = 50 + Math.floor(Math.random() * 50); // Random quantity between 50-100
      const success = await addInventoryEntry(products[i], CHENNAI_WAREHOUSE, quantity);
      if (success) chennaiCount++;
    }
    console.log(`✅ Added ${chennaiCount} products to Chennai warehouse\n`);

    // Add 1 product to Bangalore warehouse (use a different product if available)
    console.log(`📦 Adding product to Bangalore warehouse (${BANGALORE_WAREHOUSE})...`);
    const bangaloreProductIndex = products.length > 2 ? 2 : 0; // Use 3rd product or first if less than 3
    const quantity = 75 + Math.floor(Math.random() * 50); // Random quantity between 75-125
    const success = await addInventoryEntry(products[bangaloreProductIndex], BANGALORE_WAREHOUSE, quantity);
    if (success) {
      console.log(`✅ Added 1 product to Bangalore warehouse\n`);
    }

    console.log('✨ Inventory addition completed!');
    console.log('\nSummary:');
    console.log(`  - Chennai (${CHENNAI_WAREHOUSE}): ${chennaiCount} products`);
    console.log(`  - Bangalore (${BANGALORE_WAREHOUSE}): ${success ? 1 : 0} product`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

