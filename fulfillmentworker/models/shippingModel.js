/**
 * Shipping model for fulfillment worker
 * Shipping rules are stored in the database, not hardcoded
 */

/**
 * Get shipping rules for a warehouse and category
 * @param {D1Database} db - Database instance
 * @param {string} warehouseId - Warehouse ID
 * @param {string} category - Product category
 * @returns {Promise<Object|null>} Shipping rules or null
 */
export async function getShippingRulesByWarehouseAndCategory(db, warehouseId, category) {
  const result = await db
    .prepare(
      `SELECT rule_id, warehouse_id, category, rules, updated_at, created_at
       FROM shipping_rules 
       WHERE warehouse_id = ? AND category = ?`
    )
    .bind(warehouseId, category)
    .first();
  
  return result || null;
}

/**
 * Get shipping rules for a product category (fallback - uses first available warehouse)
 * @param {D1Database} db - Database instance
 * @param {string} category - Product category
 * @returns {Promise<Object|null>} Shipping rules or null
 */
export async function getShippingRulesByCategory(db, category) {
  const result = await db
    .prepare(
      `SELECT rule_id, warehouse_id, category, rules, updated_at, created_at
       FROM shipping_rules 
       WHERE category = ?
       LIMIT 1`
    )
    .bind(category)
    .first();
  
  return result || null;
}


/**
 * Calculate zone based on pincode distance
 * Zone 1: Same postal region (first 3 digits match) - 0-50km
 * Zone 2: Same state, different region - 50-500km
 * Zone 3: Different state - 500km+
 * @param {string} warehousePincode - Warehouse pincode
 * @param {string} customerPincode - Customer pincode
 * @returns {number} Zone number (1, 2, or 3)
 */
function calculateZone(warehousePincode, customerPincode) {
  if (!warehousePincode || !customerPincode) return 3; // Default to farthest zone
  
  const warehouseRegion = warehousePincode.substring(0, 3);
  const customerRegion = customerPincode.substring(0, 3);
  
  if (warehouseRegion === customerRegion) {
    return 1; // Same postal region
  }
  
  const warehouseState = warehousePincode.substring(0, 1);
  const customerState = customerPincode.substring(0, 1);
  
  if (warehouseState === customerState) {
    return 2; // Same state, different region
  }
  
  return 3; // Different state
}

/**
 * Calculate distance factor (for backward compatibility)
 * Maps zone to distance factor: Zone 1 -> 0, Zone 2 -> 1, Zone 3 -> 2
 * @deprecated Use calculateZone directly
 */
function calculatePincodeDistance(pincode1, pincode2) {
  const zone = calculateZone(pincode1, pincode2);
  return zone - 1; // Zone 1 -> 0, Zone 2 -> 1, Zone 3 -> 2
}

/**
 * Calculate estimated delivery days based on zone and shipping mode
 * @param {number} zone - Zone number (1, 2, or 3)
 * @param {string} shippingMode - 'standard' or 'express'
 * @param {Object} baseRules - Base shipping rules
 * @returns {number} Estimated days
 */
function calculateEstimatedDaysByZone(zone, shippingMode, baseRules) {
  const baseDays = baseRules.estimatedDays || (shippingMode === 'express' ? 2 : 5);
  
  // Add days based on zone
  if (zone === 1) {
    // Zone 1: Same postal region - fastest delivery
    return Math.max(1, baseDays - 1);
  } else if (zone === 2) {
    // Zone 2: Same state, different region - base days
    return baseDays;
  } else {
    // Zone 3: Different state - slowest delivery
    return baseDays + (shippingMode === 'express' ? 2 : 3);
  }
}

/**
 * Calculate estimated delivery days based on distance and shipping mode
 * @param {number} distanceFactor - Distance factor (0, 1, or 2)
 * @param {string} shippingMode - 'standard' or 'express'
 * @param {Object} baseRules - Base shipping rules
 * @returns {number} Estimated days
 * @deprecated Use calculateEstimatedDaysByZone with zone number
 */
function calculateEstimatedDays(distanceFactor, shippingMode, baseRules) {
  const zone = distanceFactor + 1; // Convert distance factor to zone
  return calculateEstimatedDaysByZone(zone, shippingMode, baseRules);
}

