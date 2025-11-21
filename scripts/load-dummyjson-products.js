#!/usr/bin/env node

/**
 * Script to fetch products from DummyJSON API and load them into the database
 * This script fetches 30 products from https://dummyjson.com/products
 * and inserts them into:
 * - products table (catalog-db)
 * - prices table (pricing-db)
 * - inventory table (fulfillment-db)
 */

import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const API_URL = 'https://dummyjson.com/products';
const REMOTE_FLAG = process.argv.includes('--remote') ? '--remote' : '';

// Default warehouse ID (first warehouse)
// In production, you might distribute across multiple warehouses
const DEFAULT_WAREHOUSE_ID = 'WH-MUM-001';

/**
 * Map DummyJSON product data to our product schema
 */
function mapProductData(dummyProduct) {
  const now = new Date().toISOString();
  
  // Extract images - take first image as primary, all images as array
  const images = dummyProduct.images || [];
  const primaryImage = images[0] || null;
  
  // Build product data object (JSONB)
  const productData = {
    name: dummyProduct.title || 'Untitled Product',
    description: dummyProduct.description || '',
    category: dummyProduct.category || 'uncategorized',
    brand: dummyProduct.brand || '',
    thumbnail: dummyProduct.thumbnail || null,
    images: images,
    productImage: primaryImage, // Primary image for display
    rating: dummyProduct.rating || 0,
    reviews: dummyProduct.reviews || 0,
    discountPercentage: dummyProduct.discountPercentage || 0,
    tags: dummyProduct.tags || [],
    stock: dummyProduct.stock || 0,
    // Additional fields from DummyJSON
    sku: dummyProduct.sku || null,
    dimensions: dummyProduct.dimensions || null,
    warrantyInformation: dummyProduct.warrantyInformation || null,
    shippingInformation: dummyProduct.shippingInformation || null,
    availabilityStatus: dummyProduct.availabilityStatus || 'in stock',
    returnPolicy: dummyProduct.returnPolicy || null,
    minimumOrderQuantity: dummyProduct.minimumOrderQuantity || 1
  };
  
  return {
    productId: randomUUID(),
    productData,
    price: dummyProduct.price || 0,
    stock: dummyProduct.stock || 0,
    now
  };
}

/**
 * Generate SQL insert statements for products
 */
