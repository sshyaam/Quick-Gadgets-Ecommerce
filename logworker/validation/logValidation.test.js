/**
 * Tests for logValidation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { logSchema } from './logValidation.js';

describe('logValidation', () => {
  describe('logSchema', () => {
    it('should validate valid log entry', () => {
      const data = {
        level: 'event',
        message: 'Test log message',
        metadata: { key: 'value' },
        worker: 'test-worker'
      };
      
      const { error } = logSchema.validate(data);
      
      expect(error).to.be.undefined;
    });

    it('should validate with trace context fields', () => {
      const data = {
        level: 'debug',
        message: 'Test log',
        traceId: 'trace-123',
        spanId: 'span-456',
        cfRayId: 'cf-ray-789'
      };
      
      const { error } = logSchema.validate(data);
      
      expect(error).to.be.undefined;
    });

    it('should reject invalid level', () => {
      const data = {
        level: 'invalid',
        message: 'Test log'
      };
      
      const { error } = logSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('must be one of');
    });

    it('should reject missing level', () => {
      const data = {
        message: 'Test log'
      };
      
      const { error } = logSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('required');
    });

    it('should reject missing message', () => {
      const data = {
        level: 'event'
      };
      
      const { error } = logSchema.validate(data);
      
      expect(error).to.not.be.undefined;
      expect(error.details[0].message).to.include('required');
    });

    it('should allow null trace context fields', () => {
      const data = {
        level: 'error',
        message: 'Test log',
        traceId: null,
        spanId: null,
        cfRayId: null
      };
      
      const { error } = logSchema.validate(data);
      
      expect(error).to.be.undefined;
    });

    it('should allow additional fields', () => {
      const data = {
        level: 'event',
        message: 'Test log',
        customField: 'custom value',
        anotherField: 123
      };
      
      const { error } = logSchema.validate(data);
      
      expect(error).to.be.undefined;
    });
  });
});

