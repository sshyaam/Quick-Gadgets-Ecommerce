-- Advanced Shipping Rules for E-Commerce Wholesale Platform
-- This file contains sophisticated shipping rules with:
-- 1. Distance-based pricing multipliers
-- 2. Category-specific base costs and per-unit pricing
-- 3. Warehouse-specific rules
-- 4. Min/max cost constraints
-- 5. Dynamic delivery time calculation

-- ============================================================================
-- ADVANCED SHIPPING RULES BY WAREHOUSE AND CATEGORY
-- ============================================================================

-- Clear existing rules (optional - comment out if you want to keep existing)
-- DELETE FROM shipping_rules;

-- ============================================================================
-- MUMBAI WAREHOUSE (WH-MUM-001) - Premium location, lower base costs
-- ============================================================================

-- Smartphones: Lightweight, high-value items
INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-MUM-SMARTPHONES', 'WH-MUM-001', 'smartphones', 
'{
  "standard": {
    "available": true,
    "baseCost": 40,
    "costPerUnit": 5,
    "estimatedDays": 4,
    "minCost": 40,
    "maxCost": 250,
    "distanceMultiplier": {
      "0": 0.85,
      "1": 1.0,
      "2": 1.35
    }
  },
  "express": {
    "available": true,
    "baseCost": 120,
    "costPerUnit": 10,
    "estimatedDays": 1,
    "minCost": 120,
    "maxCost": 500,
    "distanceMultiplier": {
      "0": 0.9,
      "1": 1.0,
      "2": 1.4
    }
  }
}', datetime('now'), datetime('now'));

-- Laptops: Heavier items, higher base cost
INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-MUM-LAPTOPS', 'WH-MUM-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 80,
    "costPerUnit": 15,
    "estimatedDays": 5,
    "minCost": 80,
    "maxCost": 400,
    "distanceMultiplier": {
      "0": 0.9,
      "1": 1.0,
      "2": 1.4
    }
  },
  "express": {
    "available": true,
    "baseCost": 200,
    "costPerUnit": 25,
    "estimatedDays": 2,
    "minCost": 200,
    "maxCost": 800,
    "distanceMultiplier": {
      "0": 0.95,
      "1": 1.0,
      "2": 1.5
    }
  }
}', datetime('now'), datetime('now'));

-- Tablets: Medium weight, moderate pricing
INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-MUM-TABLETS', 'WH-MUM-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 50,
    "costPerUnit": 8,
    "estimatedDays": 4,
    "minCost": 50,
    "maxCost": 300,
    "distanceMultiplier": {
      "0": 0.88,
      "1": 1.0,
      "2": 1.3
    }
  },
  "express": {
    "available": true,
    "baseCost": 140,
    "costPerUnit": 15,
    "estimatedDays": 1,
    "minCost": 140,
    "maxCost": 600,
    "distanceMultiplier": {
      "0": 0.92,
      "1": 1.0,
      "2": 1.35
    }
  }
}', datetime('now'), datetime('now'));

