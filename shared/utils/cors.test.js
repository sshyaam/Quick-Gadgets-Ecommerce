/**
 * Tests for CORS utility
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import * as cors from './cors.js';
import { createMockRequest } from '../../test/setup.js';

describe('cors', () => {
  describe('addCorsHeaders', () => {
    it('should add CORS headers to response with origin', () => {
      const request = createMockRequest('https://example.com/api', {
        headers: {
          'Origin': 'https://frontend.example.com'
        }
      });
      
      const response = new Response('{"success": true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      
      const corsResponse = cors.addCorsHeaders(response, request);
      
      expect(corsResponse.headers.get('Access-Control-Allow-Origin')).to.equal('https://frontend.example.com');
      expect(corsResponse.headers.get('Access-Control-Allow-Credentials')).to.equal('true');
      expect(corsResponse.headers.get('Access-Control-Allow-Methods')).to.include('GET');
      expect(corsResponse.headers.get('Access-Control-Allow-Methods')).to.include('POST');
    });

    it('should add CORS headers with wildcard when no origin', () => {
      const request = createMockRequest('https://example.com/api');
      
      const response = new Response('{"success": true}', {
        status: 200
      });
      
      const corsResponse = cors.addCorsHeaders(response, request);
      
      expect(corsResponse.headers.get('Access-Control-Allow-Origin')).to.equal('*');
      expect(corsResponse.headers.get('Access-Control-Allow-Credentials')).to.equal('true');
    });

    it('should preserve response status and body', () => {
      const request = createMockRequest('https://example.com/api');
      const body = '{"test": "data"}';
      const response = new Response(body, {
        status: 201,
        statusText: 'Created'
      });
      
      const corsResponse = cors.addCorsHeaders(response, request);
      
      expect(corsResponse.status).to.equal(201);
      expect(corsResponse.statusText).to.equal('Created');
    });
  });

  describe('handleOptions', () => {
    it('should return preflight response with origin', () => {
      const request = createMockRequest('https://example.com/api', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://frontend.example.com'
        }
      });
      
      const response = cors.handleOptions(request);
      
      expect(response.status).to.equal(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).to.equal('https://frontend.example.com');
      expect(response.headers.get('Access-Control-Allow-Credentials')).to.equal('true');
      expect(response.headers.get('Access-Control-Allow-Methods')).to.include('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).to.include('POST');
    });

    it('should return preflight response with wildcard when no origin', () => {
      const request = createMockRequest('https://example.com/api', {
        method: 'OPTIONS'
      });
      
      const response = cors.handleOptions(request);
      
      expect(response.status).to.equal(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).to.equal('*');
    });

    it('should include all required CORS headers', () => {
      const request = createMockRequest('https://example.com/api', {
        method: 'OPTIONS'
      });
      
      const response = cors.handleOptions(request);
      
      expect(response.headers.get('Access-Control-Allow-Headers')).to.include('Content-Type');
      expect(response.headers.get('Access-Control-Allow-Headers')).to.include('Authorization');
      expect(response.headers.get('Access-Control-Expose-Headers')).to.include('Set-Cookie');
      expect(response.headers.get('Access-Control-Max-Age')).to.equal('86400');
    });
  });
});

