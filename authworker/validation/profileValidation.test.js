/**
 * Tests for profileValidation
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { updateProfileSchema, addressSchema } from './profileValidation.js';

describe('profileValidation', () => {
  describe('updateProfileSchema', () => {
    it('should validate valid profile update data', () => {
      const validData = {
        name: 'Updated Name',
        contactNumber: '9876543210',
      };
      
      const { error, value } = updateProfileSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value).to.have.property('name', 'Updated Name');
    });
    
    it('should validate profile image as base64 data URL', () => {
      const validData = {
        profileImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      };
      
      const { error } = updateProfileSchema.validate(validData);
      
      expect(error).to.be.undefined;
    });
    
    it('should validate profile image as HTTP URL', () => {
      const validData = {
        profileImage: 'https://example.com/image.png',
      };
      
      const { error } = updateProfileSchema.validate(validData);
      
      expect(error).to.be.undefined;
    });
    
    it('should reject invalid contact number format', () => {
      const invalidData = {
        contactNumber: '1234567890', // Starts with 1, should start with 6-9
      };
      
      const { error } = updateProfileSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should reject invalid profile image format', () => {
      const invalidData = {
        profileImage: 'invalid-image-url',
      };
      
      const { error } = updateProfileSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should require at least one field', () => {
      const invalidData = {};
      
      const { error } = updateProfileSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
  });
  
  describe('addressSchema', () => {
    it('should validate valid address data', () => {
      const validData = {
        name: 'John Doe',
        contactNumber: '9876543210',
        doorNumber: '123',
        street: 'Main St',
        area: 'Area Name',
        pincode: '400001',
        city: 'Mumbai',
        state: 'Maharashtra',
      };
      
      const { error, value } = addressSchema.validate(validData);
      
      expect(error).to.be.undefined;
      expect(value).to.have.property('name', 'John Doe');
    });
    
    it('should allow empty area field', () => {
      const validData = {
        name: 'John Doe',
        contactNumber: '9876543210',
        doorNumber: '123',
        street: 'Main St',
        area: '',
        pincode: '400001',
        city: 'Mumbai',
        state: 'Maharashtra',
      };
      
      const { error } = addressSchema.validate(validData);
      
      expect(error).to.be.undefined;
    });
    
    it('should reject missing required fields', () => {
      const invalidData = {
        name: 'John Doe',
        // Missing other required fields
      };
      
      const { error } = addressSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should reject invalid pincode format', () => {
      const invalidData = {
        name: 'John Doe',
        contactNumber: '9876543210',
        doorNumber: '123',
        street: 'Main St',
        pincode: '12345', // Invalid: not 6 digits
        city: 'Mumbai',
        state: 'Maharashtra',
      };
      
      const { error } = addressSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
    
    it('should reject invalid contact number format', () => {
      const invalidData = {
        name: 'John Doe',
        contactNumber: '1234567890', // Invalid: starts with 1
        doorNumber: '123',
        street: 'Main St',
        pincode: '400001',
        city: 'Mumbai',
        state: 'Maharashtra',
      };
      
      const { error } = addressSchema.validate(invalidData);
      
      expect(error).to.not.be.undefined;
    });
  });
});

