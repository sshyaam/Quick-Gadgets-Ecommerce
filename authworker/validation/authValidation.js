/**
 * Authentication validation schemas using JOI
 */

import Joi from 'joi';

export const signupSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(1).required(),
  contactNumber: Joi.string().pattern(/^[6-9]\d{9}$/).optional().messages({
    'string.pattern.base': 'Contact number must be a valid 10-digit Indian mobile number'
  }),
  address: Joi.object({
    name: Joi.string().min(1).required(),
    contactNumber: Joi.string().pattern(/^[6-9]\d{9}$/).required(),
    doorNumber: Joi.string().min(1).required(),
    street: Joi.string().min(1).required(),
    area: Joi.string().optional(),
    pincode: Joi.string().pattern(/^[1-9][0-9]{5}$/).required().messages({
      'string.pattern.base': 'Pincode must be a valid 6-digit Indian pincode'
    }),
    city: Joi.string().min(1).required(),
    state: Joi.string().min(1).required(),
  }).optional(),
  isAdmin: Joi.boolean().allow(true, false).default(false),
});

export const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().required(),
});

