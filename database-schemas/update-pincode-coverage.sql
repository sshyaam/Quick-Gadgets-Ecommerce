-- Update Pincode Coverage to Disable Express Shipping for Some Pincodes
-- This tests the business logic where express shipping is not available

-- Mumbai warehouse - Disable express for some remote pincodes
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
-- Standard only (no express) - Remote Maharashtra pincodes
('COV-MUM-431001', 'WH-MUM-001', '431001', 1, 0, datetime('now'), datetime('now')),
('COV-MUM-431002', 'WH-MUM-001', '431002', 1, 0, datetime('now'), datetime('now')),
('COV-MUM-431003', 'WH-MUM-001', '431003', 1, 0, datetime('now'), datetime('now')),
-- Express only (no standard) - Premium locations
('COV-MUM-400099', 'WH-MUM-001', '400099', 0, 1, datetime('now'), datetime('now'));

-- Delhi warehouse - Disable express for some pincodes
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
-- Standard only
('COV-DEL-110099', 'WH-DEL-001', '110099', 1, 0, datetime('now'), datetime('now')),
('COV-DEL-201399', 'WH-DEL-001', '201399', 1, 0, datetime('now'), datetime('now'));

-- Bangalore warehouse - Disable express for some pincodes
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
-- Standard only
('COV-BLR-560099', 'WH-BLR-001', '560099', 1, 0, datetime('now'), datetime('now')),
('COV-BLR-560200', 'WH-BLR-001', '560200', 1, 0, datetime('now'), datetime('now'));

-- Chennai warehouse - Disable express for some pincodes
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
-- Standard only
('COV-CHN-600099', 'WH-CHN-001', '600099', 1, 0, datetime('now'), datetime('now'));

-- Kolkata warehouse - Disable express for some pincodes
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
-- Standard only
('COV-KOL-700099', 'WH-KOL-001', '700099', 1, 0, datetime('now'), datetime('now'));

-- Hyderabad warehouse - Disable express for some pincodes
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
-- Standard only
('COV-HYD-500099', 'WH-HYD-001', '500099', 1, 0, datetime('now'), datetime('now'));

-- Pune warehouse - Disable express for some pincodes
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
-- Standard only
('COV-PUN-411099', 'WH-PUN-001', '411099', 1, 0, datetime('now'), datetime('now'));

-- Ahmedabad warehouse - Disable express for some pincodes
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
-- Standard only
('COV-AHM-380099', 'WH-AHM-001', '380099', 1, 0, datetime('now'), datetime('now'));

-- ============================================================================
-- TEST PINCODES FOR EXPRESS DISABLED
-- ============================================================================
-- Use these pincodes to test express shipping being unavailable:
-- 431001, 431002, 431003 (Mumbai warehouse - standard only)
-- 110099, 201399 (Delhi warehouse - standard only)
-- 560099, 560200 (Bangalore warehouse - standard only)
-- 600099 (Chennai warehouse - standard only)
-- 700099 (Kolkata warehouse - standard only)
-- 500099 (Hyderabad warehouse - standard only)
-- 411099 (Pune warehouse - standard only)
-- 380099 (Ahmedabad warehouse - standard only)