/**
 * Calculate shipping cost (India-specific, warehouse-based)
 * @param {D1Database} db - Database instance
 * @param {Object} params - Calculation parameters
 * @param {string} params.category - Product category
 * @param {string} params.shippingMode - 'standard' or 'express'
 * @param {number} params.quantity - Product quantity
 * @param {Object} params.address - Shipping address with pincode, city, state
 * @returns {Promise<Object>} Shipping cost and estimated delivery
 */
export async function calculateShippingCost(db, params) {
  const { category, shippingMode, quantity, address, productId } = params;
  
  if (!address || !address.pincode || !address.state) {
    throw new Error('Address with pincode and state is required');
  }
  
  const { getNearestWarehouseWithStock, getWarehousesByPincode, calculateZone } = await import('./warehouseModel.js');
  const { getStockFromWarehouse } = await import('./inventoryModel.js');
  
  // Step 1: Find closest warehouse with stock (if productId provided)
  let warehouse = null;
  let zone = 3;
  
  if (productId) {
    warehouse = await getNearestWarehouseWithStock(
      db,
      address.pincode,
      address.state,
      address.city || '',
      productId,
      quantity || 1
    );
    
    if (warehouse) {
      zone = warehouse.zone || calculateZone(warehouse.pincode, address.pincode);
    }
  }
  
  // If no stock-aware warehouse found, try pincode coverage
  if (!warehouse) {
    const warehouses = await getWarehousesByPincode(db, address.pincode);
    
    if (warehouses.length > 0) {
      // Find warehouse that supports the requested shipping mode
      warehouse = warehouses.find(w => {
        if (shippingMode === 'standard') {
          return w.standard_available === 1 || w.standard_available === true;
        } else {
          return w.express_available === 1 || w.express_available === true;
        }
      }) || warehouses[0]; // Fallback to first warehouse
      
      zone = calculateZone(warehouse.pincode, address.pincode);
    }
  }
  
  // If still no warehouse, try nearest warehouse (fallback)
  if (!warehouse) {
    const { getNearestWarehouse } = await import('./warehouseModel.js');
    warehouse = await getNearestWarehouse(
      db,
      address.pincode,
      address.state,
      address.city
    );
    
    if (!warehouse) {
      throw new Error('No warehouse available for this location');
    }
    
    zone = calculateZone(warehouse.pincode, address.pincode);
  }
  
  // Get pincode coverage info
  const coverageResult = await db
    .prepare(
      `SELECT standard_available, express_available
       FROM pincode_coverage
       WHERE warehouse_id = ? AND pincode = ?`
    )
    .bind(warehouse.warehouse_id, address.pincode)
    .first();
  
  const pincodeCoverage = coverageResult;
  
  // Check if shipping mode is available for this pincode
  if (pincodeCoverage) {
    const modeAvailable = shippingMode === 'standard' 
      ? (pincodeCoverage.standard_available === 1 || pincodeCoverage.standard_available === true)
      : (pincodeCoverage.express_available === 1 || pincodeCoverage.express_available === true);
    
    if (!modeAvailable) {
      throw new Error(`Shipping mode ${shippingMode} not available for pincode ${address.pincode}`);
    }
  }
  
  // Get shipping rules for warehouse and category
  let rules = await getShippingRulesByWarehouseAndCategory(db, warehouse.warehouse_id, category);
  
  // Fallback to category rules if warehouse-specific rules not found
  if (!rules) {
    rules = await getShippingRulesByCategory(db, category);
  }
  
  if (!rules) {
    // Default rules if none found
    const defaultRules = {
      standard: {
        available: true,
        baseCost: 30,
        costPerUnit: 5,
        estimatedDays: 5,
        minCost: 30,
        maxCost: 200
      },
      express: {
        available: true,
        baseCost: 100,
        costPerUnit: 15,
        estimatedDays: 2,
        minCost: 100,
        maxCost: 500
      }
    };
    
    const modeRules = defaultRules[shippingMode];
    const estimatedDays = calculateEstimatedDaysByZone(zone, shippingMode, modeRules);
    
    // Apply zone-based pricing
    let cost = modeRules.baseCost + (modeRules.costPerUnit * quantity);
    
    // Zone-based multiplier for default rules
    const zoneMultipliers = { 1: 0.9, 2: 1.0, 3: 1.4 };
    cost = cost * (zoneMultipliers[zone] || 1.0);
    
    if (cost < modeRules.minCost) cost = modeRules.minCost;
    if (cost > modeRules.maxCost) cost = modeRules.maxCost;
    
    return {
      cost: Math.round(cost * 100) / 100,
      currency: 'INR',
      estimatedDays,
      estimatedDaysRange: shippingMode === 'express' 
        ? `${estimatedDays}-${estimatedDays + 1} days`
        : `${estimatedDays}-${estimatedDays + 2} days`,
      shippingMode,
      warehouse: {
        id: warehouse.warehouse_id,
        name: warehouse.name,
        city: warehouse.city,
        state: warehouse.state,
        pincode: warehouse.pincode
      },
    };
  }
  
  // Parse rules
  const rulesData = typeof rules.rules === 'string' 
    ? JSON.parse(rules.rules) 
    : rules.rules;
  
  const modeRules = rulesData[shippingMode];
  if (!modeRules || !modeRules.available) {
    throw new Error(`Shipping mode ${shippingMode} not available for this category and location`);
  }
  
  // Calculate cost based on rules with zone-based pricing
  let cost = 0;
  
  if (modeRules.baseCost) {
    cost += modeRules.baseCost;
  }
  
  if (modeRules.costPerUnit) {
    cost += modeRules.costPerUnit * quantity;
  }
  
  // Apply zone-based pricing multiplier (preferred)
  if (modeRules.zoneMultiplier && typeof modeRules.zoneMultiplier === 'object') {
    const multiplier = modeRules.zoneMultiplier[zone] || modeRules.zoneMultiplier[String(zone)] || 1;
    cost = cost * multiplier;
  } else if (modeRules.distanceMultiplier && typeof modeRules.distanceMultiplier === 'object') {
    // Fallback to distance multiplier for backward compatibility
    const distanceFactor = zone - 1;
    const multiplier = modeRules.distanceMultiplier[distanceFactor] || modeRules.distanceMultiplier[String(distanceFactor)] || 1;
    cost = cost * multiplier;
  }
  
  // Apply any maximum/minimum constraints
  if (modeRules.minCost && cost < modeRules.minCost) {
    cost = modeRules.minCost;
  }
  if (modeRules.maxCost && cost > modeRules.maxCost) {
    cost = modeRules.maxCost;
  }
  
  // Calculate estimated days based on zone
  const estimatedDays = calculateEstimatedDaysByZone(zone, shippingMode, modeRules);
  
  return {
    cost: Math.round(cost * 100) / 100, // Round to 2 decimal places
    currency: 'INR',
    estimatedDays,
    estimatedDaysRange: shippingMode === 'express' 
      ? `${estimatedDays}-${estimatedDays + 1} days`
      : `${estimatedDays}-${estimatedDays + 2} days`,
    shippingMode,
    zone: zone,
    warehouse: {
      id: warehouse.warehouse_id,
      name: warehouse.name,
      city: warehouse.city,
      state: warehouse.state,
      pincode: warehouse.pincode
    },
    stockAvailable: warehouse.availableStock !== undefined,
    availableStock: warehouse.availableStock
  };
}

