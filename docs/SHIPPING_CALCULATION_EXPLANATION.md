# Shipping Cost and Delivery Days Calculation Guide

## Overview

Shipping costs and delivery days are calculated using a combination of:
1. **Base Cost** - Fixed cost per shipment
2. **Cost Per Unit** - Additional cost per item quantity
3. **Zone Multiplier** - Multiplier based on delivery zone (distance)
4. **Min/Max Constraints** - Minimum and maximum cost limits
5. **Zone-Based Delivery Days** - Estimated days adjusted by zone

---

## Cost Calculation Formula

```
Step 1: Calculate base cost
cost = baseCost + (costPerUnit × quantity)

Step 2: Apply zone multiplier
cost = cost × zoneMultiplier[zone]

Step 3: Apply min/max constraints
if (cost < minCost) cost = minCost
if (cost > maxCost) cost = maxCost

Final: Round to 2 decimal places
```

---

## Delivery Days Calculation

**Important:** Delivery days **DO change** based on zone! The `estimatedDays` in rules is the **base** for Zone 2, and it's adjusted for other zones.

### Formula for Estimated Days

```javascript
// Zone 1: Same postal region (fastest)
estimatedDays = Math.max(1, baseDays - 1)

// Zone 2: Same state, different region (base)
estimatedDays = baseDays

// Zone 3: Different state (slowest)
estimatedDays = baseDays + (express ? 2 : 3)
```

**Key Point:** Express delivery days are **NOT always the same** across zones. Zone 3 adds 2 extra days for express, and 3 extra days for standard.

---

## Example: Your Shipping Rules

Given your rules:
```json
{
  "standard": {
    "baseCost": 35,
    "costPerUnit": 3,
    "estimatedDays": 3,
    "minCost": 35,
    "maxCost": 200,
    "zoneMultiplier": { "1": 0.9, "2": 1.0, "3": 1.4 }
  },
  "express": {
    "baseCost": 100,
    "costPerUnit": 8,
    "estimatedDays": 1,
    "minCost": 100,
    "maxCost": 450,
    "zoneMultiplier": { "1": 0.95, "2": 1.0, "3": 1.45 }
  }
}
```

