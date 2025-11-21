/**
 * Order validation schemas using JOI
 */

import Joi from 'joi';

export const createOrderSchema = Joi.object({
  address: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    zipCode: Joi.string().required(),
    country: Joi.string().required(),
  }).required(),
  shippingMode: Joi.string().valid('standard', 'express').optional(), // Deprecated: use itemShippingModes instead
  itemShippingModes: Joi.object().unknown(true).optional().default({}), // Per-item shipping modes: { productId: 'standard' | 'express' }
}).unknown(false);

