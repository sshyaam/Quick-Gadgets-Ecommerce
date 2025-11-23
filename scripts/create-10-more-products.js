/**
 * Script to create 10 more electronic products with stock in various warehouses
 * 
 * Usage:
 *   node scripts/create-10-more-products.js
 * 
 * This script:
 * - Creates 10 new electronic products (smartphones, laptops, tablets, accessories)
 * - Adds them to catalog database
 * - Sets prices in pricing database
 * - Distributes stock across multiple warehouses (Mumbai, Chennai, Bangalore, Delhi, etc.)
 */

import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Warehouse IDs for stock distribution
const WAREHOUSES = [
  'WH-MUM-001', // Mumbai
  'WH-CHN-001', // Chennai
  'WH-BLR-001', // Bangalore
  'WH-DEL-001', // Delhi
  'WH-KOL-001', // Kolkata
  'WH-HYD-001', // Hyderabad
  'WH-PUN-001', // Pune
  'WH-AHM-001', // Ahmedabad
];

// Product data - 10 new electronic products
const products = [
  {
    name: "Quantum Pro X1 Laptop",
    description: "High-performance gaming laptop with RTX 4070, Intel i9-13900H, 32GB RAM, 1TB SSD, 17.3-inch 4K display, RGB keyboard, and advanced cooling system.",
    category: "laptops",
    price: 129999,
    stock: { warehouse: 'WH-MUM-001', quantity: 25 },
    data: {
      name: "Quantum Pro X1 Laptop",
      description: "High-performance gaming laptop with RTX 4070, Intel i9-13900H, 32GB RAM, 1TB SSD, 17.3-inch 4K display, RGB keyboard, and advanced cooling system.",
      category: "laptops",
      brand: "Quantum",
      model: "Pro X1",
      sku: "QNT-PRO-X1-32-1TB",
      processor: {
        chipset: "Intel Core i9-13900H",
        cores: "14 cores (6P + 8E)",
        baseClock: "2.6GHz",
        boostClock: "5.4GHz",
        cache: "24MB L3"
      },
      graphics: {
        gpu: "NVIDIA RTX 4070",
        vram: "8GB GDDR6",
        tdp: "140W"
      },
      memory: {
        ram: "32GB DDR5-5600",
        storage: "1TB NVMe PCIe 4.0 SSD",
        expandable: true
      },
      display: {
        size: "17.3 inches",
        resolution: "3840x2160 (4K)",
        refreshRate: "144Hz",
        type: "IPS",
        colorGamut: "100% sRGB"
      },
      battery: {
        capacity: "99Wh",
        estimatedLife: "6-8 hours"
      },
      ports: ["USB-C (Thunderbolt 4)", "USB-A 3.2", "HDMI 2.1", "Ethernet", "3.5mm Audio"],
      weight: "2.8kg",
      dimensions: "395 x 260 x 25mm",
      warranty: "2 years",
      color: "Metallic Black"
    }
  },
  {
    name: "Nexus Ultra 5G Smartphone",
    description: "Flagship 5G smartphone with 6.8-inch AMOLED display, Snapdragon 8 Gen 3, 256GB storage, 108MP triple camera, 5000mAh battery with 120W fast charging.",
    category: "smartphones",
    price: 89999,
    stock: { warehouse: 'WH-CHN-001', quantity: 40 },
    data: {
      name: "Nexus Ultra 5G Smartphone",
      description: "Flagship 5G smartphone with 6.8-inch AMOLED display, Snapdragon 8 Gen 3, 256GB storage, 108MP triple camera, 5000mAh battery with 120W fast charging.",
      category: "smartphones",
      brand: "Nexus",
      model: "Ultra 5G",
      sku: "NXS-ULT-5G-256-BLK",
      display: {
        size: "6.8 inches",
        type: "AMOLED",
        resolution: "3200x1440",
        refreshRate: "120Hz",
        brightness: "1800 nits peak"
      },
      processor: {
        chipset: "Snapdragon 8 Gen 3",
        cpu: "Octa-core",
        gpu: "Adreno 750"
      },
      memory: {
        ram: "12GB LPDDR5X",
        storage: "256GB UFS 4.0"
      },
      camera: {
        rear: {
          primary: "108MP f/1.7",
          ultrawide: "50MP f/2.2",
          telephoto: "50MP f/2.4 (3x optical zoom)"
        },
        front: "32MP f/2.0"
      },
      battery: {
        capacity: "5000mAh",
        fastCharging: "120W",
        wirelessCharging: "50W"
      },
      connectivity: ["5G", "Wi-Fi 7", "Bluetooth 5.4", "NFC"],
      os: "Android 14",
      color: "Midnight Black",
      warranty: "1 year"
    }
  },
  {
    name: "PixelTab Pro 12.9",
    description: "Professional tablet with 12.9-inch Liquid Retina display, M3 chip, 512GB storage, Apple Pencil support, Magic Keyboard compatible, perfect for creative professionals.",
    category: "tablets",
    price: 109999,
    stock: { warehouse: 'WH-BLR-001', quantity: 30 },
    data: {
      name: "PixelTab Pro 12.9",
      description: "Professional tablet with 12.9-inch Liquid Retina display, M3 chip, 512GB storage, Apple Pencil support, Magic Keyboard compatible, perfect for creative professionals.",
      category: "tablets",
      brand: "PixelTab",
      model: "Pro 12.9",
      sku: "PXT-PRO-12.9-512",
      display: {
        size: "12.9 inches",
        type: "Liquid Retina XDR",
        resolution: "2732x2048",
        refreshRate: "120Hz ProMotion",
        brightness: "1600 nits peak"
      },
      processor: {
        chipset: "M3",
        cores: "8-core CPU, 10-core GPU",
        neuralEngine: "16-core"
      },
      memory: {
        ram: "16GB",
        storage: "512GB"
      },
      camera: {
        rear: "12MP Wide + 10MP Ultra Wide",
        front: "12MP TrueDepth",
        lidar: true
      },
      connectivity: ["Wi-Fi 6E", "5G (optional)", "USB-C (Thunderbolt 4)"],
      accessories: ["Apple Pencil (2nd gen)", "Magic Keyboard"],
      battery: {
        capacity: "40.88 Wh",
        estimatedLife: "10 hours"
      },
      color: "Space Gray",
      warranty: "1 year"
    }
  },
  {
    name: "ThunderBolt Wireless Earbuds Pro",
    description: "Premium true wireless earbuds with active noise cancellation, 30-hour battery life, IPX7 water resistance, spatial audio, and premium sound quality.",
    category: "accessories",
    price: 12999,
    stock: { warehouse: 'WH-DEL-001', quantity: 100 },
    data: {
      name: "ThunderBolt Wireless Earbuds Pro",
      description: "Premium true wireless earbuds with active noise cancellation, 30-hour battery life, IPX7 water resistance, spatial audio, and premium sound quality.",
      category: "accessories",
      brand: "ThunderBolt",
      model: "Earbuds Pro",
      sku: "TBT-EBP-WHT",
      type: "True Wireless Earbuds",
      features: {
        noiseCancellation: "Active (ANC)",
        transparencyMode: true,
        spatialAudio: true,
        adaptiveEQ: true
      },
      audio: {
        drivers: "11mm dynamic drivers",
        frequency: "20Hz - 20kHz",
        codecs: ["AAC", "SBC", "LDAC"]
      },
      battery: {
        earbuds: "8 hours",
        case: "22 hours",
        total: "30 hours",
        fastCharge: "5 min = 1 hour"
      },
      connectivity: {
        bluetooth: "5.3",
        range: "10 meters"
      },
      waterResistance: "IPX7",
      color: "White",
      warranty: "1 year"
    }
  },
  {
    name: "Velocity Gaming Mouse",
    description: "High-precision gaming mouse with 26,000 DPI sensor, RGB lighting, 8 programmable buttons, wireless/wired dual mode, and ultra-lightweight design.",
    category: "accessories",
    price: 4999,
    stock: { warehouse: 'WH-KOL-001', quantity: 150 },
    data: {
      name: "Velocity Gaming Mouse",
      description: "High-precision gaming mouse with 26,000 DPI sensor, RGB lighting, 8 programmable buttons, wireless/wired dual mode, and ultra-lightweight design.",
      category: "accessories",
      brand: "Velocity",
      model: "Gaming Mouse Pro",
      sku: "VLT-GM-PRO-BLK",
      type: "Gaming Mouse",
      sensor: {
        type: "Optical",
        dpi: "26,000",
        pollingRate: "1000Hz",
        acceleration: "50G"
      },
      buttons: {
        total: 8,
        programmable: true,
        switches: "Omron 50M clicks"
      },
      connectivity: {
        wireless: "2.4GHz",
        wired: "USB-C",
        battery: "80 hours"
      },
      lighting: {
        rgb: true,
        zones: 3,
        software: "Custom RGB software"
      },
      weight: "68g",
      dimensions: "125 x 66 x 38mm",
      color: "Black",
      warranty: "2 years"
    }
  },
  {
    name: "Aurora 4K Monitor 32\"",
    description: "32-inch 4K UHD gaming monitor with 144Hz refresh rate, HDR600, 1ms response time, FreeSync Premium Pro, USB-C connectivity, and adjustable stand.",
    category: "accessories",
    price: 44999,
    stock: { warehouse: 'WH-HYD-001', quantity: 20 },
    data: {
      name: "Aurora 4K Monitor 32\"",
      description: "32-inch 4K UHD gaming monitor with 144Hz refresh rate, HDR600, 1ms response time, FreeSync Premium Pro, USB-C connectivity, and adjustable stand.",
      category: "accessories",
      brand: "Aurora",
      model: "4K Gaming 32",
      sku: "AUR-4K-32-GAM",
      type: "Gaming Monitor",
      display: {
        size: "32 inches",
        resolution: "3840x2160 (4K UHD)",
        refreshRate: "144Hz",
        responseTime: "1ms (GTG)",
        panel: "IPS",
        brightness: "600 nits (HDR600)",
        contrast: "1000:1"
      },
      features: {
        hdr: "HDR600",
        adaptiveSync: "FreeSync Premium Pro",
        colorGamut: "95% DCI-P3",
        colorDepth: "10-bit"
      },
      connectivity: {
        hdmi: "2x HDMI 2.1",
        displayPort: "1x DP 1.4",
        usbC: "1x USB-C (90W PD)",
        usb: "4x USB 3.0"
      },
      ergonomics: {
        tilt: "-5° to 20°",
        swivel: "±30°",
        height: "150mm",
        pivot: "90°"
      },
      warranty: "3 years",
      color: "Black"
    }
  },
  {
    name: "Fusion X2 Smartwatch",
    description: "Premium smartwatch with 1.9-inch AMOLED display, health tracking (ECG, SpO2, heart rate), GPS, 5ATM water resistance, 7-day battery life, and premium build.",
    category: "accessories",
    price: 24999,
    stock: { warehouse: 'WH-PUN-001', quantity: 60 },
    data: {
      name: "Fusion X2 Smartwatch",
      description: "Premium smartwatch with 1.9-inch AMOLED display, health tracking (ECG, SpO2, heart rate), GPS, 5ATM water resistance, 7-day battery life, and premium build.",
      category: "accessories",
      brand: "Fusion",
      model: "X2 Smartwatch",
      sku: "FSN-X2-SWT-BLK",
      type: "Smartwatch",
      display: {
        size: "1.9 inches",
        type: "AMOLED",
        resolution: "454x454",
        alwaysOn: true
      },
      health: {
        sensors: ["ECG", "SpO2", "Heart Rate", "Sleep Tracking", "Stress Monitor"],
        gps: true,
        altimeter: true
      },
      battery: {
        capacity: "450mAh",
        life: "7 days (normal use)",
        charging: "Wireless"
      },
      connectivity: {
        bluetooth: "5.2",
        nfc: true,
        gps: "Dual-band"
      },
      waterResistance: "5ATM (50m)",
      materials: {
        case: "Titanium",
        strap: "Silicone (interchangeable)"
      },
      os: "Custom OS",
      color: "Black",
      warranty: "2 years"
    }
  },
  {
    name: "Nexus Ultra 5G Smartphone - 512GB",
    description: "Flagship 5G smartphone with 6.8-inch AMOLED display, Snapdragon 8 Gen 3, 512GB storage, 108MP triple camera, 5000mAh battery with 120W fast charging. Premium variant.",
    category: "smartphones",
    price: 109999,
    stock: { warehouse: 'WH-MUM-001', quantity: 35 },
    data: {
      name: "Nexus Ultra 5G Smartphone - 512GB",
      description: "Flagship 5G smartphone with 6.8-inch AMOLED display, Snapdragon 8 Gen 3, 512GB storage, 108MP triple camera, 5000mAh battery with 120W fast charging. Premium variant.",
      category: "smartphones",
      brand: "Nexus",
      model: "Ultra 5G 512GB",
      sku: "NXS-ULT-5G-512-BLK",
      display: {
        size: "6.8 inches",
        type: "AMOLED",
        resolution: "3200x1440",
        refreshRate: "120Hz",
        brightness: "1800 nits peak"
      },
      processor: {
        chipset: "Snapdragon 8 Gen 3",
        cpu: "Octa-core",
        gpu: "Adreno 750"
      },
      memory: {
        ram: "16GB LPDDR5X",
        storage: "512GB UFS 4.0"
      },
      camera: {
        rear: {
          primary: "108MP f/1.7",
          ultrawide: "50MP f/2.2",
          telephoto: "50MP f/2.4 (3x optical zoom)"
        },
        front: "32MP f/2.0"
      },
      battery: {
        capacity: "5000mAh",
        fastCharging: "120W",
        wirelessCharging: "50W"
      },
      connectivity: ["5G", "Wi-Fi 7", "Bluetooth 5.4", "NFC"],
      os: "Android 14",
      color: "Midnight Black",
      warranty: "1 year"
    }
  },
  {
    name: "Quantum Pro X1 Laptop - RTX 4080",
    description: "Ultra-high-performance gaming laptop with RTX 4080, Intel i9-13900HX, 64GB RAM, 2TB SSD, 17.3-inch 4K display, RGB keyboard, and advanced cooling system. Ultimate gaming machine.",
    category: "laptops",
    price: 199999,
    stock: { warehouse: 'WH-CHN-001', quantity: 15 },
    data: {
      name: "Quantum Pro X1 Laptop - RTX 4080",
      description: "Ultra-high-performance gaming laptop with RTX 4080, Intel i9-13900HX, 64GB RAM, 2TB SSD, 17.3-inch 4K display, RGB keyboard, and advanced cooling system. Ultimate gaming machine.",
      category: "laptops",
      brand: "Quantum",
      model: "Pro X1 RTX 4080",
      sku: "QNT-PRO-X1-4080-64-2TB",
      processor: {
        chipset: "Intel Core i9-13900HX",
        cores: "24 cores (8P + 16E)",
        baseClock: "2.2GHz",
        boostClock: "5.6GHz",
        cache: "36MB L3"
      },
      graphics: {
        gpu: "NVIDIA RTX 4080",
        vram: "12GB GDDR6",
        tdp: "175W"
      },
      memory: {
        ram: "64GB DDR5-5600",
        storage: "2TB NVMe PCIe 4.0 SSD",
        expandable: true
      },
      display: {
        size: "17.3 inches",
        resolution: "3840x2160 (4K)",
        refreshRate: "165Hz",
        type: "IPS",
        colorGamut: "100% Adobe RGB"
      },
      battery: {
        capacity: "99Wh",
        estimatedLife: "5-7 hours"
      },
      ports: ["USB-C (Thunderbolt 4)", "USB-A 3.2", "HDMI 2.1", "Ethernet", "3.5mm Audio"],
      weight: "3.1kg",
      dimensions: "395 x 260 x 28mm",
      warranty: "2 years",
      color: "Metallic Black"
    }
  },
  {
    name: "PixelTab Pro 12.9 - 1TB",
    description: "Professional tablet with 12.9-inch Liquid Retina display, M3 chip, 1TB storage, Apple Pencil support, Magic Keyboard compatible, perfect for creative professionals. Maximum storage variant.",
    category: "tablets",
    price: 149999,
    stock: { warehouse: 'WH-BLR-001', quantity: 20 },
    data: {
      name: "PixelTab Pro 12.9 - 1TB",
      description: "Professional tablet with 12.9-inch Liquid Retina display, M3 chip, 1TB storage, Apple Pencil support, Magic Keyboard compatible, perfect for creative professionals. Maximum storage variant.",
      category: "tablets",
      brand: "PixelTab",
      model: "Pro 12.9 1TB",
      sku: "PXT-PRO-12.9-1TB",
      display: {
        size: "12.9 inches",
        type: "Liquid Retina XDR",
        resolution: "2732x2048",
        refreshRate: "120Hz ProMotion",
        brightness: "1600 nits peak"
      },
      processor: {
        chipset: "M3",
        cores: "8-core CPU, 10-core GPU",
        neuralEngine: "16-core"
      },
      memory: {
        ram: "16GB",
        storage: "1TB"
      },
      camera: {
        rear: "12MP Wide + 10MP Ultra Wide",
        front: "12MP TrueDepth",
        lidar: true
      },
      connectivity: ["Wi-Fi 6E", "5G (optional)", "USB-C (Thunderbolt 4)"],
      accessories: ["Apple Pencil (2nd gen)", "Magic Keyboard"],
      battery: {
        capacity: "40.88 Wh",
        estimatedLife: "10 hours"
      },
      color: "Space Gray",
      warranty: "1 year"
    }
  },
  {
    name: "ThunderBolt Wireless Earbuds Pro - Limited Edition",
    description: "Premium limited edition true wireless earbuds with active noise cancellation, 30-hour battery life, IPX7 water resistance, spatial audio, premium sound quality, and exclusive color.",
    category: "accessories",
    price: 15999,
    stock: { warehouse: 'WH-AHM-001', quantity: 80 },
    data: {
      name: "ThunderBolt Wireless Earbuds Pro - Limited Edition",
      description: "Premium limited edition true wireless earbuds with active noise cancellation, 30-hour battery life, IPX7 water resistance, spatial audio, premium sound quality, and exclusive color.",
      category: "accessories",
      brand: "ThunderBolt",
      model: "Earbuds Pro LE",
      sku: "TBT-EBP-LE-GLD",
      type: "True Wireless Earbuds",
      edition: "Limited Edition",
      features: {
        noiseCancellation: "Active (ANC)",
        transparencyMode: true,
        spatialAudio: true,
        adaptiveEQ: true
      },
      audio: {
        drivers: "11mm dynamic drivers",
        frequency: "20Hz - 20kHz",
        codecs: ["AAC", "SBC", "LDAC"]
      },
      battery: {
        earbuds: "8 hours",
        case: "22 hours",
        total: "30 hours",
        fastCharge: "5 min = 1 hour"
      },
      connectivity: {
        bluetooth: "5.3",
        range: "10 meters"
      },
      waterResistance: "IPX7",
      color: "Gold",
      warranty: "1 year",
      limitedEdition: true
    }
  }
];

