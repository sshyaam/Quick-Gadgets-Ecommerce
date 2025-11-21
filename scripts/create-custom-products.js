#!/usr/bin/env node

/**
 * Script to create custom electronic products with multiple images
 * This script allows you to easily add custom products with detailed information
 * and multiple product images
 */

import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const REMOTE_FLAG = process.argv.includes('--remote') ? '--remote' : '';
const DEFAULT_WAREHOUSE_ID = 'WH-MUM-001';

// Custom electronic products with multiple images
// You can add more products to this array
const CUSTOM_PRODUCTS = [
	{
		name: "UltraBook Pro 16",
		description: "High-performance 16-inch laptop with Intel Core i9 processor, 32GB RAM, 1TB SSD, RTX 4080 graphics, and 4K OLED display. Perfect for professionals and content creators.",
		category: "laptops",
		brand: "TechVision",
		price: 189999,
		stock: 45,
		rating: 4.9,
		reviews: 234,
		discountPercentage: 8,
		images: [
			"https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&h=600",
			"https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=800&h=600",
			"https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=600",
			"https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=800&h=600"
		],
		tags: ["laptop", "gaming", "professional", "rtx", "oled"],
		sku: "TV-UBP16-I9-32-1TB",
		specs: {
			processor: "Intel Core i9-13900HX",
			ram: "32GB DDR5",
			storage: "1TB NVMe SSD",
			graphics: "NVIDIA RTX 4080",
			display: "16-inch 4K OLED (3840x2400)",
			screenSize: "16 inches",
			resolution: "3840x2400",
			refreshRate: "120Hz"
		}
	},
	{
		name: "SmartPhone X Pro",
		description: "Flagship smartphone with 6.8-inch AMOLED display, Snapdragon 8 Gen 3, 512GB storage, 200MP camera system, and 5000mAh battery with 120W fast charging.",
		category: "smartphones",
		brand: "MobileTech",
		price: 89999,
		stock: 120,
		rating: 4.8,
		reviews: 567,
		discountPercentage: 12,
		images: [
			"https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&h=600",
			"https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=600",
			"https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800&h=600",
			"https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=800&h=600",
			"https://images.unsplash.com/photo-1601972602237-8c79241e468b?w=800&h=600"
		],
		tags: ["smartphone", "5g", "camera", "flagship", "amoled"],
		sku: "MT-SXP-512-BLK",
		specs: {
			chipset: "Snapdragon 8 Gen 3",
			ram: "16GB",
			storage: "512GB UFS 4.0",
			display: "6.8-inch AMOLED",
			screenSize: "6.8 inches",
			resolution: "3200x1440",
			refreshRate: "120Hz",
			camera: "200MP Main + 50MP Ultra-wide + 12MP Telephoto",
			battery: "5000mAh",
			charging: "120W Fast Charging"
		}
	},
	{
		name: "Gaming Monitor Ultra 32",
		description: "32-inch 4K gaming monitor with 144Hz refresh rate, 1ms response time, HDR1000, and G-Sync compatibility. Perfect for gaming and professional work.",
		category: "monitors",
		brand: "DisplayPro",
		price: 54999,
		stock: 78,
		rating: 4.7,
		reviews: 189,
		discountPercentage: 15,
		images: [
			"https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&h=600",
			"https://images.unsplash.com/photo-1587314168485-3236d6710814?w=800&h=600",
			"https://images.unsplash.com/photo-1555617981-dac3880eac6e?w=800&h=600",
			"https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=800&h=600"
		],
		tags: ["monitor", "gaming", "4k", "hdr", "gsync"],
		sku: "DP-GMU32-4K-144",
		specs: {
			screenSize: "32 inches",
			resolution: "3840x2160 (4K UHD)",
			refreshRate: "144Hz",
			responseTime: "1ms",
			panelType: "IPS",
			hdr: "HDR1000",
			connectivity: "DisplayPort 1.4, HDMI 2.1, USB-C",
			gsync: true,
			freesync: true
		}
	},
	{
		name: "Wireless Earbuds Elite",
		description: "Premium true wireless earbuds with active noise cancellation, 40-hour battery life, wireless charging, and exceptional sound quality with spatial audio.",
		category: "audio",
		brand: "SoundMax",
		price: 24999,
		stock: 200,
		rating: 4.6,
		reviews: 892,
		discountPercentage: 10,
		images: [
			"https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=800&h=600",
			"https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&h=600",
			"https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=800&h=600",
			"https://images.unsplash.com/photo-1599669454699-248893623440?w=800&h=600"
		],
		tags: ["earbuds", "wireless", "anc", "audio", "bluetooth"],
		sku: "SM-WEB-ELITE-BLK",
		specs: {
			type: "True Wireless",
			noiseCancellation: "Active Noise Cancellation",
			batteryLife: "40 hours (with case)",
			charging: "Wireless + USB-C",
			bluetooth: "Bluetooth 5.3",
			waterResistance: "IPX7",
			drivers: "12mm Dynamic Drivers",
			spatialAudio: true
		}
	},
	{
		name: "Mechanical Keyboard Pro",
		description: "RGB mechanical keyboard with Cherry MX switches, full RGB backlighting, programmable keys, and premium aluminum frame. Perfect for gaming and typing.",
		category: "accessories",
		brand: "KeyTech",
		price: 12999,
		stock: 150,
		rating: 4.5,
		reviews: 445,
		discountPercentage: 18,
		images: [
			"https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&h=600",
			"https://images.unsplash.com/photo-1601445638532-3c6f6c3aa1d6?w=800&h=600",
			"https://images.unsplash.com/photo-1541140532154-b024d705b90a?w=800&h=600",
			"https://images.unsplash.com/photo-1618384887929-16ec33cab9ef?w=800&h=600"
		],
		tags: ["keyboard", "mechanical", "rgb", "gaming", "wireless"],
		sku: "KT-MKP-CMX-RGB",
		specs: {
			switchType: "Cherry MX Red",
			layout: "Full Size (104 keys)",
			backlighting: "Full RGB Per-Key",
			connectivity: "USB-C, Bluetooth 5.0",
			material: "Aluminum Frame",
			programmable: true,
			macroKeys: "12 Programmable Macro Keys"
		}
	},
	{
		name: "Smart Watch Ultra",
		description: "Advanced smartwatch with health monitoring, GPS, LTE connectivity, 7-day battery life, and premium titanium build. Tracks fitness, sleep, and more.",
		category: "wearables",
		brand: "WatchTech",
		price: 49999,
		stock: 95,
		rating: 4.7,
		reviews: 321,
		discountPercentage: 5,
		images: [
			"https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&h=600",
			"https://images.unsplash.com/photo-1551816230-ef5deaed4a26?w=800&h=600",
			"https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&h=600",
			"https://images.unsplash.com/photo-1434056886845-dac89ffe9b56?w=800&h=600",
			"https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&h=600"
		],
		tags: ["smartwatch", "fitness", "health", "gps", "lte"],
		sku: "WT-SWU-TITANIUM",
		specs: {
			display: "1.9-inch AMOLED",
			caseMaterial: "Titanium",
			batteryLife: "7 days",
			connectivity: "LTE, Wi-Fi, Bluetooth 5.0",
			healthFeatures: "ECG, Blood Oxygen, Heart Rate Monitor",
			waterResistance: "100m (10ATM)",
			gps: "Dual-frequency GPS",
			sensors: "Accelerometer, Gyroscope, Barometer, Compass"
		}
	}
];

