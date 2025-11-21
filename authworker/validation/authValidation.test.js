/**
 * Tests for auth validation schemas
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { signupSchema, loginSchema } from './authValidation.js';

describe('authValidation', () => {
  describe('signupSchema', () => {
    it('should validate correct signup data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };
      
      const { error } = signupSchema.validate(validData);
      expect(error).to.be.undefined;
    });
    
    it('should validate signup data with all fields', () => {
      const validData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        contactNumber: '9876543210',
        address: {
          name: 'Home',
          contactNumber: '9876543210',
          doorNumber: '123',
          street: 'Main Street',
          area: 'Downtown',
          pincode: '123456',
          city: 'Mumbai',
          state: 'Maharashtra',
        },
        isAdmin: false,
      };
      
      const { error } = signupSchema.validate(validData);
      expect(error).to.be.undefined;
    });
    
    it('should reject invalid email', () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'password123',
        name: 'Test User',
      };
      
      const { error } = signupSchema.validate(invalidData);
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('email');
    });
    
    it('should reject short password', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'short',
        name: 'Test User',
      };
      
      const { error } = signupSchema.validate(invalidData);
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('password');
    });
    
    it('should reject missing required fields', () => {
      const invalidData = {
        email: 'test@example.com',
        // missing password and name
      };
      
      const { error } = signupSchema.validate(invalidData);
      expect(error).to.not.be.undefined;
    });
    
    it('should reject invalid contact number', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        contactNumber: '12345', // invalid format
      };
      
      const { error } = signupSchema.validate(invalidData);
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('contactNumber');
    });
    
    it('should reject invalid pincode in address', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        address: {
          name: 'Home',
          contactNumber: '9876543210',
          doorNumber: '123',
          street: 'Main Street',
          pincode: '12345', // invalid (must be 6 digits)
          city: 'Mumbai',
          state: 'Maharashtra',
        },
      };
      
      const { error } = signupSchema.validate(invalidData);
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('pincode');
    });
    
    it('should set default isAdmin to false', () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };
      
      const { value } = signupSchema.validate(data);
      expect(value.isAdmin).to.be.false;
    });
  });
  
  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'password123',
      };
      
      const { error } = loginSchema.validate(validData);
      expect(error).to.be.undefined;
    });
    
    it('should reject invalid email', () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'password123',
      };
      
      const { error } = loginSchema.validate(invalidData);
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('email');
    });
    
    it('should reject missing email', () => {
      const invalidData = {
        password: 'password123',
      };
      
      const { error } = loginSchema.validate(invalidData);
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('email');
    });
    
    it('should reject missing password', () => {
      const invalidData = {
        email: 'test@example.com',
      };
      
      const { error } = loginSchema.validate(invalidData);
      expect(error).to.not.be.undefined;
      expect(error.details[0].path).to.include('password');
    });
  });
});