**Product Cost:** ₹100 (this doesn't affect shipping cost)

---

## Scenario 1: Single Item (Quantity = 1)

### Standard Shipping

**Zone 1:**
- Step 1: `35 + (3 × 1) = 38`
- Step 2: `38 × 0.9 = 34.2`
- Step 3: `34.2 < 35` → Apply minCost → **₹35**
- Delivery: `max(1, 3 - 1) = 2 days`
- **Result: ₹35, 2-4 days**

**Zone 2:**
- Step 1: `35 + (3 × 1) = 38`
- Step 2: `38 × 1.0 = 38`
- Step 3: `38 ≥ 35` and `38 ≤ 200` → **₹38**
- Delivery: `3 days` (base)
- **Result: ₹38, 3-5 days**

**Zone 3:**
- Step 1: `35 + (3 × 1) = 38`
- Step 2: `38 × 1.4 = 53.2`
- Step 3: `53.2 ≥ 35` and `53.2 ≤ 200` → **₹53.20**
- Delivery: `3 + 3 = 6 days`
- **Result: ₹53.20, 6-8 days**

### Express Shipping

**Zone 1:**
- Step 1: `100 + (8 × 1) = 108`
- Step 2: `108 × 0.95 = 102.6`
- Step 3: `102.6 ≥ 100` and `102.6 ≤ 450` → **₹102.60**
- Delivery: `max(1, 1 - 1) = 1 day`
- **Result: ₹102.60, 1-2 days**

**Zone 2:**
- Step 1: `100 + (8 × 1) = 108`
- Step 2: `108 × 1.0 = 108`
- Step 3: `108 ≥ 100` and `108 ≤ 450` → **₹108**
- Delivery: `1 day` (base)
- **Result: ₹108, 1-2 days**

**Zone 3:**
- Step 1: `100 + (8 × 1) = 108`
- Step 2: `108 × 1.45 = 156.6`
- Step 3: `156.6 ≥ 100` and `156.6 ≤ 450` → **₹156.60**
- Delivery: `1 + 2 = 3 days` ⚠️ **NOT 1 day!**
- **Result: ₹156.60, 3-4 days**

---

## Scenario 2: Multiple Items (Quantity = 5)

### Standard Shipping

**Zone 1:**
- Step 1: `35 + (3 × 5) = 50`
- Step 2: `50 × 0.9 = 45`
- Step 3: `45 ≥ 35` and `45 ≤ 200` → **₹45**
- Delivery: `2 days`
- **Result: ₹45, 2-4 days**

**Zone 2:**
- Step 1: `35 + (3 × 5) = 50`
- Step 2: `50 × 1.0 = 50`
- Step 3: `50 ≥ 35` and `50 ≤ 200` → **₹50**
- Delivery: `3 days`
- **Result: ₹50, 3-5 days**

**Zone 3:**
- Step 1: `35 + (3 × 5) = 50`
- Step 2: `50 × 1.4 = 70`
- Step 3: `70 ≥ 35` and `70 ≤ 200` → **₹70**
- Delivery: `6 days`
- **Result: ₹70, 6-8 days**

### Express Shipping

**Zone 1:**
- Step 1: `100 + (8 × 5) = 140`
- Step 2: `140 × 0.95 = 133`
- Step 3: `133 ≥ 100` and `133 ≤ 450` → **₹133**
- Delivery: `1 day`
- **Result: ₹133, 1-2 days**

**Zone 2:**
- Step 1: `100 + (8 × 5) = 140`
- Step 2: `140 × 1.0 = 140`
- Step 3: `140 ≥ 100` and `140 ≤ 450` → **₹140**
- Delivery: `1 day`
- **Result: ₹140, 1-2 days**

**Zone 3:**
- Step 1: `100 + (8 × 5) = 140`
- Step 2: `140 × 1.45 = 203`
- Step 3: `203 ≥ 100` and `203 ≤ 450` → **₹203**
- Delivery: `3 days` ⚠️ **NOT 1 day!**
- **Result: ₹203, 3-4 days**

---

## Scenario 3: Large Quantity (Quantity = 20) - Testing Max Cost

### Standard Shipping

**Zone 1:**
- Step 1: `35 + (3 × 20) = 95`
- Step 2: `95 × 0.9 = 85.5`
- Step 3: `85.5 ≥ 35` and `85.5 ≤ 200` → **₹85.50**
- Delivery: `2 days`
- **Result: ₹85.50, 2-4 days**

**Zone 2:**
- Step 1: `35 + (3 × 20) = 95`
- Step 2: `95 × 1.0 = 95`
- Step 3: `95 ≥ 35` and `95 ≤ 200` → **₹95**
- Delivery: `3 days`
- **Result: ₹95, 3-5 days**

**Zone 3:**
- Step 1: `35 + (3 × 20) = 95`
- Step 2: `95 × 1.4 = 133`
- Step 3: `133 ≥ 35` and `133 ≤ 200` → **₹133**
- Delivery: `6 days`
- **Result: ₹133, 6-8 days**

### Express Shipping

**Zone 1:**
- Step 1: `100 + (8 × 20) = 260`
- Step 2: `260 × 0.95 = 247`
- Step 3: `247 ≥ 100` and `247 ≤ 450` → **₹247**
- Delivery: `1 day`
- **Result: ₹247, 1-2 days**

**Zone 2:**
- Step 1: `100 + (8 × 20) = 260`
- Step 2: `260 × 1.0 = 260`
- Step 3: `260 ≥ 100` and `260 ≤ 450` → **₹260**
- Delivery: `1 day`
- **Result: ₹260, 1-2 days**

**Zone 3:**
- Step 1: `100 + (8 × 20) = 260`
- Step 2: `260 × 1.45 = 377`
- Step 3: `377 ≥ 100` and `377 ≤ 450` → **₹377**
- Delivery: `3 days` ⚠️ **NOT 1 day!**
- **Result: ₹377, 3-4 days**

---

## Scenario 4: Very Large Quantity (Quantity = 50) - Max Cost Applied

### Standard Shipping

**Zone 3:**
- Step 1: `35 + (3 × 50) = 185`
- Step 2: `185 × 1.4 = 259`
- Step 3: `259 > 200` → Apply maxCost → **₹200** (capped)
- Delivery: `6 days`
- **Result: ₹200, 6-8 days**

### Express Shipping

**Zone 3:**
- Step 1: `100 + (8 × 50) = 500`
- Step 2: `500 × 1.45 = 725`
- Step 3: `725 > 450` → Apply maxCost → **₹450** (capped)
- Delivery: `3 days`
- **Result: ₹450, 3-4 days**

---

## Summary Table: Your Rules Applied

| Zone | Quantity | Standard Cost | Standard Days | Express Cost | Express Days |
|------|----------|---------------|---------------|--------------|--------------|
| 1    | 1        | ₹35 (min)     | 2 days        | ₹102.60      | 1 day        |
| 1    | 5        | ₹45           | 2 days        | ₹133         | 1 day        |
| 1    | 20       | ₹85.50        | 2 days        | ₹247         | 1 day        |
| 2    | 1        | ₹38           | 3 days        | ₹108         | 1 day        |
| 2    | 5        | ₹50           | 3 days        | ₹140         | 1 day        |
| 2    | 20       | ₹95           | 3 days        | ₹260         | 1 day        |
| 3    | 1        | ₹53.20        | 6 days        | ₹156.60      | **3 days** ⚠️ |
| 3    | 5        | ₹70           | 6 days        | ₹203         | **3 days** ⚠️ |
| 3    | 20       | ₹133          | 6 days        | ₹377         | **3 days** ⚠️ |
| 3    | 50       | ₹200 (max)    | 6 days        | ₹450 (max)   | **3 days** ⚠️ |

---

## Key Takeaways

### 1. Delivery Days ARE Zone-Dependent

**❌ Incorrect Assumption:**
> "Express is always 1 day regardless of zone"

**✅ Correct Understanding:**
- **Zone 1:** Express = `max(1, baseDays - 1)` = 1 day
- **Zone 2:** Express = `baseDays` = 1 day
- **Zone 3:** Express = `baseDays + 2` = **3 days** ⚠️

The `estimatedDays: 1` in your rules is the **base for Zone 2**, not a fixed value.

### 2. Cost Calculation Order Matters

1. Calculate: `baseCost + (costPerUnit × quantity)`
2. Multiply by zone multiplier
3. Apply min/max constraints (this can override the calculation)

### 3. Zone Multipliers Affect Cost, Not Days

- **Zone multipliers** only affect **cost**, not delivery days
- Delivery days are calculated separately using the zone-based formula

### 4. Min/Max Constraints Are Final

Even if the calculated cost exceeds maxCost, it will be capped. This prevents extremely high shipping costs for large orders.

---

## Code Reference

**File:** `fulfillmentworker/models/shippingModel.js`

- **Cost Calculation:** Lines 498-529 (standard), 531-562 (express)
- **Delivery Days Calculation:** Lines 93-107 (`calculateEstimatedDaysByZone`)

