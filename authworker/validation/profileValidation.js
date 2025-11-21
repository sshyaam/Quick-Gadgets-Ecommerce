/**
 * Profile validation schemas using JOI
 */

import Joi from 'joi';

export const updateProfileSchema = Joi.object({
  name: Joi.string().min(1).optional(),
  contactNumber: Joi.string().pattern(/^[6-9]\d{9}$/).optional().messages({
    'string.pattern.base': 'Contact number must be a valid 10-digit Indian mobile number'
  }),
  profileImage: Joi.string().allow('').optional().custom((value, helpers) => {
    if (!value || value === '') return value;
    // Accept base64 data URLs (data:image/...) or regular URLs
    if (value.startsWith('data:image/') || value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    return helpers.error('string.custom', { message: 'Profile image must be a valid URL or base64 data URL' });
  }),
  address: Joi.object({
    name: Joi.string().min(1).optional(),
    contactNumber: Joi.string().pattern(/^[6-9]\d{9}$/).optional(),
    doorNumber: Joi.string().min(1).optional(),
    street: Joi.string().min(1).optional(),
    area: Joi.string().optional(),
    pincode: Joi.string().pattern(/^[1-9][0-9]{5}$/).optional().messages({
      'string.pattern.base': 'Pincode must be a valid 6-digit Indian pincode'
    }),
    city: Joi.string().min(1).optional(),
    state: Joi.string().min(1).optional(),
  }).optional(),
}).min(1); // At least one field must be provided

// Separate schema for address saving (required fields)
export const addressSchema = Joi.object({
  name: Joi.string().min(1).required().messages({
    'string.empty': 'Recipient name is required',
    'any.required': 'Recipient name is required'
  }),
  contactNumber: Joi.string().pattern(/^[6-9]\d{9}$/).required().messages({
    'string.empty': 'Contact number is required',
    'string.pattern.base': 'Contact number must be a valid 10-digit Indian mobile number (starting with 6-9)',
    'any.required': 'Contact number is required'
  }),
  doorNumber: Joi.string().min(1).required().messages({
    'string.empty': 'Door/Flat number is required',
    'any.required': 'Door/Flat number is required'
  }),
  street: Joi.string().min(1).required().messages({
    'string.empty': 'Street is required',
    'any.required': 'Street is required'
  }),
  area: Joi.string().allow('').optional(),
  pincode: Joi.string().pattern(/^[1-9][0-9]{5}$/).required().messages({
    'string.empty': 'Pincode is required',
    'string.pattern.base': 'Pincode must be a valid 6-digit Indian pincode',
    'any.required': 'Pincode is required'
  }),
  city: Joi.string().min(1).required().messages({
    'string.empty': 'City is required',
    'any.required': 'City is required'
  }),
  state: Joi.string().min(1).required().messages({
    'string.empty': 'State is required',
    'any.required': 'State is required'
  }),
});

