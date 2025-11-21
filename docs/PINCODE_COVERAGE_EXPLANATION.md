# Pincode Coverage System Explanation

## Overview
The `pincode_coverage` table is a mapping system that defines which warehouses can serve which pincodes and which shipping modes (standard/express) are available for each pincode-warehouse combination.

## How It Works

### Database Structure
```sql
CREATE TABLE pincode_coverage (
  coverage_id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  pincode TEXT NOT NULL,
  standard_available INTEGER DEFAULT 1,  -- 1 = available, 0 = not available
  express_available INTEGER DEFAULT 1,   -- 1 = available, 0 = not available
  created_at TEXT,
  updated_at TEXT
);
```

### Purpose
1. **Service Area Definition**: Maps which pincodes each warehouse can serve
2. **Shipping Mode Availability**: Controls whether standard or express shipping is available for specific pincodes
3. **Flexible Configuration**: Allows disabling express shipping for remote areas while keeping standard shipping

### Query Flow

#### Step 1: Find Warehouses Serving the Pincode
```javascript
// Query: Get all warehouses that serve this pincode
SELECT DISTINCT w.warehouse_id, w.name, w.pincode, w.city, w.state, w.address,
       pc.standard_available, pc.express_available
FROM warehouses w
INNER JOIN pincode_coverage pc ON w.warehouse_id = pc.warehouse_id
WHERE pc.pincode = ? AND w.is_active = 1
```

This query:
- Finds all warehouses that have a `pincode_coverage` record for the customer's pincode
- Returns which shipping modes are available (standard_available, express_available)
- Only includes active warehouses

#### Step 2: Find Closest Warehouse with Stock
The system then:
1. Checks each warehouse from Step 1 to see if it has stock for the product
2. If no warehouse with stock is found in the exact pincode match:
   - Searches warehouses in the same state
   - Then searches all warehouses
   - Always prioritizes warehouses with available stock

#### Step 3: Calculate Zone and Pricing
Once a warehouse is selected:
- Calculates the zone (1/2/3) based on warehouse pincode vs customer pincode
- Applies zone-based pricing from `shipping_rules` table
- Uses `pincode_coverage` to determine if shipping modes are available

## Database Calls

### Current Implementation
**Yes, the system makes DB calls on every shipping request:**
1. Query `pincode_coverage` to find warehouses serving the pincode
2. Query `inventory` to check stock availability in each warehouse
3. Query `pincode_coverage` again to check shipping mode availability
4. Query `shipping_rules` to get pricing rules

### Performance Considerations
- **Caching**: Currently no caching is implemented. Each page load/request makes fresh DB calls.
- **Optimization Opportunities**:
  - Cache `pincode_coverage` data (changes infrequently)
  - Cache warehouse stock levels (with TTL based on update frequency)
  - Use Cloudflare KV for frequently accessed pincode mappings

### When DB Calls Happen
- **Catalog Page**: When user enters pincode and views products → 1 DB call per product for shipping options
- **Product Page**: When user enters pincode → 1 DB call for shipping options
- **Checkout**: When calculating final shipping cost → 1 DB call

## Closest Warehouse Selection Logic

### Algorithm
1. **Exact Pincode Match with Stock** (Priority 1)
   - Check warehouses from `pincode_coverage` that serve the exact pincode
   - For each warehouse, check if it has stock for the product
   - Return the first warehouse with stock

2. **Same State with Stock** (Priority 2)
   - If no exact match with stock, find warehouses in the same state
   - Check stock availability in each
   - Return the first warehouse with stock

3. **Any Warehouse with Stock** (Priority 3)
   - If no same-state warehouse with stock, search all warehouses
   - Sort by zone (prefer Zone 1, then Zone 2, then Zone 3)
   - Return the closest warehouse (by zone) with stock

4. **Fallback: Any Warehouse** (Priority 4)
   - If no warehouse has stock, return any warehouse for display purposes
   - Still calculates shipping costs (for when stock arrives)

### Zone Calculation
```javascript
function calculateZone(warehousePincode, customerPincode) {
  // Zone 1: Same postal region (first 3 digits match)
  if (warehousePincode.substring(0, 3) === customerPincode.substring(0, 3)) {
    return 1; // 0-50km, cheapest
  }
  
  // Zone 2: Same state (first digit often indicates state)
  if (warehousePincode.substring(0, 1) === customerPincode.substring(0, 1)) {
    return 2; // 50-500km, base price
  }
  
  // Zone 3: Different state
  return 3; // 500km+, premium price
}
```

## Example Flow

### Scenario: Customer in Pincode 600001, Product XYZ

1. **Query pincode_coverage**:
   ```sql
   SELECT * FROM pincode_coverage WHERE pincode = '600001'
   ```
   Result: Warehouse WH-CHN-001 (Chennai) serves this pincode

2. **Check Stock**:
   ```sql
   SELECT * FROM inventory 
   WHERE product_id = 'XYZ' AND warehouse_id = 'WH-CHN-001'
   ```
   Result: 50 units available

3. **Calculate Zone**:
   - Warehouse pincode: 600001
   - Customer pincode: 600001
   - Zone: 1 (same postal region)

4. **Get Shipping Rules**:
   ```sql
   SELECT * FROM shipping_rules 
   WHERE warehouse_id = 'WH-CHN-001' AND category = 'smartphones'
   ```
   Result: Zone 1 multiplier = 0.92 (8% discount)

5. **Calculate Cost**:
   - Base cost: ₹40
   - Zone 1 multiplier: 0.92
   - Final: ₹36.80

## Benefits

1. **Flexible Service Areas**: Can easily add/remove pincodes for each warehouse
2. **Selective Shipping Modes**: Can disable express shipping for remote areas
3. **Stock-Aware Routing**: Always tries to ship from closest warehouse with stock
4. **Zone-Based Pricing**: Automatically adjusts pricing based on distance

## Future Improvements

1. **Caching Layer**: Cache pincode_coverage in Cloudflare KV (updates infrequently)
2. **Batch Queries**: Query stock for multiple products at once
3. **Predictive Routing**: Pre-select warehouse based on historical data
4. **Real-time Stock Updates**: Use WebSockets or Durable Objects for live stock

