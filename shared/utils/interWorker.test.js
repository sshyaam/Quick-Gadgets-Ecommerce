/**
 * Tests for interWorker utilities
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as interWorker from './interWorker.js';
import { createMockEnv, createMockRequest } from '../../test/setup.js';

describe('interWorker', () => {
  let mockEnv;
  let mockServiceBinding;

  beforeEach(() => {
    mockEnv = createMockEnv();
    
    // Create a mock service binding
    mockServiceBinding = {
      fetch: async (request) => {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    };
  });

  describe('callWorkerBinding', () => {
    it('should make request with correct headers', async () => {
      const apiKey = 'test-api-key';
      let capturedRequest;
      
      mockServiceBinding.fetch = async (request) => {
        capturedRequest = request;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      
      const response = await interWorker.callWorkerBinding(
        mockServiceBinding,
        '/test',
        {},
        apiKey
      );
      
      expect(response.status).to.equal(200);
      expect(capturedRequest.headers.get('X-API-Key')).to.equal(apiKey);
      expect(capturedRequest.headers.get('X-Worker-Request')).to.equal('true');
    });

    it('should throw error when service binding is missing', async () => {
      try {
        await interWorker.callWorkerBinding(null, '/test', {}, 'api-key');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Service binding is required');
      }
    });

    it('should handle POST requests with body', async () => {
      const apiKey = 'test-api-key';
      const body = { test: 'data' };
      
      let capturedRequest;
      mockServiceBinding.fetch = async (request) => {
        capturedRequest = request;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };
      
      await interWorker.callWorkerBinding(
        mockServiceBinding,
        '/test',
        { method: 'POST', body },
        apiKey
      );
      
      expect(capturedRequest.method).to.equal('POST');
      const requestBody = await capturedRequest.json();
      expect(requestBody).to.deep.equal(body);
    });

    it('should handle string body', async () => {
      const apiKey = 'test-api-key';
      const bodyString = 'test string';
      
      let capturedRequest;
      mockServiceBinding.fetch = async (request) => {
        capturedRequest = request;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };
      
      await interWorker.callWorkerBinding(
        mockServiceBinding,
        '/test',
        { method: 'POST', body: bodyString },
        apiKey
      );
      
      const requestBody = await capturedRequest.text();
      expect(requestBody).to.equal(bodyString);
    });

    it('should add custom headers', async () => {
      const apiKey = 'test-api-key';
      
      let capturedRequest;
      mockServiceBinding.fetch = async (request) => {
        capturedRequest = request;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };
      
      await interWorker.callWorkerBinding(
        mockServiceBinding,
        '/test',
        { headers: { 'Custom-Header': 'value' } },
        apiKey
      );
      
      expect(capturedRequest.headers.get('Custom-Header')).to.equal('value');
      expect(capturedRequest.headers.get('X-API-Key')).to.equal(apiKey);
    });
  });

  describe('getWorkerBinding', () => {
    it('should make GET request with query parameters', async () => {
      const apiKey = 'test-api-key';
      
      let capturedUrl;
      mockServiceBinding.fetch = async (request) => {
        capturedUrl = request.url;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };
      
      await interWorker.getWorkerBinding(
        mockServiceBinding,
        '/products',
        { page: 1, limit: 20 },
        apiKey
      );
      
      expect(capturedUrl).to.include('/products');
      expect(capturedUrl).to.include('page=1');
      expect(capturedUrl).to.include('limit=20');
    });

    it('should skip null/undefined query parameters', async () => {
      const apiKey = 'test-api-key';
      
      let capturedUrl;
      mockServiceBinding.fetch = async (request) => {
        capturedUrl = request.url;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };
      
      await interWorker.getWorkerBinding(
        mockServiceBinding,
        '/products',
        { page: 1, limit: null, category: undefined },
        apiKey
      );
      
      expect(capturedUrl).to.include('page=1');
      expect(capturedUrl).to.not.include('limit');
      expect(capturedUrl).to.not.include('category');
    });
  });

  describe('postWorkerBinding', () => {
    it('should make POST request with JSON body', async () => {
      const apiKey = 'test-api-key';
      const body = { productId: '123', quantity: 2 };
      
      let capturedRequest;
      mockServiceBinding.fetch = async (request) => {
        capturedRequest = request;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };
      
      await interWorker.postWorkerBinding(
        mockServiceBinding,
        '/cart/item',
        body,
        apiKey
      );
      
      expect(capturedRequest.method).to.equal('POST');
      const requestBody = await capturedRequest.json();
      expect(requestBody).to.deep.equal(body);
    });
  });

  describe('validateApiKey', () => {
    it('should return true for valid API key and worker request', () => {
      const request = createMockRequest('https://example.com/test', {
        headers: {
          'X-API-Key': 'valid-key',
          'X-Worker-Request': 'true'
        }
      });
      
      const isValid = interWorker.validateApiKey(request, 'valid-key');
      expect(isValid).to.be.true;
    });

    it('should return false for invalid API key', () => {
      const request = createMockRequest('https://example.com/test', {
        headers: {
          'X-API-Key': 'invalid-key',
          'X-Worker-Request': 'true'
        }
      });
      
      const isValid = interWorker.validateApiKey(request, 'valid-key');
      expect(isValid).to.be.false;
    });

    it('should return false when X-Worker-Request is missing', () => {
      const request = createMockRequest('https://example.com/test', {
        headers: {
          'X-API-Key': 'valid-key'
        }
      });
      
      const isValid = interWorker.validateApiKey(request, 'valid-key');
      expect(isValid).to.be.false;
    });

    it('should return false when X-Worker-Request is not "true"', () => {
      const request = createMockRequest('https://example.com/test', {
        headers: {
          'X-API-Key': 'valid-key',
          'X-Worker-Request': 'false'
        }
      });
      
      const isValid = interWorker.validateApiKey(request, 'valid-key');
      expect(isValid).to.be.false;
    });
  });

  describe('callWorker (deprecated)', () => {
    it('should throw error when API key is missing', async () => {
      try {
        await interWorker.callWorker('https://worker.example.com/test', {}, null);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('API key is required');
      }
    });
  });
});

