-- Cart Worker Database Schema

-- Carts table (items with locked price and stock)
CREATE TABLE IF NOT EXISTS carts (
  cart_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  items TEXT NOT NULL, -- JSONB array of cart items with locked price and stock
  total_price REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON carts(user_id);

