/**
 * Pricing validation schemas using JOI
 */

import Joi from 'joi';

export const setPriceSchema = Joi.object({
  price: Joi.number().positive().required(),
  currency: Joi.string().length(3).uppercase().default('USD'),
});

export const updatePriceSchema = Joi.object({
  price: Joi.number().positive().required(),
});