// Get database names from wrangler configs
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

async function checkProductExists(productName, catalogDb) {
  try {
    // Escape single quotes in product name for SQL
    const escapedName = productName.replace(/'/g, "''");
    const checkSQL = `SELECT product_id FROM products WHERE json_extract(data, '$.name') = '${escapedName}' AND deleted_at IS NULL LIMIT 1;\n`;
    const tmpDir = os.tmpdir();
    const checkSqlFile = path.join(tmpDir, `check_${Date.now()}_${Math.random().toString(36).substring(7)}.sql`);
    fs.writeFileSync(checkSqlFile, checkSQL);
    
    const result = execSync(
      `wrangler d1 execute ${catalogDb} --file=${checkSqlFile} --config wrangler.catalogworker.toml --remote --json`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    fs.unlinkSync(checkSqlFile);
    
    const data = JSON.parse(result);
    if (data[0]?.results && data[0].results.length > 0) {
      return data[0].results[0].product_id;
    }
    return null;
  } catch (error) {
    // If check fails, assume product doesn't exist
    return null;
  }
}

async function createProduct(product, catalogDb, pricingDb, fulfillmentDb) {
  const now = new Date().toISOString();
  const dataJson = JSON.stringify(product.data).replace(/'/g, "''");

  console.log(`\n📦 Creating product: ${product.name}`);
  
  // Check if product already exists
  const existingProductId = await checkProductExists(product.name, catalogDb);
  if (existingProductId) {
    console.log(`   ⚠️  Product already exists with ID: ${existingProductId.substring(0, 8)}...`);
    console.log(`   ⏭️  Skipping to avoid duplicates`);
    return { productId: existingProductId, success: true, skipped: true };
  }

  const productId = randomUUID();
  console.log(`   Product ID: ${productId.substring(0, 8)}...`);

  try {
    const tmpDir = os.tmpdir();
    
    // 1. Insert into catalog database (using file to avoid shell escaping issues)
    const catalogSQL = `INSERT INTO products (product_id, data, created_at, updated_at) VALUES ('${productId}', '${dataJson}', '${now}', '${now}');\n`;
    const catalogSqlFile = path.join(tmpDir, `catalog_${productId}_${Date.now()}.sql`);
    fs.writeFileSync(catalogSqlFile, catalogSQL);
    
    execSync(
      `wrangler d1 execute ${catalogDb} --file=${catalogSqlFile} --config wrangler.catalogworker.toml --remote`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    fs.unlinkSync(catalogSqlFile);
    console.log(`   ✅ Added to catalog`);

    // 2. Insert into pricing database
    const pricingSQL = `INSERT INTO prices (product_id, price, currency, created_at, updated_at) VALUES ('${productId}', ${product.price}, 'INR', '${now}', '${now}');\n`;
    const pricingSqlFile = path.join(tmpDir, `pricing_${productId}_${Date.now()}.sql`);
    fs.writeFileSync(pricingSqlFile, pricingSQL);
    
    execSync(
      `wrangler d1 execute ${pricingDb} --file=${pricingSqlFile} --config wrangler.pricingworker.toml --remote`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    fs.unlinkSync(pricingSqlFile);
    console.log(`   ✅ Added price: ₹${product.price.toLocaleString('en-IN')}`);

    // 3. Insert into inventory (fulfillment database)
    const inventoryId = randomUUID();
    const inventorySQL = `INSERT INTO inventory (inventory_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at) VALUES ('${inventoryId}', '${productId}', '${product.stock.warehouse}', ${product.stock.quantity}, 0, '${now}', '${now}');\n`;
    const inventorySqlFile = path.join(tmpDir, `inventory_${productId}_${Date.now()}.sql`);
    fs.writeFileSync(inventorySqlFile, inventorySQL);
    
    execSync(
      `wrangler d1 execute ${fulfillmentDb} --file=${inventorySqlFile} --config wrangler.fulfillmentworker.toml --remote`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    fs.unlinkSync(inventorySqlFile);
    console.log(`   ✅ Added stock: ${product.stock.quantity} units in ${product.stock.warehouse}`);

    return { productId, success: true };
  } catch (error) {
    console.error(`   ❌ Error creating product:`, error.message);
    return { productId, success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Creating 10 new products with stock distribution...\n');

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

  const results = [];
  
  for (const product of products) {
    const result = await createProduct(product, catalogDb, pricingDb, fulfillmentDb);
    results.push(result);
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✨ Product creation completed!\n');
  console.log('📊 Summary:');
  
  const successful = results.filter(r => r.success && !r.skipped).length;
  const skipped = results.filter(r => r.success && r.skipped).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`   ✅ Successfully created: ${successful} products`);
  if (skipped > 0) {
    console.log(`   ⏭️  Skipped (already exist): ${skipped} products`);
  }
  console.log(`   ❌ Failed: ${failed} products\n`);

  // Show stock distribution
  console.log('📦 Stock Distribution:');
  const stockByWarehouse = {};
  products.forEach((p, idx) => {
    if (results[idx].success) {
      const wh = p.stock.warehouse;
      stockByWarehouse[wh] = (stockByWarehouse[wh] || 0) + 1;
    }
  });
  
  Object.entries(stockByWarehouse).forEach(([warehouse, count]) => {
    console.log(`   ${warehouse}: ${count} product(s)`);
  });

  if (failed > 0) {
    console.log('\n⚠️  Some products failed to create. Check errors above.');
    process.exit(1);
  }
}

main().catch(console.error);

