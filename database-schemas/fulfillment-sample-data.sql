-- Sample Warehouse Data for India
-- Insert warehouses first

INSERT INTO warehouses (warehouse_id, name, pincode, city, state, address, is_active, created_at, updated_at) VALUES
('WH-MUM-001', 'Mumbai Central Warehouse', '400001', 'Mumbai', 'Maharashtra', 'Plot No. 45, Industrial Area, Andheri East, Mumbai', 1, datetime('now'), datetime('now')),
('WH-DEL-001', 'Delhi NCR Warehouse', '110001', 'New Delhi', 'Delhi', 'Sector 18, Noida, Uttar Pradesh', 1, datetime('now'), datetime('now')),
('WH-BLR-001', 'Bangalore Warehouse', '560001', 'Bangalore', 'Karnataka', 'Whitefield Industrial Area, Bangalore', 1, datetime('now'), datetime('now')),
('WH-CHN-001', 'Chennai Warehouse', '600001', 'Chennai', 'Tamil Nadu', 'Ambattur Industrial Estate, Chennai', 1, datetime('now'), datetime('now')),
('WH-KOL-001', 'Kolkata Warehouse', '700001', 'Kolkata', 'West Bengal', 'Salt Lake City, Sector V, Kolkata', 1, datetime('now'), datetime('now')),
('WH-HYD-001', 'Hyderabad Warehouse', '500001', 'Hyderabad', 'Telangana', 'HITEC City, Hyderabad', 1, datetime('now'), datetime('now')),
('WH-PUN-001', 'Pune Warehouse', '411001', 'Pune', 'Maharashtra', 'Hinjewadi IT Park, Pune', 1, datetime('now'), datetime('now')),
('WH-AHM-001', 'Ahmedabad Warehouse', '380001', 'Ahmedabad', 'Gujarat', 'Vastrapur, Ahmedabad', 1, datetime('now'), datetime('now'));

-- Sample Shipping Rules (India-specific, INR currency)
-- Standard shipping: 3-7 days, Express: 1-3 days
-- Costs in INR

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-MUM-SMARTPHONES', 'WH-MUM-001', 'smartphones', '{"standard":{"available":true,"baseCost":50,"costPerUnit":0,"estimatedDays":5,"minCost":50,"maxCost":200},"express":{"available":true,"baseCost":150,"costPerUnit":0,"estimatedDays":2,"minCost":150,"maxCost":400}}', datetime('now'), datetime('now')),
('RULE-MUM-LAPTOPS', 'WH-MUM-001', 'laptops', '{"standard":{"available":true,"baseCost":100,"costPerUnit":0,"estimatedDays":6,"minCost":100,"maxCost":300},"express":{"available":true,"baseCost":250,"costPerUnit":0,"estimatedDays":2,"minCost":250,"maxCost":600}}', datetime('now'), datetime('now')),
('RULE-MUM-TABLETS', 'WH-MUM-001', 'tablets', '{"standard":{"available":true,"baseCost":75,"costPerUnit":0,"estimatedDays":5,"minCost":75,"maxCost":250},"express":{"available":true,"baseCost":200,"costPerUnit":0,"estimatedDays":2,"minCost":200,"maxCost":500}}', datetime('now'), datetime('now')),
('RULE-MUM-ACCESSORIES', 'WH-MUM-001', 'accessories', '{"standard":{"available":true,"baseCost":40,"costPerUnit":0,"estimatedDays":4,"minCost":40,"maxCost":150},"express":{"available":true,"baseCost":120,"costPerUnit":0,"estimatedDays":1,"minCost":120,"maxCost":300}}', datetime('now'), datetime('now'));

