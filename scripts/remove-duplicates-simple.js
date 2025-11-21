#!/usr/bin/env node

/**
 * Script to remove duplicate products - keeps the most recent one
 * Based on the query results, we'll delete the older duplicates
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Older duplicate product IDs to delete (from first run, created earlier)
const DUPLICATE_PRODUCT_IDS = [
  'cf87a0fb-b29b-48c9-98ae-881684ef204c', // Nexus Ultra 5G Smartphone (older)
  '7a78fb52-5d4f-4a75-9917-11a543fcd5b7', // PixelTab Pro 12.9 (older)
  '695e135f-fcdb-46b9-8e90-2e1eb4b0d426', // ThunderBolt Wireless Earbuds Pro (older)
  'f50df604-0179-49fd-ad16-e314c9368931', // Velocity Gaming Mouse (older)
  '8ed13861-9855-4d61-955d-00c6c1014764', // Fusion X2 Smartwatch (older)
  '7176107e-2126-4967-b3a4-0ca990a37c77', // Nexus Ultra 5G Smartphone - 512GB (older)
  '3949c579-c828-4dc6-983c-6c27167441a9', // Quantum Pro X1 Laptop - RTX 4080 (older)
  '1275a55d-1156-49c1-b087-79f9e213d1f1', // PixelTab Pro 12.9 - 1TB (older)
  '4a4b1a92-3b4d-44ea-b460-2ca572a1a945', // ThunderBolt Wireless Earbuds Pro - Limited Edition (older)
];

function getCatalogDatabaseName() {
  try {
    const wranglerConfig = execSync('grep "database_name" wrangler.catalogworker.toml | head -1', { encoding: 'utf-8' });
    const match = wranglerConfig.match(/database_name\s*=\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error reading catalog wrangler config:', error.message);
    return null;
  }
}

function getPricingDatabaseName() {
  try {
    const wranglerConfig = execSync('grep "database_name" wrangler.pricingworker.toml | head -1', { encoding: 'utf-8' });
    const match = wranglerConfig.match(/database_name\s*=\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error reading pricing wrangler config:', error.message);
    return null;
  }
}

function getFulfillmentDatabaseName() {
  try {
    const wranglerConfig = execSync('grep "database_name" wrangler.fulfillmentworker.toml | head -1', { encoding: 'utf-8' });
    const match = wranglerConfig.match(/database_name\s*=\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error reading fulfillment wrangler config:', error.message);
    return null;
  }
}

async function softDeleteProduct(productId, catalogDb, pricingDb, fulfillmentDb) {
  const now = new Date().toISOString();
  const tmpDir = os.tmpdir();
  
  try {
    // 1. Soft delete from catalog (has deleted_at column)
    const catalogSQL = `UPDATE products SET deleted_at = '${now}', updated_at = '${now}' WHERE product_id = '${productId}';\n`;
    const catalogSqlFile = path.join(tmpDir, `delete_catalog_${productId}_${Date.now()}.sql`);
    fs.writeFileSync(catalogSqlFile, catalogSQL);
    execSync(
      `wrangler d1 execute ${catalogDb} --file=${catalogSqlFile} --config wrangler.catalogworker.toml --remote`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    fs.unlinkSync(catalogSqlFile);
    
    // 2. Hard delete from pricing (no deleted_at column)
    const pricingSQL = `DELETE FROM prices WHERE product_id = '${productId}';\n`;
    const pricingSqlFile = path.join(tmpDir, `delete_pricing_${productId}_${Date.now()}.sql`);
    fs.writeFileSync(pricingSqlFile, pricingSQL);
    execSync(
      `wrangler d1 execute ${pricingDb} --file=${pricingSqlFile} --config wrangler.pricingworker.toml --remote`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    fs.unlinkSync(pricingSqlFile);
    
    // 3. Soft delete from inventory (has deleted_at column)
    const inventorySQL = `UPDATE inventory SET deleted_at = '${now}', updated_at = '${now}' WHERE product_id = '${productId}';\n`;
    const inventorySqlFile = path.join(tmpDir, `delete_inventory_${productId}_${Date.now()}.sql`);
    fs.writeFileSync(inventorySqlFile, inventorySQL);
    execSync(
      `wrangler d1 execute ${fulfillmentDb} --file=${inventorySqlFile} --config wrangler.fulfillmentworker.toml --remote`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    fs.unlinkSync(inventorySqlFile);
    
    return true;
  } catch (error) {
    console.error(`Error deleting product ${productId}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🗑️  Removing duplicate products...\n');

  const catalogDb = getCatalogDatabaseName();
  const pricingDb = getPricingDatabaseName();
  const fulfillmentDb = getFulfillmentDatabaseName();

  if (!catalogDb || !pricingDb || !fulfillmentDb) {
    console.error('❌ Could not find database names');
    process.exit(1);
  }

  console.log(`📊 Deleting ${DUPLICATE_PRODUCT_IDS.length} duplicate products...\n`);

  let deleted = 0;
  let failed = 0;

  for (const productId of DUPLICATE_PRODUCT_IDS) {
    console.log(`   Deleting: ${productId.substring(0, 8)}...`);
    const success = await softDeleteProduct(productId, catalogDb, pricingDb, fulfillmentDb);
    if (success) {
      console.log(`   ✅ Deleted`);
      deleted++;
    } else {
      console.log(`   ❌ Failed to delete`);
      failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✨ Duplicate removal completed!\n');
  console.log(`   ✅ Deleted: ${deleted} products`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed} products`);
  }
}

main().catch(console.error);

