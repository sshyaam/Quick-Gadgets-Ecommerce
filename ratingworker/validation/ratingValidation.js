/**
 * Rating validation schemas using JOI
 */

import Joi from 'joi';

export const createRatingSchema = Joi.object({
  orderId: Joi.string().required(),
  productId: Joi.string().required(),
  userId: Joi.string().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  title: Joi.string().min(1).max(200).optional(),
  comment: Joi.string().max(2000).optional(),
});

