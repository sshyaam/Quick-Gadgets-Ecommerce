/**
 * Tests for imageController
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as imageController from './imageController.js';
import { ValidationError } from '../../shared/utils/errors.js';
import { createMockEnv, createMockRequest, createMockR2 } from '../../test/setup.js';

describe('imageController', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockEnv.product_images = createMockR2();
    mockEnv.CATALOG_WORKER_URL = 'https://catalog-worker.test';
  });

  describe('uploadImage', () => {
    it('should throw ValidationError when no file provided', async () => {
      const formData = new FormData();
      const request = new Request('https://example.com/admin/images/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      // Mock auth to pass - adminAuth calls /profile endpoint via service binding
      // adminAuth uses: authWorker.fetch('https://workers.dev/profile', ...)
      // The service binding mock extracts pathname from URL, so '/profile' is the key
      mockEnv.auth_worker._setResponse('GET', '/profile', { userId: 'admin-1', isAdmin: true });
      
      try {
        await imageController.uploadImage(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('No image file provided');
      }
    });

    it('should throw ValidationError when file is not an image', async () => {
      const file = new File(['data'], 'test.txt', { type: 'text/plain' });
      const formData = new FormData();
      formData.append('image', file);
      
      const request = new Request('https://example.com/admin/images/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      // Mock auth to pass - adminAuth calls /profile endpoint via service binding
      // adminAuth uses: authWorker.fetch('https://workers.dev/profile', ...)
      // The service binding mock extracts pathname from URL, so '/profile' is the key
      mockEnv.auth_worker._setResponse('GET', '/profile', { userId: 'admin-1', isAdmin: true });
      
      try {
        await imageController.uploadImage(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('File must be an image');
      }
    });

    it('should throw ValidationError when file size exceeds limit', async () => {
      const largeData = new ArrayBuffer(6 * 1024 * 1024); // 6MB
      const file = new File([largeData], 'large.jpg', { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('image', file);
      
      const request = new Request('https://example.com/admin/images/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      // Mock auth to pass - adminAuth calls /profile endpoint via service binding
      // adminAuth uses: authWorker.fetch('https://workers.dev/profile', ...)
      // The service binding mock extracts pathname from URL, so '/profile' is the key
      mockEnv.auth_worker._setResponse('GET', '/profile', { userId: 'admin-1', isAdmin: true });
      
      try {
        await imageController.uploadImage(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('Image size must be less than 5MB');
      }
    });
  });

  describe('serveImage', () => {
    it('should serve image from R2', async () => {
      const objectKey = 'products/test-image.jpg';
      const imageData = new ArrayBuffer(100);
      mockEnv.product_images._setData(objectKey, {
        body: imageData,
        httpMetadata: { contentType: 'image/jpeg' }
      });
      
      const request = createMockRequest(`https://example.com/images/${objectKey}`);
      
      const response = await imageController.serveImage(request, mockEnv);
      
      expect(response.status).to.equal(200);
      expect(response.headers.get('Content-Type')).to.equal('image/jpeg');
      expect(response.headers.get('Cache-Control')).to.include('max-age=31536000');
    });

    it('should return 400 for invalid image path', async () => {
      const request = createMockRequest('https://example.com/images');
      
      const response = await imageController.serveImage(request, mockEnv);
      
      expect(response.status).to.equal(400);
      const text = await response.text();
      expect(text).to.include('Invalid image path');
    });

    it('should return 403 for non-product images', async () => {
      const request = createMockRequest('https://example.com/images/other/test.jpg');
      
      const response = await imageController.serveImage(request, mockEnv);
      
      expect(response.status).to.equal(403);
      const text = await response.text();
      expect(text).to.include('Access denied');
    });

    it('should return 404 when image not found', async () => {
      const objectKey = 'products/non-existent.jpg';
      const request = createMockRequest(`https://example.com/images/${objectKey}`);
      
      const response = await imageController.serveImage(request, mockEnv);
      
      expect(response.status).to.equal(404);
      const text = await response.text();
      expect(text).to.include('Image not found');
    });

    it('should use default content type when not specified', async () => {
      const objectKey = 'products/test-image.jpg';
      const imageData = new ArrayBuffer(100);
      mockEnv.product_images._setData(objectKey, {
        body: imageData,
        httpMetadata: {}
      });
      
      const request = createMockRequest(`https://example.com/images/${objectKey}`);
      
      const response = await imageController.serveImage(request, mockEnv);
      
      expect(response.status).to.equal(200);
      expect(response.headers.get('Content-Type')).to.equal('image/jpeg');
    });
  });

  describe('deleteImage', () => {
    it('should throw ValidationError for invalid path', async () => {
      const request = createMockRequest('https://example.com/admin/images', {
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      // Mock auth to pass - adminAuth calls /profile endpoint via service binding
      // adminAuth uses: authWorker.fetch('https://workers.dev/profile', ...)
      // The service binding mock extracts pathname from URL, so '/profile' is the key
      mockEnv.auth_worker._setResponse('GET', '/profile', { userId: 'admin-1', isAdmin: true });
      
      try {
        await imageController.deleteImage(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('Invalid image path');
      }
    });

    it('should throw ValidationError for non-product images', async () => {
      const request = createMockRequest('https://example.com/admin/images/other/test.jpg', {
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });
      
      // Mock auth to pass - adminAuth calls /profile endpoint via service binding
      // adminAuth uses: authWorker.fetch('https://workers.dev/profile', ...)
      // The service binding mock extracts pathname from URL, so '/profile' is the key
      mockEnv.auth_worker._setResponse('GET', '/profile', { userId: 'admin-1', isAdmin: true });
      
      try {
        await imageController.deleteImage(request, mockEnv);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect(error.message).to.include('Access denied');
      }
    });
  });
});

