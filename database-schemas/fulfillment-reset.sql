-- Reset fulfillment database to new warehouse-based schema
-- WARNING: This will delete all existing data in these tables!
-- Only use if you don't have important data or want to start fresh

-- Drop existing tables (in reverse dependency order)
DROP TABLE IF EXISTS pincode_coverage;
DROP TABLE IF EXISTS shipping_rules;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS warehouses;

-- Now the tables are dropped, you can run fulfillment.sql to create them fresh

