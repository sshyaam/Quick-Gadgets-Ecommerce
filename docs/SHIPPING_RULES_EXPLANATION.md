# Shipping Rules Calculation Explanation

## Overview
The shipping cost and delivery time calculation uses a multi-layered approach with fallbacks to ensure shipping is always available, even when database tables are empty.

## Calculation Flow

### 1. **Pincode Lookup**
   - First, the system checks the `pincode_coverage` table for an exact pincode match
   - If found, it uses the warehouse(s) that serve that pincode
   - If not found, it falls back to `getNearestWarehouse()` which:
     - Tries to find a warehouse in the same state
     - If no state match, returns null (then uses default rules)

### 2. **Shipping Rules Lookup**
   The system looks for shipping rules in this order:
   
   a. **Warehouse + Category Rules** (`shipping_rules` table)
      - Looks for rules specific to the warehouse AND product category
      - Query: `WHERE warehouse_id = ? AND category = ?`
   
   b. **Category Rules** (fallback)
      - If no warehouse-specific rules, looks for category-wide rules
      - Query: `WHERE category = ? LIMIT 1`
   
   c. **Default Rules** (if no rules found)
      - Standard: ₹50, 5-7 days
      - Express: ₹150, 2-3 days

### 3. **Distance Factor Calculation**
   The system calculates a distance factor based on pincode regions:
   
   - **Factor 0**: Same postal region (first 3 digits match)
     - Delivery time: Base - 1 day
     - Cost: Base cost (no multiplier)
   
   - **Factor 1**: Same state, different region
     - Delivery time: Base days
     - Cost: Base cost (no multiplier)
   
   - **Factor 2**: Different state
     - Delivery time: Base + 2-3 days
     - Cost: Base cost (no multiplier, unless `distanceMultiplier` is specified)

### 4. **Cost Calculation**
   When rules are found in the database, cost is calculated as:
   ```
   cost = baseCost + (costPerUnit × quantity)
   
   If distanceMultiplier is specified:
   cost = cost × distanceMultiplier[distanceFactor]
   
   Apply constraints:
   if cost < minCost: cost = minCost
   if cost > maxCost: cost = maxCost
   ```

### 5. **Delivery Time Calculation**
   ```
   baseDays = rules.estimatedDays || (express ? 2 : 5)
   
   if distanceFactor === 0:
     days = max(1, baseDays - 1)
   else if distanceFactor === 1:
     days = baseDays
   else:
     days = baseDays + (express ? 2 : 3)
   ```

## Why Prices Are Always ₹50/₹150

**The system is likely using default rules because:**
1. The `shipping_rules` table is empty or doesn't have rules for your warehouses/categories
2. The `pincode_coverage` table might be empty, causing fallback to default warehouse
3. No warehouse-specific or category-specific rules exist

## Database Tables Required

### `shipping_rules` Table Structure
```sql
CREATE TABLE shipping_rules (
  rule_id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  category TEXT NOT NULL,
  rules TEXT NOT NULL, -- JSONB with structure below
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Rules JSON Structure
```json
{
  "standard": {
    "available": true,
    "baseCost": 30,
    "costPerUnit": 5,
    "estimatedDays": 5,
    "minCost": 30,
    "maxCost": 200,
    "distanceMultiplier": {
      "0": 0.9,  // Same region - 10% discount
      "1": 1.0,  // Same state - normal price
      "2": 1.2   // Different state - 20% premium
    }
  },
  "express": {
    "available": true,
    "baseCost": 100,
    "costPerUnit": 15,
    "estimatedDays": 2,
    "minCost": 100,
    "maxCost": 500,
    "distanceMultiplier": {
      "0": 0.95,
      "1": 1.0,
      "2": 1.3
    }
  }
}
```

### `pincode_coverage` Table Structure
```sql
CREATE TABLE pincode_coverage (
  coverage_id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL,
  pincode TEXT NOT NULL,
  standard_available BOOLEAN NOT NULL DEFAULT 1,
  express_available BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## How to Add Custom Shipping Rules

1. **Insert warehouse-specific rules:**
```sql
INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at)
VALUES (
  'rule-123',
  'warehouse-1',
  'smartphones',
  '{"standard": {"available": true, "baseCost": 40, "costPerUnit": 8, "estimatedDays": 4, "minCost": 40, "maxCost": 300}, "express": {"available": true, "baseCost": 120, "costPerUnit": 20, "estimatedDays": 1, "minCost": 120, "maxCost": 600}}',
  datetime('now'),
  datetime('now')
);
```

2. **Add pincode coverage:**
```sql
INSERT INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at)
VALUES (
  'coverage-123',
  'warehouse-1',
  '400001',
  1,
  1,
  datetime('now'),
  datetime('now')
);
```

## Current Behavior

Since the database tables are likely empty, the system:
- Always returns default costs (₹50 standard, ₹150 express)
- Always shows both shipping options as available
- Uses distance-based delivery time calculation (which does vary)
- Falls back gracefully to ensure shipping is always possible

To get dynamic pricing, you need to populate the `shipping_rules` and `pincode_coverage` tables with your actual business rules.

