-- Orders Worker Database Schema

-- Orders table (user, address, product data in JSONB)
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_data TEXT NOT NULL, -- JSONB with user data
  address_data TEXT NOT NULL, -- JSONB with shipping address
  product_data TEXT NOT NULL, -- JSONB with product items and shipping info
  shipping_data TEXT NOT NULL, -- JSONB with shipping mode, cost, estimated delivery
  total_amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing', -- processing, shipped, completed, cancelled, failed
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

