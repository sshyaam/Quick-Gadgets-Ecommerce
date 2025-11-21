/**
 * Tests for error classes and error handler
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  errorHandler,
} from './errors.js';
import { createMockRequest } from '../../test/setup.js';

describe('errors', () => {
  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error');
      
      expect(error).to.be.instanceOf(Error);
      expect(error).to.be.instanceOf(AppError);
      expect(error.message).to.equal('Test error');
      expect(error.statusCode).to.equal(500);
      expect(error.code).to.equal('INTERNAL_ERROR');
    });
    
    it('should create error with custom status code and code', () => {
      const error = new AppError('Custom error', 400, 'CUSTOM_CODE');
      
      expect(error.statusCode).to.equal(400);
      expect(error.code).to.equal('CUSTOM_CODE');
    });
  });
  
  describe('ValidationError', () => {
    it('should create validation error with default status', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error).to.be.instanceOf(AppError);
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.statusCode).to.equal(400);
      expect(error.code).to.equal('VALIDATION_ERROR');
      expect(error.details).to.deep.equal({});
    });
    
    it('should create validation error with details', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const error = new ValidationError('Invalid input', details);
      
      expect(error.details).to.deep.equal(details);
    });
  });
  
  describe('AuthenticationError', () => {
    it('should create authentication error', () => {
      const error = new AuthenticationError('Not authenticated');
      
      expect(error).to.be.instanceOf(AppError);
      expect(error).to.be.instanceOf(AuthenticationError);
      expect(error.statusCode).to.equal(401);
      expect(error.code).to.equal('AUTHENTICATION_ERROR');
    });
    
    it('should use default message if not provided', () => {
      const error = new AuthenticationError();
      
      expect(error.message).to.equal('Authentication required');
    });
  });
  
  describe('AuthorizationError', () => {
    it('should create authorization error', () => {
      const error = new AuthorizationError('Insufficient permissions');
      
      expect(error).to.be.instanceOf(AppError);
      expect(error).to.be.instanceOf(AuthorizationError);
      expect(error.statusCode).to.equal(403);
      expect(error.code).to.equal('AUTHORIZATION_ERROR');
    });
  });
  
  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('User');
      
      expect(error).to.be.instanceOf(AppError);
      expect(error).to.be.instanceOf(NotFoundError);
      expect(error.statusCode).to.equal(404);
      expect(error.code).to.equal('NOT_FOUND');
      expect(error.message).to.equal('User not found');
    });
    
    it('should use default resource name', () => {
      const error = new NotFoundError();
      
      expect(error.message).to.equal('Resource not found');
    });
  });
  
  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');
      
      expect(error).to.be.instanceOf(AppError);
      expect(error).to.be.instanceOf(ConflictError);
      expect(error.statusCode).to.equal(409);
      expect(error.code).to.equal('CONFLICT');
    });
  });
  
  describe('errorHandler', () => {
    it('should handle AppError correctly', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      const request = createMockRequest('https://example.com/api');
      
      const response = errorHandler(error, request);
      
      expect(response.status).to.equal(400);
      return response.json().then((body) => {
        expect(body.error.code).to.equal('VALIDATION_ERROR');
        expect(body.error.message).to.equal('Invalid input');
        expect(body.error.details).to.deep.equal({ field: 'email' });
      });
    });
    
    it('should handle unknown errors', async () => {
      const error = new Error('Unknown error');
      const request = createMockRequest('https://example.com/api');
      
      const response = errorHandler(error, request);
      
      expect(response.status).to.equal(500);
      const body = await response.json();
      expect(body.error).to.have.property('code');
      expect(body.error.code).to.equal('INTERNAL_ERROR');
      expect(body.error).to.have.property('message');
    });
    
    it('should handle errors without message', async () => {
      const error = new Error();
      const request = createMockRequest('https://example.com/api');
      
      const response = errorHandler(error, request);
      
      expect(response.status).to.equal(500);
      const body = await response.json();
      expect(body.error.code).to.equal('INTERNAL_ERROR');
      expect(body.error.message).to.equal('An unexpected error occurred');
    });
  });
});

