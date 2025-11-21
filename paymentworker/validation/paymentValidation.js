/**
 * Payment validation schemas using JOI
 */

import Joi from 'joi';

export const createOrderSchema = Joi.object({
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).uppercase().default('USD'),
  description: Joi.string().optional(),
  orderId: Joi.string().optional(), // Internal order ID
  returnUrl: Joi.string().uri().optional(), // PayPal return URL
  cancelUrl: Joi.string().uri().optional(), // PayPal cancel URL
});

export const captureOrderSchema = Joi.object({
  orderId: Joi.string().required(), // PayPal order ID
  internalOrderId: Joi.string().optional(), // Internal order ID for updating payment record
});

