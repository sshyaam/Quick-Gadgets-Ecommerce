-- Fulfillment Worker Database Schema
-- Note: If you have existing data, use fulfillment-migration.sql instead

-- Warehouses table (create first, as other tables reference it)
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

-- Inventory table (per warehouse)
CREATE TABLE IF NOT EXISTS inventory (
  inventory_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Shipping rules table (warehouse-based, India-specific)
CREATE TABLE IF NOT EXISTS shipping_rules (
  rule_id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  category TEXT NOT NULL,
  rules TEXT NOT NULL, -- JSONB with shipping rules (standard, express, cost calculations, pincode coverage, etc.)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Pincode coverage table (which warehouses serve which pincodes)
CREATE TABLE IF NOT EXISTS pincode_coverage (
  coverage_id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  pincode TEXT NOT NULL,
  standard_available BOOLEAN NOT NULL DEFAULT 1,
  express_available BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shipping_rules_warehouse ON shipping_rules(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shipping_rules_category ON shipping_rules(category);
CREATE INDEX IF NOT EXISTS idx_pincode_coverage_pincode ON pincode_coverage(pincode);
CREATE INDEX IF NOT EXISTS idx_pincode_coverage_warehouse ON pincode_coverage(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_state ON warehouses(state);
CREATE INDEX IF NOT EXISTS idx_warehouses_city ON warehouses(city);

