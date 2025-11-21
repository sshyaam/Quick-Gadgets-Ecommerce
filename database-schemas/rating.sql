-- Rating Worker Database Schema

-- Ratings table (one rating per completed order per product)
CREATE TABLE IF NOT EXISTS ratings (
  rating_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(order_id, product_id) -- Ensure one rating per order per product
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ratings_product_id ON ratings(product_id);
CREATE INDEX IF NOT EXISTS idx_ratings_order_id ON ratings(order_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON ratings(user_id);