function generateProductSQL(mappedProducts) {
  let sql = '-- Products from DummyJSON API\n';
  sql += '-- Generated at: ' + new Date().toISOString() + '\n\n';
  
  mappedProducts.forEach(({ productId, productData, now }) => {
    const dataJson = JSON.stringify(productData).replace(/'/g, "''");
    sql += `INSERT INTO products (product_id, data, created_at, updated_at) VALUES (\n`;
    sql += `  '${productId}',\n`;
    sql += `  '${dataJson}',\n`;
    sql += `  '${now}',\n`;
    sql += `  '${now}'\n`;
    sql += `);\n\n`;
  });
  
  return sql;
}

/**
 * Generate SQL insert statements for prices
 */
function generatePriceSQL(mappedProducts) {
  let sql = '-- Prices from DummyJSON API\n';
  sql += '-- Generated at: ' + new Date().toISOString() + '\n\n';
  
  mappedProducts.forEach(({ productId, price, now }) => {
    sql += `INSERT INTO prices (product_id, price, currency, created_at, updated_at) VALUES (\n`;
    sql += `  '${productId}',\n`;
    sql += `  ${price},\n`;
    sql += `  'INR',\n`;
    sql += `  '${now}',\n`;
    sql += `  '${now}'\n`;
    sql += `);\n\n`;
  });
  
  return sql;
}

/**
 * Generate SQL insert statements for inventory
 */
function generateInventorySQL(mappedProducts) {
  let sql = '-- Inventory from DummyJSON API\n';
  sql += '-- Generated at: ' + new Date().toISOString() + '\n\n';
  
  mappedProducts.forEach(({ productId, stock, now }) => {
    const inventoryId = randomUUID();
    sql += `INSERT INTO inventory (inventory_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at) VALUES (\n`;
    sql += `  '${inventoryId}',\n`;
    sql += `  '${productId}',\n`;
    sql += `  '${DEFAULT_WAREHOUSE_ID}',\n`;
    sql += `  ${stock},\n`;
    sql += `  0,\n`;
    sql += `  '${now}',\n`;
    sql += `  '${now}'\n`;
    sql += `);\n\n`;
  });
  
  return sql;
}

// Removed executeSQL function - using direct execution instead

/**
 * Main function
 */
async function main() {
  console.log('📦 Fetching products from DummyJSON API...\n');
  
  try {
    // Fetch products from API
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const products = data.products || [];
    
    if (products.length === 0) {
      throw new Error('No products found in API response');
    }
    
    console.log(`✅ Fetched ${products.length} products from API\n`);
    
    // Map products to our schema
    console.log('🔄 Mapping products to database schema...');
    const mappedProducts = products.map(mapProductData);
    console.log(`✅ Mapped ${mappedProducts.length} products\n`);
    
    // Clear existing data
    console.log('🧹 Clearing existing data...\n');
    
    try {
      execSync(`wrangler d1 execute catalog-db --command="DELETE FROM products;" --config wrangler.catalogworker.toml ${REMOTE_FLAG}`, { stdio: 'ignore' });
      console.log('   ✅ Cleared products');
    } catch (e) {
      console.log('   ⚠️  Could not clear products (might not exist)');
    }
    
    try {
      execSync(`wrangler d1 execute pricing-db --command="DELETE FROM prices;" --config wrangler.pricingworker.toml ${REMOTE_FLAG}`, { stdio: 'ignore' });
      console.log('   ✅ Cleared prices');
    } catch (e) {
      console.log('   ⚠️  Could not clear prices (might not exist)');
    }
    
    try {
      execSync(`wrangler d1 execute fulfillment-db --command="DELETE FROM inventory;" --config wrangler.fulfillmentworker.toml ${REMOTE_FLAG}`, { stdio: 'ignore' });
      console.log('   ✅ Cleared inventory');
    } catch (e) {
      console.log('   ⚠️  Could not clear inventory (might not exist)');
    }
    
    console.log('');
    
    // Generate SQL
    console.log('📝 Generating SQL statements...');
    const productSQL = generateProductSQL(mappedProducts);
    const priceSQL = generatePriceSQL(mappedProducts);
    const inventorySQL = generateInventorySQL(mappedProducts);
    console.log('✅ SQL statements generated\n');
    
    const tmpDir = os.tmpdir();
    
    // Write SQL to temp files and execute
    console.log('💾 Loading products into Catalog DB...');
    const productSqlFile = path.join(tmpDir, `dummyjson_products_${Date.now()}.sql`);
    fs.writeFileSync(productSqlFile, productSQL);
    execSync(`wrangler d1 execute catalog-db --file=${productSqlFile} --config wrangler.catalogworker.toml ${REMOTE_FLAG}`, { stdio: 'inherit' });
    fs.unlinkSync(productSqlFile);
    console.log('✅ Products loaded!\n');
    
    console.log('💰 Loading prices into Pricing DB...');
    const priceSqlFile = path.join(tmpDir, `dummyjson_prices_${Date.now()}.sql`);
    fs.writeFileSync(priceSqlFile, priceSQL);
    execSync(`wrangler d1 execute pricing-db --file=${priceSqlFile} --config wrangler.pricingworker.toml ${REMOTE_FLAG}`, { stdio: 'inherit' });
    fs.unlinkSync(priceSqlFile);
    console.log('✅ Prices loaded!\n');
    
    console.log('📦 Loading inventory into Fulfillment DB...');
    const inventorySqlFile = path.join(tmpDir, `dummyjson_inventory_${Date.now()}.sql`);
    fs.writeFileSync(inventorySqlFile, inventorySQL);
    execSync(`wrangler d1 execute fulfillment-db --file=${inventorySqlFile} --config wrangler.fulfillmentworker.toml ${REMOTE_FLAG}`, { stdio: 'inherit' });
    fs.unlinkSync(inventorySqlFile);
    console.log('✅ Inventory loaded!\n');
    
    console.log('🎉 All products loaded successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   - Products: ${mappedProducts.length} items`);
    console.log(`   - Prices: ${mappedProducts.length} items`);
    console.log(`   - Inventory: ${mappedProducts.length} items (in warehouse ${DEFAULT_WAREHOUSE_ID})`);
    console.log('');
    
    if (REMOTE_FLAG) {
      console.log('🌐 Data loaded into REMOTE database');
    } else {
      console.log('💻 Data loaded into LOCAL database');
      console.log('   (Use --remote flag to load into production database)');
    }
    
  } catch (error) {
    console.error('❌ Error loading products:', error.message);
    process.exit(1);
  }
}

// Run main function
main();