/**
 * Map custom product to database schema
 */
function mapProductData(product) {
	const now = new Date().toISOString();
	
	// Extract images - first image is primary
	const images = product.images || [];
	const primaryImage = images[0] || null;
	
	// Build comprehensive product data object (JSONB)
	const productData = {
		name: product.name,
		description: product.description,
		category: product.category,
		brand: product.brand,
		sku: product.sku || null,
		thumbnail: primaryImage,
		images: images,
		productImage: primaryImage, // Primary image for display
		rating: product.rating || 0,
		reviews: product.reviews || 0,
		discountPercentage: product.discountPercentage || 0,
		tags: product.tags || [],
		stock: product.stock || 0,
		// Include specs if provided
		...(product.specs && { specs: product.specs }),
		// Additional metadata
		availabilityStatus: product.stock > 0 ? 'in stock' : 'out of stock',
		minimumOrderQuantity: 1,
		warranty: "1 year manufacturer warranty",
		returnPolicy: "30-day return policy"
	};
	
	return {
		productId: randomUUID(),
		productData,
		price: product.price || 0,
		stock: product.stock || 0,
		now
	};
}

/**
 * Generate SQL insert statements
 */
function generateSQL(mappedProducts, type) {
	let sql = `-- Custom ${type} from create-custom-products.js\n`;
	sql += `-- Generated at: ${new Date().toISOString()}\n\n`;
	
	mappedProducts.forEach(({ productId, productData, price, stock, now }, index) => {
		if (type === 'products') {
			const dataJson = JSON.stringify(productData).replace(/'/g, "''");
			sql += `INSERT INTO products (product_id, data, created_at, updated_at) VALUES (\n`;
			sql += `  '${productId}',\n`;
			sql += `  '${dataJson}',\n`;
			sql += `  '${now}',\n`;
			sql += `  '${now}'\n`;
			sql += `);\n\n`;
		} else if (type === 'prices') {
			sql += `INSERT INTO prices (product_id, price, currency, created_at, updated_at) VALUES (\n`;
			sql += `  '${productId}',\n`;
			sql += `  ${price},\n`;
			sql += `  'INR',\n`;
			sql += `  '${now}',\n`;
			sql += `  '${now}'\n`;
			sql += `);\n\n`;
		} else if (type === 'inventory') {
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
		}
	});
	
	return sql;
}

/**
 * Main function
 */
async function main() {
	console.log('📦 Creating custom electronic products with multiple images...\n');
	
	try {
		// Map products
		const mappedProducts = CUSTOM_PRODUCTS.map((product, index) => {
			const mapped = mapProductData(product);
			console.log(`✅ Mapped: ${product.name} (${product.images.length} images)`);
			return mapped;
		});
		
		console.log(`\n✅ Total products: ${mappedProducts.length}\n`);
		
		// Generate SQL
		console.log('📝 Generating SQL statements...');
		const productSQL = generateSQL(mappedProducts, 'products');
		const priceSQL = generateSQL(mappedProducts, 'prices');
		const inventorySQL = generateSQL(mappedProducts, 'inventory');
		console.log('✅ SQL statements generated\n');
		
		const tmpDir = os.tmpdir();
		
		// Load products into Catalog DB
		console.log('💾 Loading products into Catalog DB...');
		const productSqlFile = path.join(tmpDir, `custom_products_${Date.now()}.sql`);
		fs.writeFileSync(productSqlFile, productSQL);
		execSync(`wrangler d1 execute catalog-db --file=${productSqlFile} --config wrangler.catalogworker.toml ${REMOTE_FLAG}`, { stdio: 'inherit' });
		fs.unlinkSync(productSqlFile);
		console.log('✅ Products loaded!\n');
		
		// Load prices into Pricing DB
		console.log('💰 Loading prices into Pricing DB...');
		const priceSqlFile = path.join(tmpDir, `custom_prices_${Date.now()}.sql`);
		fs.writeFileSync(priceSqlFile, priceSQL);
		execSync(`wrangler d1 execute pricing-db --file=${priceSqlFile} --config wrangler.pricingworker.toml ${REMOTE_FLAG}`, { stdio: 'inherit' });
		fs.unlinkSync(priceSqlFile);
		console.log('✅ Prices loaded!\n');
		
		// Load inventory into Fulfillment DB
		console.log('📦 Loading inventory into Fulfillment DB...');
		const inventorySqlFile = path.join(tmpDir, `custom_inventory_${Date.now()}.sql`);
		fs.writeFileSync(inventorySqlFile, inventorySQL);
		execSync(`wrangler d1 execute fulfillment-db --file=${inventorySqlFile} --config wrangler.fulfillmentworker.toml ${REMOTE_FLAG}`, { stdio: 'inherit' });
		fs.unlinkSync(inventorySqlFile);
		console.log('✅ Inventory loaded!\n');
		
		console.log('🎉 All custom products loaded successfully!');
		console.log('');
		console.log('📊 Summary:');
		console.log(`   - Products: ${mappedProducts.length} items`);
		console.log(`   - Total images: ${CUSTOM_PRODUCTS.reduce((sum, p) => sum + (p.images?.length || 0), 0)} images`);
		console.log(`   - Prices: ${mappedProducts.length} items`);
		console.log(`   - Inventory: ${mappedProducts.length} items (in warehouse ${DEFAULT_WAREHOUSE_ID})`);
		console.log('');
		
		if (REMOTE_FLAG) {
			console.log('🌐 Data loaded into REMOTE database');
		} else {
			console.log('💻 Data loaded into LOCAL database');
			console.log('   (Use --remote flag to load into production database)');
		}
		
		console.log('');
		console.log('💡 To add more products:');
		console.log('   1. Edit the CUSTOM_PRODUCTS array in this script');
		console.log('   2. Add your product objects with name, description, category, price, stock, images array, etc.');
		console.log('   3. Run this script again');
		
	} catch (error) {
		console.error('❌ Error creating products:', error.message);
		process.exit(1);
	}
}

// Run main function
main();

