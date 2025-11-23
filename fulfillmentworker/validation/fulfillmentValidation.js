/**
 * Fulfillment validation schemas using JOI
 */

import Joi from 'joi';

export const updateStockSchema = Joi.object({
  quantity: Joi.number().integer().min(0).required(),
});

export const reduceStockSchema = Joi.object({
  quantity: Joi.number().integer().positive().required(),
  orderId: Joi.string().optional(), // Optional: for reducing specific reservation
});

export const reserveStockSchema = Joi.object({
  quantity: Joi.number().integer().positive().required(),
  orderId: Joi.string().required(), // Required: for TTL tracking
  ttlMinutes: Joi.number().integer().positive().min(1).max(60).optional().default(15), // Optional: TTL in minutes (default 15)
});

export const releaseStockSchema = Joi.object({
  orderId: Joi.string().optional(), // Preferred: release by orderId
  quantity: Joi.number().integer().positive().optional(), // Backward compatibility: release by quantity
}).or('orderId', 'quantity').custom((value, helpers) => {
  // Custom validation: at least one must be provided
  if (!value.orderId && !value.quantity) {
    return helpers.error('any.custom', { message: 'Either orderId or quantity must be provided' });
  }
  return value;
});

export const calculateShippingSchema = Joi.object({
  category: Joi.string().required(),
  shippingMode: Joi.string().valid('standard', 'express').required(),
  quantity: Joi.number().integer().positive().required(),
  productId: Joi.string().optional(), // Optional: helps find correct warehouse with stock
  address: Joi.object({
    pincode: Joi.string().pattern(/^[1-9][0-9]{5}$/).required().messages({
      'string.pattern.base': 'Pincode must be a valid 6-digit Indian pincode'
    }),
    city: Joi.string().allow('').optional(), // Optional: can be empty
    state: Joi.string().optional(), // Required for zone calculation
  }).required(),
});

export const calculateBatchShippingSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().required(),
      category: Joi.string().required(),
      quantity: Joi.number().integer().positive().required(),
    })
  ).min(1).required(),
  address: Joi.object({
    pincode: Joi.string().pattern(/^[1-9][0-9]{5}$/).required().messages({
      'string.pattern.base': 'Pincode must be a valid 6-digit Indian pincode'
    }),
    city: Joi.string().allow('').optional(),
    state: Joi.string().allow('').optional(),
  }).required(),
});

