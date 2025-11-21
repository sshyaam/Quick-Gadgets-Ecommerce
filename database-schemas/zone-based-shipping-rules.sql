-- Zone-Based Shipping Rules
-- This replaces all existing shipping rules with zone-based pricing
-- Zones: 1 (same region), 2 (same state), 3 (different state)

-- Clear existing rules
DELETE FROM shipping_rules;

-- ============================================================================
-- ZONE-BASED PRICING STRUCTURE
-- ============================================================================
-- Zone 1: Same postal region (first 3 digits match) - 0-50km
--   - Fastest delivery, lowest cost
--   - Standard: ₹35-45, Express: ₹100-130
-- Zone 2: Same state, different region - 50-500km
--   - Medium delivery, base cost
--   - Standard: ₹50-60, Express: ₹150-180
-- Zone 3: Different state - 500km+
--   - Slowest delivery, premium cost
--   - Standard: ₹70-90, Express: ₹200-250

-- ============================================================================
-- MUMBAI WAREHOUSE (WH-MUM-001) - Zone-based rules
-- ============================================================================

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-MUM-SMARTPHONES', 'WH-MUM-001', 'smartphones', 
'{
  "standard": {
    "available": true,
    "baseCost": 35,
    "costPerUnit": 3,
    "estimatedDays": 3,
    "minCost": 35,
    "maxCost": 200,
    "zoneMultiplier": {
      "1": 0.9,
      "2": 1.0,
      "3": 1.4
    }
  },
  "express": {
    "available": true,
    "baseCost": 100,
    "costPerUnit": 8,
    "estimatedDays": 1,
    "minCost": 100,
    "maxCost": 450,
    "zoneMultiplier": {
      "1": 0.95,
      "2": 1.0,
      "3": 1.45
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-MUM-LAPTOPS', 'WH-MUM-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 70,
    "costPerUnit": 12,
    "estimatedDays": 4,
    "minCost": 70,
    "maxCost": 350,
    "zoneMultiplier": {
      "1": 0.92,
      "2": 1.0,
      "3": 1.42
    }
  },
  "express": {
    "available": true,
    "baseCost": 180,
    "costPerUnit": 22,
    "estimatedDays": 2,
    "minCost": 180,
    "maxCost": 750,
    "zoneMultiplier": {
      "1": 0.96,
      "2": 1.0,
      "3": 1.52
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-MUM-TABLETS', 'WH-MUM-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 45,
    "costPerUnit": 6,
    "estimatedDays": 3,
    "minCost": 45,
    "maxCost": 250,
    "zoneMultiplier": {
      "1": 0.91,
      "2": 1.0,
      "3": 1.38
    }
  },
  "express": {
    "available": true,
    "baseCost": 125,
    "costPerUnit": 12,
    "estimatedDays": 1,
    "minCost": 125,
    "maxCost": 550,
    "zoneMultiplier": {
      "1": 0.94,
      "2": 1.0,
      "3": 1.4
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-MUM-ACCESSORIES', 'WH-MUM-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 25,
    "costPerUnit": 2,
    "estimatedDays": 2,
    "minCost": 25,
    "maxCost": 120,
    "zoneMultiplier": {
      "1": 0.85,
      "2": 1.0,
      "3": 1.3
    }
  },
  "express": {
    "available": true,
    "baseCost": 90,
    "costPerUnit": 6,
    "estimatedDays": 1,
    "minCost": 90,
    "maxCost": 350,
    "zoneMultiplier": {
      "1": 0.88,
      "2": 1.0,
      "3": 1.35
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- DELHI WAREHOUSE (WH-DEL-001) - Zone-based rules
-- ============================================================================

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-DEL-SMARTPHONES', 'WH-DEL-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 38,
    "costPerUnit": 4,
    "estimatedDays": 4,
    "minCost": 38,
    "maxCost": 220,
    "zoneMultiplier": {
      "1": 0.92,
      "2": 1.0,
      "3": 1.42
    }
  },
  "express": {
    "available": true,
    "baseCost": 110,
    "costPerUnit": 10,
    "estimatedDays": 2,
    "minCost": 110,
    "maxCost": 480,
    "zoneMultiplier": {
      "1": 0.96,
      "2": 1.0,
      "3": 1.46
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-DEL-LAPTOPS', 'WH-DEL-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 75,
    "costPerUnit": 15,
    "estimatedDays": 5,
    "minCost": 75,
    "maxCost": 380,
    "zoneMultiplier": {
      "1": 0.93,
      "2": 1.0,
      "3": 1.44
    }
  },
  "express": {
    "available": true,
    "baseCost": 190,
    "costPerUnit": 25,
    "estimatedDays": 2,
    "minCost": 190,
    "maxCost": 800,
    "zoneMultiplier": {
      "1": 0.97,
      "2": 1.0,
      "3": 1.55
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-DEL-TABLETS', 'WH-DEL-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 48,
    "costPerUnit": 7,
    "estimatedDays": 4,
    "minCost": 48,
    "maxCost": 270,
    "zoneMultiplier": {
      "1": 0.91,
      "2": 1.0,
      "3": 1.39
    }
  },
  "express": {
    "available": true,
    "baseCost": 130,
    "costPerUnit": 15,
    "estimatedDays": 2,
    "minCost": 130,
    "maxCost": 580,
    "zoneMultiplier": {
      "1": 0.95,
      "2": 1.0,
      "3": 1.42
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-DEL-ACCESSORIES', 'WH-DEL-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 28,
    "costPerUnit": 3,
    "estimatedDays": 3,
    "minCost": 28,
    "maxCost": 140,
    "zoneMultiplier": {
      "1": 0.86,
      "2": 1.0,
      "3": 1.32
    }
  },
  "express": {
    "available": true,
    "baseCost": 95,
    "costPerUnit": 8,
    "estimatedDays": 1,
    "minCost": 95,
    "maxCost": 380,
    "zoneMultiplier": {
      "1": 0.89,
      "2": 1.0,
      "3": 1.37
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- BANGALORE WAREHOUSE (WH-BLR-001) - Zone-based rules
-- ============================================================================

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-BLR-SMARTPHONES', 'WH-BLR-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 36,
    "costPerUnit": 3,
    "estimatedDays": 3,
    "minCost": 36,
    "maxCost": 210,
    "zoneMultiplier": {
      "1": 0.9,
      "2": 1.0,
      "3": 1.4
    }
  },
  "express": {
    "available": true,
    "baseCost": 105,
    "costPerUnit": 9,
    "estimatedDays": 1,
    "minCost": 105,
    "maxCost": 470,
    "zoneMultiplier": {
      "1": 0.94,
      "2": 1.0,
      "3": 1.43
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-BLR-LAPTOPS', 'WH-BLR-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 72,
    "costPerUnit": 13,
    "estimatedDays": 4,
    "minCost": 72,
    "maxCost": 360,
    "zoneMultiplier": {
      "1": 0.92,
      "2": 1.0,
      "3": 1.41
    }
  },
  "express": {
    "available": true,
    "baseCost": 185,
    "costPerUnit": 23,
    "estimatedDays": 2,
    "minCost": 185,
    "maxCost": 780,
    "zoneMultiplier": {
      "1": 0.96,
      "2": 1.0,
      "3": 1.53
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-BLR-TABLETS', 'WH-BLR-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 46,
    "costPerUnit": 6,
    "estimatedDays": 3,
    "minCost": 46,
    "maxCost": 260,
    "zoneMultiplier": {
      "1": 0.91,
      "2": 1.0,
      "3": 1.37
    }
  },
  "express": {
    "available": true,
    "baseCost": 128,
    "costPerUnit": 13,
    "estimatedDays": 1,
    "minCost": 128,
    "maxCost": 570,
    "zoneMultiplier": {
      "1": 0.94,
      "2": 1.0,
      "3": 1.39
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-BLR-ACCESSORIES', 'WH-BLR-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 26,
    "costPerUnit": 2,
    "estimatedDays": 2,
    "minCost": 26,
    "maxCost": 130,
    "zoneMultiplier": {
      "1": 0.85,
      "2": 1.0,
      "3": 1.31
    }
  },
  "express": {
    "available": true,
    "baseCost": 92,
    "costPerUnit": 7,
    "estimatedDays": 1,
    "minCost": 92,
    "maxCost": 360,
    "zoneMultiplier": {
      "1": 0.88,
      "2": 1.0,
      "3": 1.33
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- CHENNAI WAREHOUSE (WH-CHN-001) - Zone-based rules
-- ============================================================================

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-CHN-SMARTPHONES', 'WH-CHN-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 40,
    "costPerUnit": 5,
    "estimatedDays": 4,
    "minCost": 40,
    "maxCost": 230,
    "zoneMultiplier": {
      "1": 0.93,
      "2": 1.0,
      "3": 1.41
    }
  },
  "express": {
    "available": true,
    "baseCost": 115,
    "costPerUnit": 11,
    "estimatedDays": 2,
    "minCost": 115,
    "maxCost": 490,
    "zoneMultiplier": {
      "1": 0.96,
      "2": 1.0,
      "3": 1.45
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-CHN-LAPTOPS', 'WH-CHN-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 78,
    "costPerUnit": 16,
    "estimatedDays": 5,
    "minCost": 78,
    "maxCost": 390,
    "zoneMultiplier": {
      "1": 0.94,
      "2": 1.0,
      "3": 1.43
    }
  },
  "express": {
    "available": true,
    "baseCost": 195,
    "costPerUnit": 26,
    "estimatedDays": 2,
    "minCost": 195,
    "maxCost": 820,
    "zoneMultiplier": {
      "1": 0.98,
      "2": 1.0,
      "3": 1.56
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-CHN-TABLETS', 'WH-CHN-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 50,
    "costPerUnit": 8,
    "estimatedDays": 4,
    "minCost": 50,
    "maxCost": 280,
    "zoneMultiplier": {
      "1": 0.92,
      "2": 1.0,
      "3": 1.38
    }
  },
  "express": {
    "available": true,
    "baseCost": 135,
    "costPerUnit": 16,
    "estimatedDays": 2,
    "minCost": 135,
    "maxCost": 590,
    "zoneMultiplier": {
      "1": 0.95,
      "2": 1.0,
      "3": 1.41
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-CHN-ACCESSORIES', 'WH-CHN-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 30,
    "costPerUnit": 4,
    "estimatedDays": 3,
    "minCost": 30,
    "maxCost": 150,
    "zoneMultiplier": {
      "1": 0.87,
      "2": 1.0,
      "3": 1.33
    }
  },
  "express": {
    "available": true,
    "baseCost": 98,
    "costPerUnit": 9,
    "estimatedDays": 1,
    "minCost": 98,
    "maxCost": 390,
    "zoneMultiplier": {
      "1": 0.9,
      "2": 1.0,
      "3": 1.36
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- KOLKATA WAREHOUSE (WH-KOL-001) - Zone-based rules
-- ============================================================================

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-KOL-SMARTPHONES', 'WH-KOL-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 42,
    "costPerUnit": 6,
    "estimatedDays": 5,
    "minCost": 42,
    "maxCost": 240,
    "zoneMultiplier": {
      "1": 0.91,
      "2": 1.0,
      "3": 1.43
    }
  },
  "express": {
    "available": true,
    "baseCost": 120,
    "costPerUnit": 12,
    "estimatedDays": 2,
    "minCost": 120,
    "maxCost": 500,
    "zoneMultiplier": {
      "1": 0.95,
      "2": 1.0,
      "3": 1.47
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-KOL-LAPTOPS', 'WH-KOL-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 80,
    "costPerUnit": 17,
    "estimatedDays": 6,
    "minCost": 80,
    "maxCost": 400,
    "zoneMultiplier": {
      "1": 0.95,
      "2": 1.0,
      "3": 1.45
    }
  },
  "express": {
    "available": true,
    "baseCost": 200,
    "costPerUnit": 27,
    "estimatedDays": 3,
    "minCost": 200,
    "maxCost": 850,
    "zoneMultiplier": {
      "1": 0.99,
      "2": 1.0,
      "3": 1.58
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-KOL-TABLETS', 'WH-KOL-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 52,
    "costPerUnit": 9,
    "estimatedDays": 5,
    "minCost": 52,
    "maxCost": 290,
    "zoneMultiplier": {
      "1": 0.93,
      "2": 1.0,
      "3": 1.39
    }
  },
  "express": {
    "available": true,
    "baseCost": 140,
    "costPerUnit": 18,
    "estimatedDays": 2,
    "minCost": 140,
    "maxCost": 610,
    "zoneMultiplier": {
      "1": 0.97,
      "2": 1.0,
      "3": 1.44
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-KOL-ACCESSORIES', 'WH-KOL-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 32,
    "costPerUnit": 4,
    "estimatedDays": 4,
    "minCost": 32,
    "maxCost": 160,
    "zoneMultiplier": {
      "1": 0.88,
      "2": 1.0,
      "3": 1.34
    }
  },
  "express": {
    "available": true,
    "baseCost": 105,
    "costPerUnit": 10,
    "estimatedDays": 1,
    "minCost": 105,
    "maxCost": 410,
    "zoneMultiplier": {
      "1": 0.91,
      "2": 1.0,
      "3": 1.39
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- HYDERABAD WAREHOUSE (WH-HYD-001) - Zone-based rules
-- ============================================================================

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-HYD-SMARTPHONES', 'WH-HYD-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 39,
    "costPerUnit": 4,
    "estimatedDays": 4,
    "minCost": 39,
    "maxCost": 225,
    "zoneMultiplier": {
      "1": 0.92,
      "2": 1.0,
      "3": 1.4
    }
  },
  "express": {
    "available": true,
    "baseCost": 112,
    "costPerUnit": 10,
    "estimatedDays": 2,
    "minCost": 112,
    "maxCost": 485,
    "zoneMultiplier": {
      "1": 0.95,
      "2": 1.0,
      "3": 1.44
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-HYD-LAPTOPS', 'WH-HYD-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 76,
    "costPerUnit": 14,
    "estimatedDays": 5,
    "minCost": 76,
    "maxCost": 370,
    "zoneMultiplier": {
      "1": 0.93,
      "2": 1.0,
      "3": 1.43
    }
  },
  "express": {
    "available": true,
    "baseCost": 192,
    "costPerUnit": 24,
    "estimatedDays": 2,
    "minCost": 192,
    "maxCost": 810,
    "zoneMultiplier": {
      "1": 0.97,
      "2": 1.0,
      "3": 1.54
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-HYD-TABLETS', 'WH-HYD-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 49,
    "costPerUnit": 7,
    "estimatedDays": 4,
    "minCost": 49,
    "maxCost": 275,
    "zoneMultiplier": {
      "1": 0.91,
      "2": 1.0,
      "3": 1.38
    }
  },
  "express": {
    "available": true,
    "baseCost": 132,
    "costPerUnit": 14,
    "estimatedDays": 2,
    "minCost": 132,
    "maxCost": 580,
    "zoneMultiplier": {
      "1": 0.94,
      "2": 1.0,
      "3": 1.4
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-HYD-ACCESSORIES', 'WH-HYD-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 29,
    "costPerUnit": 3,
    "estimatedDays": 3,
    "minCost": 29,
    "maxCost": 145,
    "zoneMultiplier": {
      "1": 0.86,
      "2": 1.0,
      "3": 1.32
    }
  },
  "express": {
    "available": true,
    "baseCost": 96,
    "costPerUnit": 8,
    "estimatedDays": 1,
    "minCost": 96,
    "maxCost": 375,
    "zoneMultiplier": {
      "1": 0.89,
      "2": 1.0,
      "3": 1.35
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- PUNE WAREHOUSE (WH-PUN-001) - Zone-based rules
-- ============================================================================

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-PUN-SMARTPHONES', 'WH-PUN-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 37,
    "costPerUnit": 3,
    "estimatedDays": 3,
    "minCost": 37,
    "maxCost": 215,
    "zoneMultiplier": {
      "1": 0.91,
      "2": 1.0,
      "3": 1.39
    }
  },
  "express": {
    "available": true,
    "baseCost": 107,
    "costPerUnit": 9,
    "estimatedDays": 1,
    "minCost": 107,
    "maxCost": 475,
    "zoneMultiplier": {
      "1": 0.94,
      "2": 1.0,
      "3": 1.42
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-PUN-LAPTOPS', 'WH-PUN-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 73,
    "costPerUnit": 13,
    "estimatedDays": 4,
    "minCost": 73,
    "maxCost": 365,
    "zoneMultiplier": {
      "1": 0.92,
      "2": 1.0,
      "3": 1.41
    }
  },
  "express": {
    "available": true,
    "baseCost": 187,
    "costPerUnit": 23,
    "estimatedDays": 2,
    "minCost": 187,
    "maxCost": 790,
    "zoneMultiplier": {
      "1": 0.96,
      "2": 1.0,
      "3": 1.52
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-PUN-TABLETS', 'WH-PUN-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 47,
    "costPerUnit": 6,
    "estimatedDays": 3,
    "minCost": 47,
    "maxCost": 265,
    "zoneMultiplier": {
      "1": 0.91,
      "2": 1.0,
      "3": 1.37
    }
  },
  "express": {
    "available": true,
    "baseCost": 130,
    "costPerUnit": 13,
    "estimatedDays": 1,
    "minCost": 130,
    "maxCost": 575,
    "zoneMultiplier": {
      "1": 0.94,
      "2": 1.0,
      "3": 1.39
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-PUN-ACCESSORIES', 'WH-PUN-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 27,
    "costPerUnit": 2,
    "estimatedDays": 2,
    "minCost": 27,
    "maxCost": 135,
    "zoneMultiplier": {
      "1": 0.85,
      "2": 1.0,
      "3": 1.31
    }
  },
  "express": {
    "available": true,
    "baseCost": 93,
    "costPerUnit": 7,
    "estimatedDays": 1,
    "minCost": 93,
    "maxCost": 365,
    "zoneMultiplier": {
      "1": 0.88,
      "2": 1.0,
      "3": 1.33
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- AHMEDABAD WAREHOUSE (WH-AHM-001) - Zone-based rules
-- ============================================================================

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-AHM-SMARTPHONES', 'WH-AHM-001', 'smartphones',
'{
  "standard": {
    "available": true,
    "baseCost": 41,
    "costPerUnit": 5,
    "estimatedDays": 4,
    "minCost": 41,
    "maxCost": 235,
    "zoneMultiplier": {
      "1": 0.93,
      "2": 1.0,
      "3": 1.41
    }
  },
  "express": {
    "available": true,
    "baseCost": 118,
    "costPerUnit": 11,
    "estimatedDays": 2,
    "minCost": 118,
    "maxCost": 495,
    "zoneMultiplier": {
      "1": 0.96,
      "2": 1.0,
      "3": 1.45
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-AHM-LAPTOPS', 'WH-AHM-001', 'laptops',
'{
  "standard": {
    "available": true,
    "baseCost": 79,
    "costPerUnit": 16,
    "estimatedDays": 5,
    "minCost": 79,
    "maxCost": 385,
    "zoneMultiplier": {
      "1": 0.94,
      "2": 1.0,
      "3": 1.43
    }
  },
  "express": {
    "available": true,
    "baseCost": 198,
    "costPerUnit": 26,
    "estimatedDays": 2,
    "minCost": 198,
    "maxCost": 830,
    "zoneMultiplier": {
      "1": 0.98,
      "2": 1.0,
      "3": 1.56
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-AHM-TABLETS', 'WH-AHM-001', 'tablets',
'{
  "standard": {
    "available": true,
    "baseCost": 51,
    "costPerUnit": 8,
    "estimatedDays": 4,
    "minCost": 51,
    "maxCost": 285,
    "zoneMultiplier": {
      "1": 0.92,
      "2": 1.0,
      "3": 1.38
    }
  },
  "express": {
    "available": true,
    "baseCost": 137,
    "costPerUnit": 16,
    "estimatedDays": 2,
    "minCost": 137,
    "maxCost": 600,
    "zoneMultiplier": {
      "1": 0.95,
      "2": 1.0,
      "3": 1.41
    }
  }
}', datetime('now'), datetime('now'));

INSERT INTO shipping_rules (rule_id, warehouse_id, category, rules, created_at, updated_at) VALUES
('RULE-AHM-ACCESSORIES', 'WH-AHM-001', 'accessories',
'{
  "standard": {
    "available": true,
    "baseCost": 31,
    "costPerUnit": 4,
    "estimatedDays": 3,
    "minCost": 31,
    "maxCost": 155,
    "zoneMultiplier": {
      "1": 0.87,
      "2": 1.0,
      "3": 1.33
    }
  },
  "express": {
    "available": true,
    "baseCost": 99,
    "costPerUnit": 9,
    "estimatedDays": 1,
    "minCost": 99,
    "maxCost": 395,
    "zoneMultiplier": {
      "1": 0.9,
      "2": 1.0,
      "3": 1.36
    }
  }
}', datetime('now'), datetime('now'));

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Total Rules: 32 (8 warehouses × 4 categories)
-- All rules use zone-based pricing with zoneMultiplier
-- Zones: 1 (same region), 2 (same state), 3 (different state)
-- Pricing varies by zone: Zone 1 cheapest, Zone 3 most expensive
-- Stock-aware warehouse selection: System finds closest warehouse with stock

