-- Pricing Worker Database Schema

-- Prices table
CREATE TABLE IF NOT EXISTS prices (
  product_id TEXT PRIMARY KEY,
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prices_updated_at ON prices(updated_at);

