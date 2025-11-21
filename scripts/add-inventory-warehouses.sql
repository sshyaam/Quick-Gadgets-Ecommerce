-- Add inventory entries for existing products in Chennai and Bangalore warehouses
-- This script adds:
-- - 2 products to Chennai warehouse (WH-CHN-001)
-- - 1 product to Bangalore warehouse (WH-BLR-001)

-- First, get product IDs from catalog database (you'll need to run this separately)
-- SELECT product_id FROM products WHERE deleted_at IS NULL LIMIT 5;

-- Replace PRODUCT_ID_1, PRODUCT_ID_2, PRODUCT_ID_3 with actual product IDs from the query above

-- Add 2 products to Chennai warehouse (WH-CHN-001)
-- Product 1 in Chennai
INSERT INTO inventory (inventory_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at)
SELECT 
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))) as inventory_id,
  product_id,
  'WH-CHN-001' as warehouse_id,
  75 as quantity,
  0 as reserved_quantity,
  datetime('now') as created_at,
  datetime('now') as updated_at
FROM products
WHERE deleted_at IS NULL
LIMIT 1
ON CONFLICT(product_id, warehouse_id) DO NOTHING;

-- Product 2 in Chennai (get next product)
INSERT INTO inventory (inventory_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at)
SELECT 
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))) as inventory_id,
  product_id,
  'WH-CHN-001' as warehouse_id,
  100 as quantity,
  0 as reserved_quantity,
  datetime('now') as created_at,
  datetime('now') as updated_at
FROM products
WHERE deleted_at IS NULL
  AND product_id NOT IN (SELECT product_id FROM inventory WHERE warehouse_id = 'WH-CHN-001')
LIMIT 1
ON CONFLICT(product_id, warehouse_id) DO NOTHING;

-- Add 1 product to Bangalore warehouse (WH-BLR-001)
INSERT INTO inventory (inventory_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at)
SELECT 
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))) as inventory_id,
  product_id,
  'WH-BLR-001' as warehouse_id,
  90 as quantity,
  0 as reserved_quantity,
  datetime('now') as created_at,
  datetime('now') as updated_at
FROM products
WHERE deleted_at IS NULL
  AND product_id NOT IN (
    SELECT product_id FROM inventory WHERE warehouse_id = 'WH-CHN-001'
    UNION
    SELECT product_id FROM inventory WHERE warehouse_id = 'WH-BLR-001'
  )
LIMIT 1
ON CONFLICT(product_id, warehouse_id) DO NOTHING;

