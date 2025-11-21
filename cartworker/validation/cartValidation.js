/**
 * Cart validation schemas using JOI
 */

import Joi from 'joi';

export const addItemSchema = Joi.object({
  productId: Joi.string().required(),
  quantity: Joi.number().integer().positive().required(),
});

export const updateItemSchema = Joi.object({
  quantity: Joi.number().integer().positive().required(),
});

