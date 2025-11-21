-- Catalog Worker Database Schema

-- Products table (product data in JSONB, excluding price and stock)
CREATE TABLE IF NOT EXISTS products (
  product_id TEXT PRIMARY KEY,
  data TEXT NOT NULL, -- JSONB with product attributes (name, description, category, ratings, dimensions, etc.)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_products_category ON products(JSON_EXTRACT(data, '$.category'));
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);

