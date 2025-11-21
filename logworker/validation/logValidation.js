/**
 * Log validation schemas using JOI
 */

import Joi from 'joi';

export const logSchema = Joi.object({
  level: Joi.string().valid('event', 'debug', 'error').required(),
  message: Joi.string().required(),
  metadata: Joi.object().optional(),
  timestamp: Joi.string().isoDate().optional(),
  worker: Joi.string().optional(),
  // Trace context fields (from OpenTelemetry)
  traceId: Joi.string().allow(null).optional(),
  spanId: Joi.string().allow(null).optional(),
  cfRayId: Joi.string().allow(null).optional(),
}).unknown(true); // Allow additional fields for flexibility

