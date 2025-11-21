-- Payment Worker Database Schema

-- Payments table (encrypted payment IDs)
CREATE TABLE IF NOT EXISTS payments (
  payment_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  encrypted_payment_id TEXT NOT NULL, -- Encrypted PayPal payment ID
  payment_data TEXT NOT NULL, -- JSONB blob of payment data
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

