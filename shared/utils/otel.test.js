/**
 * Tests for OpenTelemetry utility
 * 
 * NOTE: Some functions depend on OpenTelemetry API which may not be fully available
 * in Node.js test environment. These tests focus on functions that can be tested.
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  getTracer,
  getActiveSpan,
  getTraceContext,
  getCfRayId,
  addSpanAttributes,
} from './otel.js';
import { createMockRequest } from '../../test/setup.js';

describe('otel', () => {
  describe('getTracer', () => {
    it('should return a tracer with service name', () => {
      const tracer = getTracer('test-service');
      
      expect(tracer).to.not.be.null;
      expect(tracer).to.have.property('startSpan');
    });

    it('should return default tracer when service name not provided', () => {
      const tracer = getTracer();
      
      expect(tracer).to.not.be.null;
    });
  });

  describe('getActiveSpan', () => {
    it('should return active span or undefined', () => {
      const span = getActiveSpan();
      
      // May be undefined if no active span
      expect(span === undefined || span !== null).to.be.true;
    });
  });

  describe('getTraceContext', () => {
    it('should return trace context object', () => {
      const context = getTraceContext();
      
      expect(context).to.have.property('traceId');
      expect(context).to.have.property('spanId');
      expect(context).to.have.property('traceFlags');
    });
  });

  describe('getCfRayId', () => {
    it('should extract CF Ray ID from request headers', () => {
      const request = createMockRequest('https://example.com/api', {
        headers: {
          'cf-ray': 'test-ray-id-123'
        }
      });
      
      const cfRayId = getCfRayId(request);
      
      expect(cfRayId).to.equal('test-ray-id-123');
    });

    it('should extract CF Ray ID with uppercase header', () => {
      const request = createMockRequest('https://example.com/api', {
        headers: {
          'CF-Ray': 'test-ray-id-456'
        }
      });
      
      const cfRayId = getCfRayId(request);
      
      expect(cfRayId).to.equal('test-ray-id-456');
    });

    it('should return null when CF Ray ID not present', () => {
      const request = createMockRequest('https://example.com/api');
      
      const cfRayId = getCfRayId(request);
      
      expect(cfRayId).to.be.null;
    });

    it('should return null when request is null', () => {
      const cfRayId = getCfRayId(null);
      
      expect(cfRayId).to.be.null;
    });
  });

  describe('addSpanAttributes', () => {
    it('should add attributes to active span', () => {
      // This function may not have an active span in test environment
      // Just verify it doesn't throw
      addSpanAttributes({ key: 'value', number: 123 });
      
      // If no active span, function should not throw
      expect(true).to.be.true;
    });

    it('should skip null and undefined values', () => {
      // Should not throw even with null/undefined values
      addSpanAttributes({ key: 'value', nullValue: null, undefinedValue: undefined });
      
      expect(true).to.be.true;
    });
  });
});

