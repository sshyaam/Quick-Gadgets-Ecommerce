#!/usr/bin/env node

/**
 * Script to remove duplicate products created by create-10-more-products.js
 * This script identifies duplicates by product name and keeps only the most recent one
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Product names from create-10-more-products.js
const PRODUCT_NAMES = [
  "Quantum Pro X1 Laptop",
  "Nexus Ultra 5G Smartphone",
  "PixelTab Pro 12.9",
  "ThunderBolt Wireless Earbuds Pro",
  "Velocity Gaming Mouse",
  "Aurora 4K Monitor 32\"",
  "Fusion X2 Smartwatch",
  "Nexus Ultra 5G Smartphone - 512GB",
  "Quantum Pro X1 Laptop - RTX 4080",
  "PixelTab Pro 12.9 - 1TB",
  "ThunderBolt Wireless Earbuds Pro - Limited Edition"
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

async function findDuplicates(productName, catalogDb) {
  try {
    const escapedName = productName.replace(/'/g, "''");
    const checkSQL = `SELECT product_id, created_at FROM products WHERE json_extract(data, '$.name') = '${escapedName}' AND deleted_at IS NULL ORDER BY created_at DESC;\n`;
    const tmpDir = os.tmpdir();
    const checkSqlFile = path.join(tmpDir, `check_${Date.now()}_${Math.random().toString(36).substring(7)}.sql`);
    fs.writeFileSync(checkSqlFile, checkSQL);
    
    const result = execSync(
      `wrangler d1 execute ${catalogDb} --file=${checkSqlFile} --config wrangler.catalogworker.toml --remote --json`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    fs.unlinkSync(checkSqlFile);
    
    // Parse JSON - wrangler outputs JSON array
    const lines = result.trim().split('\n');
    let jsonLine = lines.find(line => line.trim().startsWith('['));
    if (!jsonLine) {
      // Try parsing the whole result
      jsonLine = result.trim();
    }
    
    const data = JSON.parse(jsonLine);
    if (data[0]?.results && data[0].results.length > 1) {
      // Keep the first one (most recent), delete the rest
      return data[0].results.slice(1).map(r => r.product_id);
    }
    return [];
  } catch (error) {
    console.error(`Error checking duplicates for ${productName}:`, error.message);
    return [];
  }
}

async function softDeleteProduct(productId, catalogDb, pricingDb, fulfillmentDb) {
  const now = new Date().toISOString();
  const tmpDir = os.tmpdir();
  
  try {
    // 1. Soft delete from catalog
    const catalogSQL = `UPDATE products SET deleted_at = '${now}', updated_at = '${now}' WHERE product_id = '${productId}';\n`;
    const catalogSqlFile = path.join(tmpDir, `delete_catalog_${productId}_${Date.now()}.sql`);
    fs.writeFileSync(catalogSqlFile, catalogSQL);
    execSync(
      `wrangler d1 execute ${catalogDb} --file=${catalogSqlFile} --config wrangler.catalogworker.toml --remote`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    fs.unlinkSync(catalogSqlFile);
    
    // 2. Soft delete from pricing
    const pricingSQL = `UPDATE prices SET deleted_at = '${now}', updated_at = '${now}' WHERE product_id = '${productId}';\n`;
    const pricingSqlFile = path.join(tmpDir, `delete_pricing_${productId}_${Date.now()}.sql`);
    fs.writeFileSync(pricingSqlFile, pricingSQL);
    execSync(
      `wrangler d1 execute ${pricingDb} --file=${pricingSqlFile} --config wrangler.pricingworker.toml --remote`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    fs.unlinkSync(pricingSqlFile);
    
    // 3. Soft delete from inventory
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
  console.log('🔍 Finding and removing duplicate products...\n');

  const catalogDb = getCatalogDatabaseName();
  const pricingDb = getPricingDatabaseName();
  const fulfillmentDb = getFulfillmentDatabaseName();

  if (!catalogDb || !pricingDb || !fulfillmentDb) {
    console.error('❌ Could not find database names');
    process.exit(1);
  }

  console.log(`📊 Databases:`);
  console.log(`   Catalog: ${catalogDb}`);
  console.log(`   Pricing: ${pricingDb}`);
  console.log(`   Fulfillment: ${fulfillmentDb}\n`);

  let totalDuplicates = 0;
  const duplicatesToDelete = [];

  for (const productName of PRODUCT_NAMES) {
    console.log(`🔍 Checking: ${productName}`);
    const duplicates = await findDuplicates(productName, catalogDb);
    if (duplicates.length > 0) {
      console.log(`   ⚠️  Found ${duplicates.length} duplicate(s)`);
      duplicates.forEach(id => {
        console.log(`      - ${id.substring(0, 8)}...`);
        duplicatesToDelete.push({ productId: id, name: productName });
      });
      totalDuplicates += duplicates.length;
    } else {
      console.log(`   ✅ No duplicates`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (duplicatesToDelete.length === 0) {
    console.log('\n✨ No duplicates found!');
    return;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Found ${totalDuplicates} duplicate product(s) to remove\n`);

  console.log('🗑️  Removing duplicates...\n');
  let deleted = 0;
  let failed = 0;

  for (const { productId, name } of duplicatesToDelete) {
    console.log(`   Deleting: ${name.substring(0, 40)}... (${productId.substring(0, 8)}...)`);
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

