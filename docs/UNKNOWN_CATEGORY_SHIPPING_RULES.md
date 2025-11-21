# Shipping Rules for Unknown/New Categories

## What Happens When You Add a Product with an Unknown Category?

When you add a product with a category that **doesn't exist** in the `shipping_rules` table, the system uses **default shipping rules** as a fallback. The product will still work, but it will use generic pricing instead of category-specific rules.

## Rule Lookup Flow

The system follows this **3-step lookup process**:

### Step 1: Warehouse-Specific Category Rules
```javascript
// Location: fulfillmentworker/models/shippingModel.js (line 419)
let rules = await getShippingRulesByWarehouseAndCategory(db, warehouse.warehouse_id, category);
```
- Looks for rules specific to **this warehouse AND this category**
- Query: `WHERE warehouse_id = ? AND category = ?`

### Step 2: Category-Wide Rules (Fallback)
```javascript
// Location: fulfillmentworker/models/shippingModel.js (line 422-424)
if (!rules) {
  rules = await getShippingRulesByCategory(db, category);
}
```
- If no warehouse-specific rules found, looks for **any rules for this category**
- Query: `WHERE category = ? LIMIT 1`
- Uses the first matching rule from any warehouse

### Step 3: Default Rules (Final Fallback)
```javascript
// Location: fulfillmentworker/models/shippingModel.js (lines 447-483)
if (!rules) {
  // Default rules with zone-based pricing
  const standardDays = calculateEstimatedDaysByZone(zone, 'standard', { estimatedDays: 5 });
  const expressDays = calculateEstimatedDaysByZone(zone, 'express', { estimatedDays: 2 });
  
  // Zone-based default pricing
  const zonePricing = {
    1: { standard: 40, express: 120 }, // Zone 1: Cheapest
    2: { standard: 50, express: 150 }, // Zone 2: Base price
    3: { standard: 70, express: 200 } // Zone 3: Premium
  };
  
  const pricing = zonePricing[zone] || zonePricing[2];
  
  return {
    standard: {
      available: standardAvailable, // From pincode coverage
      cost: pricing.standard,
      estimatedDays: standardDays,
      estimatedDaysRange: `${standardDays}-${standardDays + 2} days`
    },
    express: {
      available: expressAvailable, // From pincode coverage
      cost: pricing.express,
      estimatedDays: expressDays,
      estimatedDaysRange: `${expressDays}-${expressDays + 1} days`
    },
    // ... warehouse info
  };
}
```

## Default Shipping Rules Applied

When **no category rules are found**, the system uses these **zone-based default pricing**:

### Standard Shipping
- **Zone 1** (Same postal region): ₹40
- **Zone 2** (Same state): ₹50
- **Zone 3** (Different state): ₹70
- **Estimated Days**: 5-7 days (varies by zone)

### Express Shipping
- **Zone 1** (Same postal region): ₹120
- **Zone 2** (Same state): ₹150
- **Zone 3** (Different state): ₹200
- **Estimated Days**: 2-3 days (varies by zone)

## Important Notes

### 1. Pincode Coverage Still Applies
Even with default rules, **pincode coverage** still determines availability:
- If `pincode_coverage.express_available = 0` for a pincode, express shipping will be **unavailable** even with default rules
- If `pincode_coverage.standard_available = 0`, standard shipping will be **unavailable**

**Code Reference:** `fulfillmentworker/models/shippingModel.js` (lines 436-444)
```javascript
const standardAvailable = coverageResult 
  ? (coverageResult.standard_available === 1 || coverageResult.standard_available === true || ...)
  : true; // Default to available if no coverage record exists

const expressAvailable = coverageResult
  ? (coverageResult.express_available === 1 || coverageResult.express_available === true || ...)
  : true; // Default to available if no coverage record exists
```

### 2. No Category Validation
- **There is NO validation** that a category must exist in `shipping_rules`
- You can add products with **any category name** (e.g., "custom-category", "new-product-type")
- The system will automatically use default rules

### 3. Category Names Are Case-Sensitive
- Category matching is **case-sensitive**
- "Electronics" ≠ "electronics" ≠ "ELECTRONICS"
- Make sure category names match exactly when creating shipping rules

### 4. Alternative: `calculateShippingCost` Function
The `calculateShippingCost` function (used during checkout) has **slightly different default rules**:

**Location:** `fulfillmentworker/models/shippingModel.js` (lines 229-246)
```javascript
const defaultRules = {
  standard: {
    available: true,
    baseCost: 30,
    costPerUnit: 5,        // Additional cost per item
    estimatedDays: 5,
    minCost: 30,
    maxCost: 200
  },
  express: {
    available: true,
    baseCost: 100,
    costPerUnit: 15,       // Additional cost per item
    estimatedDays: 2,
    minCost: 100,
    maxCost: 500
  }
};
```

This function uses **quantity-based pricing** (base cost + cost per unit), while `getShippingOptionsForProduct` uses **fixed zone-based pricing**.

## How to Add Custom Rules for New Categories

If you want to add custom shipping rules for a new category:

### 1. Create Shipping Rules via Admin API
```sql
INSERT INTO shipping_rules (warehouse_id, category, rules, created_at, updated_at)
VALUES (
  'WH-MUM-001',  -- Warehouse ID
  'your-new-category',  -- Category name (must match product category exactly)
  '{
    "standard": {
      "available": true,
      "baseCost": 50,
      "costPerUnit": 10,
      "estimatedDays": 5,
      "minCost": 50,
      "maxCost": 300,
      "zoneMultiplier": {
        "1": 0.9,
        "2": 1.0,
        "3": 1.3
      }
    },
    "express": {
      "available": true,
      "baseCost": 150,
      "costPerUnit": 20,
      "estimatedDays": 2,
      "minCost": 150,
      "maxCost": 600,
      "zoneMultiplier": {
        "1": 0.95,
        "2": 1.0,
        "3": 1.4
      }
    }
  }',
  datetime('now'),
  datetime('now')
);
```

### 2. Or Use the Admin Endpoint
```bash
POST /admin/shipping-rules
{
  "warehouseId": "WH-MUM-001",
  "category": "your-new-category",
  "rules": {
    "standard": { ... },
    "express": { ... }
  }
}
```

## Summary

| Scenario | Result |
|----------|--------|
| Category exists in `shipping_rules` | Uses category-specific rules |
| Category doesn't exist | Uses **default zone-based pricing** (₹40-70 standard, ₹120-200 express) |
| Pincode coverage blocks express | Express unavailable (even with default rules) |
| No pincode coverage record | Defaults to **available** for both modes |

**Key Takeaway:** Unknown categories will work fine, but will use generic default pricing. To get category-specific pricing, add rules to the `shipping_rules` table.