-- Repeat similar rules for other warehouses (simplified - in production, customize per warehouse)
-- For now, using same rules for all warehouses

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-DEL-SMARTPHONES', 'WH-DEL-001', 'smartphones', '{"standard":{"available":true,"baseCost":50,"costPerUnit":0,"estimatedDays":5,"minCost":50,"maxCost":200},"express":{"available":true,"baseCost":150,"costPerUnit":0,"estimatedDays":2,"minCost":150,"maxCost":400}}', datetime('now'), datetime('now')),
('RULE-DEL-LAPTOPS', 'WH-DEL-001', 'laptops', '{"standard":{"available":true,"baseCost":100,"costPerUnit":0,"estimatedDays":6,"minCost":100,"maxCost":300},"express":{"available":true,"baseCost":250,"costPerUnit":0,"estimatedDays":2,"minCost":250,"maxCost":600}}', datetime('now'), datetime('now')),
('RULE-DEL-TABLETS', 'WH-DEL-001', 'tablets', '{"standard":{"available":true,"baseCost":75,"costPerUnit":0,"estimatedDays":5,"minCost":75,"maxCost":250},"express":{"available":true,"baseCost":200,"costPerUnit":0,"estimatedDays":2,"minCost":200,"maxCost":500}}', datetime('now'), datetime('now')),
('RULE-DEL-ACCESSORIES', 'WH-DEL-001', 'accessories', '{"standard":{"available":true,"baseCost":40,"costPerUnit":0,"estimatedDays":4,"minCost":40,"maxCost":150},"express":{"available":true,"baseCost":120,"costPerUnit":0,"estimatedDays":1,"minCost":120,"maxCost":300}}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-BLR-SMARTPHONES', 'WH-BLR-001', 'smartphones', '{"standard":{"available":true,"baseCost":50,"costPerUnit":0,"estimatedDays":5,"minCost":50,"maxCost":200},"express":{"available":true,"baseCost":150,"costPerUnit":0,"estimatedDays":2,"minCost":150,"maxCost":400}}', datetime('now'), datetime('now')),
('RULE-BLR-LAPTOPS', 'WH-BLR-001', 'laptops', '{"standard":{"available":true,"baseCost":100,"costPerUnit":0,"estimatedDays":6,"minCost":100,"maxCost":300},"express":{"available":true,"baseCost":250,"costPerUnit":0,"estimatedDays":2,"minCost":250,"maxCost":600}}', datetime('now'), datetime('now')),
('RULE-BLR-TABLETS', 'WH-BLR-001', 'tablets', '{"standard":{"available":true,"baseCost":75,"costPerUnit":0,"estimatedDays":5,"minCost":75,"maxCost":250},"express":{"available":true,"baseCost":200,"costPerUnit":0,"estimatedDays":2,"minCost":200,"maxCost":500}}', datetime('now'), datetime('now')),
('RULE-BLR-ACCESSORIES', 'WH-BLR-001', 'accessories', '{"standard":{"available":true,"baseCost":40,"costPerUnit":0,"estimatedDays":4,"minCost":40,"maxCost":150},"express":{"available":true,"baseCost":120,"costPerUnit":0,"estimatedDays":1,"minCost":120,"maxCost":300}}', datetime('now'), datetime('now'));

-- Sample Pincode Coverage
-- Each warehouse serves pincodes within their state and nearby states
-- For simplicity, showing sample coverage (in production, use comprehensive pincode mapping)

-- Mumbai warehouse serves Maharashtra pincodes (sample)
INSERT INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
('COV-MUM-400001', 'WH-MUM-001', '400001', 1, 1, datetime('now'), datetime('now')),
('COV-MUM-400002', 'WH-MUM-001', '400002', 1, 1, datetime('now'), datetime('now')),
('COV-MUM-411001', 'WH-MUM-001', '411001', 1, 1, datetime('now'), datetime('now'));

-- Delhi warehouse serves Delhi NCR pincodes
INSERT INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
('COV-DEL-110001', 'WH-DEL-001', '110001', 1, 1, datetime('now'), datetime('now')),
('COV-DEL-110002', 'WH-DEL-001', '110002', 1, 1, datetime('now'), datetime('now')),
('COV-DEL-201301', 'WH-DEL-001', '201301', 1, 1, datetime('now'), datetime('now'));

-- Bangalore warehouse serves Karnataka pincodes
INSERT INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
('COV-BLR-560001', 'WH-BLR-001', '560001', 1, 1, datetime('now'), datetime('now')),
('COV-BLR-560002', 'WH-BLR-001', '560002', 1, 1, datetime('now'), datetime('now')),
('COV-BLR-560100', 'WH-BLR-001', '560100', 1, 1, datetime('now'), datetime('now'));

