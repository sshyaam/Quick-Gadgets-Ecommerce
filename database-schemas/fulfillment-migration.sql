-- Migration script for fulfillment database
-- This migrates from old schema to new warehouse-based schema

-- Step 1: Create warehouses table first (if not exists)
CREATE TABLE IF NOT EXISTS warehouses (
  warehouse_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pincode TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  address TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Step 2: Create pincode_coverage table
CREATE TABLE IF NOT EXISTS pincode_coverage (
  coverage_id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  pincode TEXT NOT NULL,
  standard_available BOOLEAN NOT NULL DEFAULT 1,
  express_available BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Step 3: Migrate inventory table
-- First, check if old inventory table exists and migrate data
-- Create new inventory table structure
CREATE TABLE IF NOT EXISTS inventory_new (
  inventory_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Migrate existing data (if any) to new structure
-- Assign all existing inventory to first warehouse (will be created in sample data)
INSERT INTO inventory_new (inventory_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at, deleted_at)
SELECT 
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))) as inventory_id,
  product_id,
  'WH-MUM-001' as warehouse_id,  -- Default to Mumbai warehouse
  quantity,
  reserved_quantity,
  created_at,
  updated_at,
  deleted_at
FROM inventory
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_new WHERE inventory_new.product_id = inventory.product_id
);

-- Drop old inventory table
DROP TABLE IF EXISTS inventory;

-- Rename new table to inventory
ALTER TABLE inventory_new RENAME TO inventory;

-- Step 4: Update shipping_rules table structure (if exists, add warehouse_id)
-- First create new structure
CREATE TABLE IF NOT EXISTS shipping_rules_new (
  rule_id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  category TEXT NOT NULL,
  rules TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Migrate existing shipping rules (assign to default warehouse)
INSERT INTO shipping_rules_new (rule_id, warehouse_id, category, rules, created_at, updated_at)
SELECT 
  rule_id,
  'WH-MUM-001' as warehouse_id,
  category,
  rules,
  created_at,
  updated_at
FROM shipping_rules
WHERE NOT EXISTS (
  SELECT 1 FROM shipping_rules_new WHERE shipping_rules_new.rule_id = shipping_rules.rule_id
);

-- Drop old shipping_rules table
DROP TABLE IF EXISTS shipping_rules;

-- Rename new table
ALTER TABLE shipping_rules_new RENAME TO shipping_rules;

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shipping_rules_warehouse ON shipping_rules(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shipping_rules_category ON shipping_rules(category);
CREATE INDEX IF NOT EXISTS idx_pincode_coverage_pincode ON pincode_coverage(pincode);
CREATE INDEX IF NOT EXISTS idx_pincode_coverage_warehouse ON pincode_coverage(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_state ON warehouses(state);
CREATE INDEX IF NOT EXISTS idx_warehouses_city ON warehouses(city);