/**
 * Get shipping options for a product with address
 * @param {D1Database} db - Database instance
 * @param {string} productId - Product ID
 * @param {string} category - Product category (from catalog)
 * @param {Object} address - User address with pincode, city, state
 * @returns {Promise<Object>} Shipping options with costs and delivery times
 */
export async function getShippingOptionsForProduct(db, productId, category, address = null, requiredQuantity = 1) {
  if (!address || !address.pincode) {
    // Return default options if no address
    return {
      standard: {
        available: true,
        cost: 50,
        estimatedDays: 5,
        estimatedDaysRange: '5-7 days'
      },
      express: {
        available: true,
        cost: 150,
        estimatedDays: 2,
        estimatedDaysRange: '2-3 days'
      },
    };
  }
  
  const { getWarehousesByPincode, getNearestWarehouseWithStock, calculateZone } = await import('./warehouseModel.js');
  const { getStockFromWarehouse } = await import('./inventoryModel.js');
  
  // Step 1: Find closest warehouse with stock available
  let warehouse = await getNearestWarehouseWithStock(
    db,
    address.pincode,
    address.state || '',
    address.city || '',
    productId,
    requiredQuantity
  );
  
  let zone = 3; // Default to farthest zone
  
  if (!warehouse) {
    // No warehouse with stock found - try to find any warehouse (for display purposes)
    const warehouses = await getWarehousesByPincode(db, address.pincode);
    
    if (warehouses.length > 0) {
      warehouse = warehouses[0];
      zone = calculateZone(warehouse.pincode, address.pincode);
    } else {
      // No warehouse found at all - return default options
      const defaultStandardDays = calculateEstimatedDaysByZone(3, 'standard', { estimatedDays: 5 });
      const defaultExpressDays = calculateEstimatedDaysByZone(3, 'express', { estimatedDays: 2 });
      
      return {
        standard: {
          available: true,
          cost: 50,
          estimatedDays: defaultStandardDays,
          estimatedDaysRange: `${defaultStandardDays}-${defaultStandardDays + 2} days`
        },
        express: {
          available: true,
          cost: 150,
          estimatedDays: defaultExpressDays,
          estimatedDaysRange: `${defaultExpressDays}-${defaultExpressDays + 1} days`
        },
        stockAvailable: false
      };
    }
  } else {
    // Warehouse found with stock - use its zone
    zone = warehouse.zone || calculateZone(warehouse.pincode, address.pincode);
  }
  
  // Get shipping rules for the selected warehouse and category
  let rules = await getShippingRulesByWarehouseAndCategory(db, warehouse.warehouse_id, category);
  
  // Fallback to category rules if no warehouse-specific rules
  if (!rules) {
    rules = await getShippingRulesByCategory(db, category);
  }
  
  // Get pincode coverage for this warehouse
  const coverageResult = await db
    .prepare(
      `SELECT standard_available, express_available
       FROM pincode_coverage
       WHERE warehouse_id = ? AND pincode = ?`
    )
    .bind(warehouse.warehouse_id, address.pincode)
    .first();
  
  // Check pincode coverage availability
  // If coverage exists, use it; otherwise default to available
  const standardAvailable = coverageResult 
    ? (coverageResult.standard_available === 1 || coverageResult.standard_available === true || coverageResult.standard_available === '1' || coverageResult.standard_available === 'true')
    : true; // Default to available if no coverage record exists
  
  const expressAvailable = coverageResult
    ? (coverageResult.express_available === 1 || coverageResult.express_available === true || coverageResult.express_available === '1' || coverageResult.express_available === 'true')
    : true; // Default to not available if no coverage record exists
  
  // Use zone for calculations
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
        available: standardAvailable,
        cost: pricing.standard,
        estimatedDays: standardDays,
        estimatedDaysRange: `${standardDays}-${standardDays + 2} days`
      },
      express: {
        available: expressAvailable,
        cost: pricing.express,
        estimatedDays: expressDays,
        estimatedDaysRange: `${expressDays}-${expressDays + 1} days`
      },
      warehouse: {
        id: warehouse.warehouse_id,
        name: warehouse.name,
        city: warehouse.city,
        state: warehouse.state,
        zone: zone
      },
      stockAvailable: warehouse.availableStock !== undefined
    };
  }
  
  // Parse rules
  const rulesData = typeof rules.rules === 'string' 
    ? JSON.parse(rules.rules) 
    : rules.rules;
  
  // Calculate costs and delivery times for both modes
  const standardRules = rulesData.standard || {};
  const expressRules = rulesData.express || {};
  
  // Calculate delivery days based on zone
  const standardDays = calculateEstimatedDaysByZone(zone, 'standard', standardRules);
  const expressDays = calculateEstimatedDaysByZone(zone, 'express', expressRules);
  
  // Calculate standard shipping cost (for quantity 1) with zone-based pricing
  let standardCost = 0;
  if (standardRules.baseCost) {
    standardCost += standardRules.baseCost;
  }
  if (standardRules.costPerUnit) {
    standardCost += standardRules.costPerUnit * requiredQuantity; // Use required quantity
  }
  
  // Apply zone-based pricing multiplier
  if (standardRules.zoneMultiplier && typeof standardRules.zoneMultiplier === 'object') {
    const multiplier = standardRules.zoneMultiplier[zone] || standardRules.zoneMultiplier[String(zone)] || 1;
    standardCost = standardCost * multiplier;
  } else if (standardRules.distanceMultiplier && typeof standardRules.distanceMultiplier === 'object') {
    // Fallback to distance multiplier for backward compatibility
    const distanceFactor = zone - 1;
    const multiplier = standardRules.distanceMultiplier[distanceFactor] || standardRules.distanceMultiplier[String(distanceFactor)] || 1;
    standardCost = standardCost * multiplier;
  }
  
  // Apply min/max constraints
  if (standardRules.minCost !== undefined && standardCost < standardRules.minCost) {
    standardCost = standardRules.minCost;
  }
  if (standardRules.maxCost !== undefined && standardCost > standardRules.maxCost) {
    standardCost = standardRules.maxCost;
  }
  // If no rules specified, use zone-based default
  if (standardCost === 0 && !standardRules.baseCost && !standardRules.costPerUnit) {
    const zoneDefaults = { 1: 40, 2: 50, 3: 70 };
    standardCost = zoneDefaults[zone] || 50;
  }
  
  // Calculate express shipping cost (for quantity 1) with zone-based pricing
  let expressCost = 0;
  if (expressRules.baseCost) {
    expressCost += expressRules.baseCost;
  }
  if (expressRules.costPerUnit) {
    expressCost += expressRules.costPerUnit * requiredQuantity; // Use required quantity
  }
  
  // Apply zone-based pricing multiplier
  if (expressRules.zoneMultiplier && typeof expressRules.zoneMultiplier === 'object') {
    const multiplier = expressRules.zoneMultiplier[zone] || expressRules.zoneMultiplier[String(zone)] || 1;
    expressCost = expressCost * multiplier;
  } else if (expressRules.distanceMultiplier && typeof expressRules.distanceMultiplier === 'object') {
    // Fallback to distance multiplier for backward compatibility
    const distanceFactor = zone - 1;
    const multiplier = expressRules.distanceMultiplier[distanceFactor] || expressRules.distanceMultiplier[String(distanceFactor)] || 1;
    expressCost = expressCost * multiplier;
  }
  
  // Apply min/max constraints
  if (expressRules.minCost !== undefined && expressCost < expressRules.minCost) {
    expressCost = expressRules.minCost;
  }
  if (expressRules.maxCost !== undefined && expressCost > expressRules.maxCost) {
    expressCost = expressRules.maxCost;
  }
  // If no rules specified, use zone-based default
  if (expressCost === 0 && !expressRules.baseCost && !expressRules.costPerUnit) {
    const zoneDefaults = { 1: 120, 2: 150, 3: 200 };
    expressCost = zoneDefaults[zone] || 150;
  }
  
  // Final availability check: must be available in both coverage AND rules
  const finalStandardAvailable = standardAvailable && 
    (standardRules.available === undefined || standardRules.available === true || standardRules.available === 1);
  
  const finalExpressAvailable = expressAvailable && 
    (expressRules.available === undefined || expressRules.available === true || expressRules.available === 1);
  
  return {
    standard: {
      available: finalStandardAvailable,
      cost: Math.round(standardCost * 100) / 100,
      estimatedDays: standardDays,
      estimatedDaysRange: `${standardDays}-${standardDays + 2} days`
    },
    express: {
      available: finalExpressAvailable,
      cost: Math.round(expressCost * 100) / 100,
      estimatedDays: expressDays,
      estimatedDaysRange: `${expressDays}-${expressDays + 1} days`
    },
    warehouse: {
      id: warehouse.warehouse_id,
      name: warehouse.name,
      city: warehouse.city,
      state: warehouse.state,
      pincode: warehouse.pincode,
      zone: zone
    },
    stockAvailable: warehouse.availableStock !== undefined,
    availableStock: warehouse.availableStock
  };
}