-- Accessories: Lightweight, lower cost
INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-MUM-ACCESSORIES', 'WH-MUM-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 30,
    "costPerUnit": 3,
    "estimatedDays": 3,
    "minCost": 30,
    "maxCost": 150,
    "distanceMultiplier": {
      "0": 0.8,
      "1": 1.0,
      "2": 1.25
    }
  },
  "express": {
    "available": true,
    "baseCost": 100,
    "costPerUnit": 8,
    "estimatedDays": 1,
    "minCost": 100,
    "maxCost": 400,
    "distanceMultiplier": {
      "0": 0.85,
      "1": 1.0,
      "2": 1.3
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- DELHI WAREHOUSE (WH-DEL-001) - Central location, competitive pricing
-- ============================================================================

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-DEL-SMARTPHONES', 'WH-DEL-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 45,
    "costPerUnit": 6,
    "estimatedDays": 5,
    "minCost": 45,
    "maxCost": 280,
    "distanceMultiplier": {
      "0": 0.9,
      "1": 1.0,
      "2": 1.4
    }
  },
  "express": {
    "available": true,
    "baseCost": 130,
    "costPerUnit": 12,
    "estimatedDays": 2,
    "minCost": 130,
    "maxCost": 550,
    "distanceMultiplier": {
      "0": 0.95,
      "1": 1.0,
      "2": 1.45
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-DEL-LAPTOPS', 'WH-DEL-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 85,
    "costPerUnit": 18,
    "estimatedDays": 6,
    "minCost": 85,
    "maxCost": 450,
    "distanceMultiplier": {
      "0": 0.92,
      "1": 1.0,
      "2": 1.45
    }
  },
  "express": {
    "available": true,
    "baseCost": 220,
    "costPerUnit": 28,
    "estimatedDays": 2,
    "minCost": 220,
    "maxCost": 850,
    "distanceMultiplier": {
      "0": 0.98,
      "1": 1.0,
      "2": 1.55
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-DEL-TABLETS', 'WH-DEL-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 55,
    "costPerUnit": 9,
    "estimatedDays": 5,
    "minCost": 55,
    "maxCost": 320,
    "distanceMultiplier": {
      "0": 0.9,
      "1": 1.0,
      "2": 1.35
    }
  },
  "express": {
    "available": true,
    "baseCost": 150,
    "costPerUnit": 18,
    "estimatedDays": 2,
    "minCost": 150,
    "maxCost": 650,
    "distanceMultiplier": {
      "0": 0.94,
      "1": 1.0,
      "2": 1.4
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-DEL-ACCESSORIES', 'WH-DEL-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 35,
    "costPerUnit": 4,
    "estimatedDays": 4,
    "minCost": 35,
    "maxCost": 180,
    "distanceMultiplier": {
      "0": 0.85,
      "1": 1.0,
      "2": 1.3
    }
  },
  "express": {
    "available": true,
    "baseCost": 110,
    "costPerUnit": 10,
    "estimatedDays": 1,
    "minCost": 110,
    "maxCost": 450,
    "distanceMultiplier": {
      "0": 0.88,
      "1": 1.0,
      "2": 1.35
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- BANGALORE WAREHOUSE (WH-BLR-001) - Tech hub, optimized for electronics
-- ============================================================================

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-BLR-SMARTPHONES', 'WH-BLR-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 42,
    "costPerUnit": 5,
    "estimatedDays": 4,
    "minCost": 42,
    "maxCost": 260,
    "distanceMultiplier": {
      "0": 0.87,
      "1": 1.0,
      "2": 1.38
    }
  },
  "express": {
    "available": true,
    "baseCost": 125,
    "costPerUnit": 11,
    "estimatedDays": 1,
    "minCost": 125,
    "maxCost": 520,
    "distanceMultiplier": {
      "0": 0.91,
      "1": 1.0,
      "2": 1.42
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-BLR-LAPTOPS', 'WH-BLR-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 82,
    "costPerUnit": 16,
    "estimatedDays": 5,
    "minCost": 82,
    "maxCost": 420,
    "distanceMultiplier": {
      "0": 0.91,
      "1": 1.0,
      "2": 1.42
    }
  },
  "express": {
    "available": true,
    "baseCost": 210,
    "costPerUnit": 26,
    "estimatedDays": 2,
    "minCost": 210,
    "maxCost": 820,
    "distanceMultiplier": {
      "0": 0.96,
      "1": 1.0,
      "2": 1.52
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-BLR-TABLETS', 'WH-BLR-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 52,
    "costPerUnit": 8,
    "estimatedDays": 4,
    "minCost": 52,
    "maxCost": 310,
    "distanceMultiplier": {
      "0": 0.89,
      "1": 1.0,
      "2": 1.32
    }
  },
  "express": {
    "available": true,
    "baseCost": 145,
    "costPerUnit": 16,
    "estimatedDays": 1,
    "minCost": 145,
    "maxCost": 620,
    "distanceMultiplier": {
      "0": 0.93,
      "1": 1.0,
      "2": 1.37
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-BLR-ACCESSORIES', 'WH-BLR-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 32,
    "costPerUnit": 3,
    "estimatedDays": 3,
    "minCost": 32,
    "maxCost": 160,
    "distanceMultiplier": {
      "0": 0.82,
      "1": 1.0,
      "2": 1.28
    }
  },
  "express": {
    "available": true,
    "baseCost": 105,
    "costPerUnit": 9,
    "estimatedDays": 1,
    "minCost": 105,
    "maxCost": 420,
    "distanceMultiplier": {
      "0": 0.86,
      "1": 1.0,
      "2": 1.32
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- CHENNAI WAREHOUSE (WH-CHN-001) - South India hub
-- ============================================================================

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-CHN-SMARTPHONES', 'WH-CHN-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 48,
    "costPerUnit": 7,
    "estimatedDays": 5,
    "minCost": 48,
    "maxCost": 270,
    "distanceMultiplier": {
      "0": 0.88,
      "1": 1.0,
      "2": 1.4
    }
  },
  "express": {
    "available": true,
    "baseCost": 135,
    "costPerUnit": 13,
    "estimatedDays": 2,
    "minCost": 135,
    "maxCost": 560,
    "distanceMultiplier": {
      "0": 0.93,
      "1": 1.0,
      "2": 1.46
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-CHN-LAPTOPS', 'WH-CHN-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 88,
    "costPerUnit": 19,
    "estimatedDays": 6,
    "minCost": 88,
    "maxCost": 470,
    "distanceMultiplier": {
      "0": 0.93,
      "1": 1.0,
      "2": 1.46
    }
  },
  "express": {
    "available": true,
    "baseCost": 225,
    "costPerUnit": 29,
    "estimatedDays": 2,
    "minCost": 225,
    "maxCost": 880,
    "distanceMultiplier": {
      "0": 0.97,
      "1": 1.0,
      "2": 1.56
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-CHN-TABLETS', 'WH-CHN-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 58,
    "costPerUnit": 10,
    "estimatedDays": 5,
    "minCost": 58,
    "maxCost": 330,
    "distanceMultiplier": {
      "0": 0.91,
      "1": 1.0,
      "2": 1.36
    }
  },
  "express": {
    "available": true,
    "baseCost": 155,
    "costPerUnit": 19,
    "estimatedDays": 2,
    "minCost": 155,
    "maxCost": 670,
    "distanceMultiplier": {
      "0": 0.95,
      "1": 1.0,
      "2": 1.41
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-CHN-ACCESSORIES', 'WH-CHN-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 38,
    "costPerUnit": 5,
    "estimatedDays": 4,
    "minCost": 38,
    "maxCost": 190,
    "distanceMultiplier": {
      "0": 0.86,
      "1": 1.0,
      "2": 1.31
    }
  },
  "express": {
    "available": true,
    "baseCost": 115,
    "costPerUnit": 11,
    "estimatedDays": 1,
    "minCost": 115,
    "maxCost": 470,
    "distanceMultiplier": {
      "0": 0.89,
      "1": 1.0,
      "2": 1.36
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- KOLKATA WAREHOUSE (WH-KOL-001) - East India hub
-- ============================================================================

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-KOL-SMARTPHONES', 'WH-KOL-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 50,
    "costPerUnit": 8,
    "estimatedDays": 6,
    "minCost": 50,
    "maxCost": 290,
    "distanceMultiplier": {
      "0": 0.9,
      "1": 1.0,
      "2": 1.42
    }
  },
  "express": {
    "available": true,
    "baseCost": 140,
    "costPerUnit": 14,
    "estimatedDays": 2,
    "minCost": 140,
    "maxCost": 580,
    "distanceMultiplier": {
      "0": 0.94,
      "1": 1.0,
      "2": 1.48
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-KOL-LAPTOPS', 'WH-KOL-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 90,
    "costPerUnit": 20,
    "estimatedDays": 7,
    "minCost": 90,
    "maxCost": 490,
    "distanceMultiplier": {
      "0": 0.94,
      "1": 1.0,
      "2": 1.48
    }
  },
  "express": {
    "available": true,
    "baseCost": 230,
    "costPerUnit": 30,
    "estimatedDays": 3,
    "minCost": 230,
    "maxCost": 900,
    "distanceMultiplier": {
      "0": 0.98,
      "1": 1.0,
      "2": 1.58
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-KOL-TABLETS', 'WH-KOL-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 60,
    "costPerUnit": 11,
    "estimatedDays": 6,
    "minCost": 60,
    "maxCost": 340,
    "distanceMultiplier": {
      "0": 0.92,
      "1": 1.0,
      "2": 1.38
    }
  },
  "express": {
    "available": true,
    "baseCost": 160,
    "costPerUnit": 20,
    "estimatedDays": 2,
    "minCost": 160,
    "maxCost": 690,
    "distanceMultiplier": {
      "0": 0.96,
      "1": 1.0,
      "2": 1.43
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-KOL-ACCESSORIES', 'WH-KOL-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 40,
    "costPerUnit": 6,
    "estimatedDays": 5,
    "minCost": 40,
    "maxCost": 200,
    "distanceMultiplier": {
      "0": 0.87,
      "1": 1.0,
      "2": 1.33
    }
  },
  "express": {
    "available": true,
    "baseCost": 120,
    "costPerUnit": 12,
    "estimatedDays": 1,
    "minCost": 120,
    "maxCost": 490,
    "distanceMultiplier": {
      "0": 0.9,
      "1": 1.0,
      "2": 1.38
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- HYDERABAD WAREHOUSE (WH-HYD-001) - South-central hub
-- ============================================================================

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-HYD-SMARTPHONES', 'WH-HYD-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 46,
    "costPerUnit": 6,
    "estimatedDays": 5,
    "minCost": 46,
    "maxCost": 275,
    "distanceMultiplier": {
      "0": 0.89,
      "1": 1.0,
      "2": 1.39
    }
  },
  "express": {
    "available": true,
    "baseCost": 132,
    "costPerUnit": 12,
    "estimatedDays": 2,
    "minCost": 132,
    "maxCost": 570,
    "distanceMultiplier": {
      "0": 0.94,
      "1": 1.0,
      "2": 1.44
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-HYD-LAPTOPS', 'WH-HYD-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 86,
    "costPerUnit": 17,
    "estimatedDays": 6,
    "minCost": 86,
    "maxCost": 440,
    "distanceMultiplier": {
      "0": 0.92,
      "1": 1.0,
      "2": 1.44
    }
  },
  "express": {
    "available": true,
    "baseCost": 215,
    "costPerUnit": 27,
    "estimatedDays": 2,
    "minCost": 215,
    "maxCost": 840,
    "distanceMultiplier": {
      "0": 0.97,
      "1": 1.0,
      "2": 1.54
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-HYD-TABLETS', 'WH-HYD-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 56,
    "costPerUnit": 9,
    "estimatedDays": 5,
    "minCost": 56,
    "maxCost": 315,
    "distanceMultiplier": {
      "0": 0.9,
      "1": 1.0,
      "2": 1.34
    }
  },
  "express": {
    "available": true,
    "baseCost": 150,
    "costPerUnit": 17,
    "estimatedDays": 2,
    "minCost": 150,
    "maxCost": 640,
    "distanceMultiplier": {
      "0": 0.94,
      "1": 1.0,
      "2": 1.39
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-HYD-ACCESSORIES', 'WH-HYD-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 36,
    "costPerUnit": 4,
    "estimatedDays": 4,
    "minCost": 36,
    "maxCost": 185,
    "distanceMultiplier": {
      "0": 0.84,
      "1": 1.0,
      "2": 1.29
    }
  },
  "express": {
    "available": true,
    "baseCost": 112,
    "costPerUnit": 10,
    "estimatedDays": 1,
    "minCost": 112,
    "maxCost": 460,
    "distanceMultiplier": {
      "0": 0.87,
      "1": 1.0,
      "2": 1.34
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- PUNE WAREHOUSE (WH-PUN-001) - West India, near Mumbai
-- ============================================================================

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-PUN-SMARTPHONES', 'WH-PUN-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 41,
    "costPerUnit": 5,
    "estimatedDays": 4,
    "minCost": 41,
    "maxCost": 255,
    "distanceMultiplier": {
      "0": 0.86,
      "1": 1.0,
      "2": 1.36
    }
  },
  "express": {
    "available": true,
    "baseCost": 122,
    "costPerUnit": 10,
    "estimatedDays": 1,
    "minCost": 122,
    "maxCost": 510,
    "distanceMultiplier": {
      "0": 0.91,
      "1": 1.0,
      "2": 1.41
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-PUN-LAPTOPS', 'WH-PUN-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 81,
    "costPerUnit": 15,
    "estimatedDays": 5,
    "minCost": 81,
    "maxCost": 410,
    "distanceMultiplier": {
      "0": 0.91,
      "1": 1.0,
      "2": 1.41
    }
  },
  "express": {
    "available": true,
    "baseCost": 205,
    "costPerUnit": 25,
    "estimatedDays": 2,
    "minCost": 205,
    "maxCost": 810,
    "distanceMultiplier": {
      "0": 0.96,
      "1": 1.0,
      "2": 1.51
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-PUN-TABLETS', 'WH-PUN-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 51,
    "costPerUnit": 8,
    "estimatedDays": 4,
    "minCost": 51,
    "maxCost": 305,
    "distanceMultiplier": {
      "0": 0.89,
      "1": 1.0,
      "2": 1.31
    }
  },
  "express": {
    "available": true,
    "baseCost": 142,
    "costPerUnit": 15,
    "estimatedDays": 1,
    "minCost": 142,
    "maxCost": 610,
    "distanceMultiplier": {
      "0": 0.93,
      "1": 1.0,
      "2": 1.36
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-PUN-ACCESSORIES', 'WH-PUN-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 31,
    "costPerUnit": 3,
    "estimatedDays": 3,
    "minCost": 31,
    "maxCost": 155,
    "distanceMultiplier": {
      "0": 0.81,
      "1": 1.0,
      "2": 1.26
    }
  },
  "express": {
    "available": true,
    "baseCost": 102,
    "costPerUnit": 8,
    "estimatedDays": 1,
    "minCost": 102,
    "maxCost": 410,
    "distanceMultiplier": {
      "0": 0.85,
      "1": 1.0,
      "2": 1.31
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- AHMEDABAD WAREHOUSE (WH-AHM-001) - West India, Gujarat
-- ============================================================================

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-AHM-SMARTPHONES', 'WH-AHM-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 47,
    "costPerUnit": 7,
    "estimatedDays": 5,
    "minCost": 47,
    "maxCost": 265,
    "distanceMultiplier": {
      "0": 0.88,
      "1": 1.0,
      "2": 1.37
    }
  },
  "express": {
    "available": true,
    "baseCost": 133,
    "costPerUnit": 13,
    "estimatedDays": 2,
    "minCost": 133,
    "maxCost": 565,
    "distanceMultiplier": {
      "0": 0.93,
      "1": 1.0,
      "2": 1.43
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-AHM-LAPTOPS', 'WH-AHM-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 87,
    "costPerUnit": 18,
    "estimatedDays": 6,
    "minCost": 87,
    "maxCost": 430,
    "distanceMultiplier": {
      "0": 0.93,
      "1": 1.0,
      "2": 1.43
    }
  },
  "express": {
    "available": true,
    "baseCost": 218,
    "costPerUnit": 28,
    "estimatedDays": 2,
    "minCost": 218,
    "maxCost": 860,
    "distanceMultiplier": {
      "0": 0.97,
      "1": 1.0,
      "2": 1.53
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-AHM-TABLETS', 'WH-AHM-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 57,
    "costPerUnit": 10,
    "estimatedDays": 5,
    "minCost": 57,
    "maxCost": 325,
    "distanceMultiplier": {
      "0": 0.91,
      "1": 1.0,
      "2": 1.35
    }
  },
  "express": {
    "available": true,
    "baseCost": 152,
    "costPerUnit": 18,
    "estimatedDays": 2,
    "minCost": 152,
    "maxCost": 660,
    "distanceMultiplier": {
      "0": 0.95,
      "1": 1.0,
      "2": 1.4
    }
  }
}', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-AHM-ACCESSORIES', 'WH-AHM-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 37,
    "costPerUnit": 5,
    "estimatedDays": 4,
    "minCost": 37,
    "maxCost": 175,
    "distanceMultiplier": {
      "0": 0.85,
      "1": 1.0,
      "2": 1.3
    }
  },
  "express": {
    "available": true,
    "baseCost": 113,
    "costPerUnit": 11,
    "estimatedDays": 1,
    "minCost": 113,
    "maxCost": 465,
    "distanceMultiplier": {
      "0": 0.88,
      "1": 1.0,
      "2": 1.35
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- COMPREHENSIVE PINCODE COVERAGE
-- Adding coverage for major pincodes across India
-- ============================================================================

-- Mumbai warehouse coverage (Maharashtra pincodes)
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
('COV-MUM-400001', 'WH-MUM-001', '400001', 1, 1, datetime('now'), datetime('now')),
('COV-MUM-400002', 'WH-MUM-001', '400002', 1, 1, datetime('now'), datetime('now')),
('COV-MUM-400003', 'WH-MUM-001', '400003', 1, 1, datetime('now'), datetime('now')),
('COV-MUM-400004', 'WH-MUM-001', '400004', 1, 1, datetime('now'), datetime('now')),
('COV-MUM-400005', 'WH-MUM-001', '400005', 1, 1, datetime('now'), datetime('now')),
('COV-MUM-411001', 'WH-MUM-001', '411001', 1, 1, datetime('now'), datetime('now')),
('COV-MUM-411002', 'WH-MUM-001', '411002', 1, 1, datetime('now'), datetime('now')),
('COV-MUM-410001', 'WH-MUM-001', '410001', 1, 1, datetime('now'), datetime('now'));

-- Delhi warehouse coverage (Delhi NCR pincodes)
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
('COV-DEL-110001', 'WH-DEL-001', '110001', 1, 1, datetime('now'), datetime('now')),
('COV-DEL-110002', 'WH-DEL-001', '110002', 1, 1, datetime('now'), datetime('now')),
('COV-DEL-110003', 'WH-DEL-001', '110003', 1, 1, datetime('now'), datetime('now')),
('COV-DEL-110004', 'WH-DEL-001', '110004', 1, 1, datetime('now'), datetime('now')),
('COV-DEL-201301', 'WH-DEL-001', '201301', 1, 1, datetime('now'), datetime('now')),
('COV-DEL-201302', 'WH-DEL-001', '201302', 1, 1, datetime('now'), datetime('now')),
('COV-DEL-122001', 'WH-DEL-001', '122001', 1, 1, datetime('now'), datetime('now'));

-- Bangalore warehouse coverage (Karnataka pincodes)
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
('COV-BLR-560001', 'WH-BLR-001', '560001', 1, 1, datetime('now'), datetime('now')),
('COV-BLR-560002', 'WH-BLR-001', '560002', 1, 1, datetime('now'), datetime('now')),
('COV-BLR-560003', 'WH-BLR-001', '560003', 1, 1, datetime('now'), datetime('now')),
('COV-BLR-560004', 'WH-BLR-001', '560004', 1, 1, datetime('now'), datetime('now')),
('COV-BLR-560100', 'WH-BLR-001', '560100', 1, 1, datetime('now'), datetime('now'));

-- Chennai warehouse coverage (Tamil Nadu pincodes)
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
('COV-CHN-600001', 'WH-CHN-001', '600001', 1, 1, datetime('now'), datetime('now')),
('COV-CHN-600002', 'WH-CHN-001', '600002', 1, 1, datetime('now'), datetime('now')),
('COV-CHN-600003', 'WH-CHN-001', '600003', 1, 1, datetime('now'), datetime('now')),
('COV-CHN-600004', 'WH-CHN-001', '600004', 1, 1, datetime('now'), datetime('now'));

-- Kolkata warehouse coverage (West Bengal pincodes)
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
('COV-KOL-700001', 'WH-KOL-001', '700001', 1, 1, datetime('now'), datetime('now')),
('COV-KOL-700002', 'WH-KOL-001', '700002', 1, 1, datetime('now'), datetime('now')),
('COV-KOL-700003', 'WH-KOL-001', '700003', 1, 1, datetime('now'), datetime('now')),
('COV-KOL-700004', 'WH-KOL-001', '700004', 1, 1, datetime('now'), datetime('now'));

-- Hyderabad warehouse coverage (Telangana pincodes)
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
('COV-HYD-500001', 'WH-HYD-001', '500001', 1, 1, datetime('now'), datetime('now')),
('COV-HYD-500002', 'WH-HYD-001', '500002', 1, 1, datetime('now'), datetime('now')),
('COV-HYD-500003', 'WH-HYD-001', '500003', 1, 1, datetime('now'), datetime('now')),
('COV-HYD-500004', 'WH-HYD-001', '500004', 1, 1, datetime('now'), datetime('now'));

-- Pune warehouse coverage (Maharashtra pincodes)
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
('COV-PUN-411001', 'WH-PUN-001', '411001', 1, 1, datetime('now'), datetime('now')),
('COV-PUN-411002', 'WH-PUN-001', '411002', 1, 1, datetime('now'), datetime('now')),
('COV-PUN-411003', 'WH-PUN-001', '411003', 1, 1, datetime('now'), datetime('now'));

-- Ahmedabad warehouse coverage (Gujarat pincodes)
INSERT OR REPLACE INTO pincode_coverage (coverage_id, warehouse_id, pincode, standard_available, express_available, created_at, updated_at) VALUES
('COV-AHM-380001', 'WH-AHM-001', '380001', 1, 1, datetime('now'), datetime('now')),
('COV-AHM-380002', 'WH-AHM-001', '380002', 1, 1, datetime('now'), datetime('now')),
('COV-AHM-380003', 'WH-AHM-001', '380003', 1, 1, datetime('now'), datetime('now')),
('COV-AHM-380004', 'WH-AHM-001', '380004', 1, 1, datetime('now'), datetime('now'));

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Total Rules Created: 32 (8 warehouses × 4 categories)
-- - Each warehouse has rules for: smartphones, laptops, tablets, accessories
-- - Each rule includes: baseCost, costPerUnit, estimatedDays, minCost, maxCost
-- - Distance multipliers: 0 (same region), 1 (same state), 2 (different state)
-- - Pincode coverage: Major pincodes for each warehouse's region
-- 
-- Pricing Logic:
-- - Same region (distance 0): 10-15% discount
-- - Same state (distance 1): Base price
-- - Different state (distance 2): 25-58% premium
-- 
-- Category Pricing Tiers:
-- - Accessories: Lowest (₹30-40 base)
-- - Smartphones: Low-Medium (₹40-50 base)
-- - Tablets: Medium (₹50-60 base)
-- - Laptops: Highest (₹80-90 base)
-- 
-- Express vs Standard:
-- - Express: 2.5-3x base cost, 1-2 days faster
-- - Standard: Base cost, 3-7 days delivery

