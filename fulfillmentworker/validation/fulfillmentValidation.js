/**
 * Fulfillment validation schemas using JOI
 */

import Joi from 'joi';

export const updateStockSchema = Joi.object({
  quantity: Joi.number().integer().min(0).required(),
});

export const reduceStockSchema = Joi.object({
  quantity: Joi.number().integer().positive().required(),
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

