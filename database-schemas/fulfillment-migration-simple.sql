-- Simple migration: Drop and recreate tables
-- WARNING: This will delete all existing data!
-- Only use if you don't have important data in the fulfillment database

-- Drop existing tables (in reverse dependency order)
DROP TABLE IF EXISTS pincode_coverage;
DROP TABLE IF EXISTS shipping_rules;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS warehouses;

-- Now run the main fulfillment.sql schema
-- This file should be executed, then run fulfillment.sql

