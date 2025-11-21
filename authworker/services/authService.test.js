/**
 * Tests for authService
 * Note: ES modules cannot be stubbed with Sinon, so we use mock databases and encryption directly
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  signup,
  login,
  authenticate,
  refreshAccessToken,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
} from './authService.js';
import { createMockD1, createMockD1WithSequence, createMockEnv, createMockServiceBinding } from '../../test/setup.js';
import { AuthenticationError, ConflictError } from '../../shared/utils/errors.js';
import { encrypt } from '../../shared/utils/encryption.js';

describe('authService', () => {
  let mockDb;
  let mockEnv;
  
  beforeEach(() => {
    mockDb = createMockD1();
    mockEnv = createMockEnv();
  });
  
  describe('generateAccessToken', () => {
    it('should generate a valid JWT token', () => {
      const userId = 'test-user-id';
      const sessionId = 'test-session-id';
      const secret = 'test-secret';
      
      const token = generateAccessToken(userId, sessionId, secret);
      
      expect(token).to.be.a('string');
      expect(token.split('.')).to.have.length(3); // JWT has 3 parts
    });
  });
  
  describe('generateRefreshToken', () => {
    it('should generate a unique refresh token', () => {
      const token1 = generateRefreshToken();
      const token2 = generateRefreshToken();
      
      expect(token1).to.be.a('string');
      expect(token2).to.be.a('string');
      expect(token1).to.not.equal(token2);
    });
  });
  
  describe('verifyAccessToken', () => {
    it('should verify a valid token', () => {
      const userId = 'test-user-id';
      const sessionId = 'test-session-id';
      const secret = 'test-secret';
      
      const token = generateAccessToken(userId, sessionId, secret);
      const decoded = verifyAccessToken(token, secret);
      
      expect(decoded).to.have.property('userId', userId);
      expect(decoded).to.have.property('sessionId', sessionId);
      expect(decoded).to.have.property('type', 'access');
    });
    
    it('should throw error for invalid token', () => {
      try {
        verifyAccessToken('invalid-token', 'secret');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
      }
    });
    
    it('should throw error for wrong secret', () => {
      const token = generateAccessToken('user-id', 'session-id', 'secret1');
      
      try {
        verifyAccessToken(token, 'secret2');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
      }
    });
  });
  
  describe('signup', () => {
    it('should create a new user successfully', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      };
      
      // Mock database sequence: getUserByEmail returns empty (user doesn't exist)
      // Then createUser and createSession succeed
      mockDb = createMockD1WithSequence([
        { all: { results: [], success: true } }, // getUserByEmail - no existing user
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } }, // createUser
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } }, // createSession
      ]);
      
      // Mock log worker - create if it doesn't exist
      if (!mockEnv.log_worker) {
        mockEnv.log_worker = createMockServiceBinding('log-worker');
      }
      if (!mockEnv.log_worker) {
        mockEnv.log_worker = createMockServiceBinding('log-worker');
      }
      mockEnv.log_worker._setResponse('POST', '/log', { success: true });
      
      const result = await signup(
        userData,
        mockDb,
        mockEnv.ENCRYPTION_KEY,
        mockEnv.log_worker,
        mockEnv.INTER_WORKER_API_KEY
      );
      
      expect(result).to.have.property('userId');
      expect(result).to.have.property('sessionId');
      expect(result).to.have.property('accessToken');
      expect(result).to.have.property('refreshToken');
    });
    
    it('should throw ConflictError if user already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Existing User',
      };
      
      // Create encrypted user data
      const encryptedData = encrypt(JSON.stringify({ email: 'existing@example.com' }), mockEnv.ENCRYPTION_KEY);
      const existingUser = {
        user_id: 'existing-user-id',
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { all: { results: [existingUser], success: true } }, // getUserByEmail finds existing user
      ]);
      
      try {
        await signup(
          userData,
          mockDb,
          mockEnv.ENCRYPTION_KEY,
          mockEnv.log_worker,
          mockEnv.INTER_WORKER_API_KEY
        );
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).to.be.instanceOf(ConflictError);
        expect(error.message).to.include('already exists');
      }
    });
  });
  
  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const email = 'user@example.com';
      const password = 'correctpassword';
      
      // Hash the password
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Create encrypted user data with hashed password
      const userData = {
        email: 'user@example.com',
        password: passwordHash,
      };
      const encryptedData = encrypt(JSON.stringify(userData), mockEnv.ENCRYPTION_KEY);
      
      const mockUser = {
        user_id: 'user-id',
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { all: { results: [mockUser], success: true } }, // getUserByEmail
        { run: { success: true, meta: { changes: 1, last_row_id: 1 } } }, // createSession
      ]);
      
      if (!mockEnv.log_worker) {
        mockEnv.log_worker = createMockServiceBinding('log-worker');
      }
      mockEnv.log_worker._setResponse('POST', '/log', { success: true });
      
      const result = await login(
        email,
        password,
        mockDb,
        mockEnv.ENCRYPTION_KEY,
        mockEnv.log_worker,
        mockEnv.INTER_WORKER_API_KEY
      );
      
      expect(result).to.have.property('userId');
      expect(result).to.have.property('sessionId');
      expect(result).to.have.property('accessToken');
      expect(result).to.have.property('refreshToken');
    });
    
    it('should throw AuthenticationError for invalid email', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password';
      
      mockDb = createMockD1WithSequence([
        { all: { results: [], success: true } }, // getUserByEmail - no user found
      ]);
      
      try {
        await login(
          email,
          password,
          mockDb,
          mockEnv.ENCRYPTION_KEY,
          mockEnv.log_worker,
          mockEnv.INTER_WORKER_API_KEY
        );
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
      }
    });
    
    it('should throw AuthenticationError for invalid password', async () => {
      const email = 'user@example.com';
      const password = 'wrongpassword';
      
      // Create user with correct password hash
      const encoder = new TextEncoder();
      const data = encoder.encode('correctpassword');
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const correctPasswordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const userData = {
        email: 'user@example.com',
        password: correctPasswordHash,
      };
      const encryptedData = encrypt(JSON.stringify(userData), mockEnv.ENCRYPTION_KEY);
      
      const mockUser = {
        user_id: 'user-id',
        data: encryptedData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { all: { results: [mockUser], success: true } },
      ]);
      
      try {
        await login(
          email,
          password,
          mockDb,
          mockEnv.ENCRYPTION_KEY,
          mockEnv.log_worker,
          mockEnv.INTER_WORKER_API_KEY
        );
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
      }
    });
  });
  
  describe('authenticate', () => {
    it('should authenticate user with valid access token', async () => {
      const userId = 'user-id';
      const sessionId = 'session-id';
      const secret = mockEnv.ENCRYPTION_KEY;
      
      const accessToken = generateAccessToken(userId, sessionId, secret);
      
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const mockSession = {
        session_id: sessionId,
        user_id: userId,
        refresh_token: 'refresh-token',
        expires_at: futureDate,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      const mockUser = {
        user_id: userId,
        data: encrypt(JSON.stringify({ email: 'user@example.com' }), secret),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockSession }, // getSessionById
        { first: mockUser }, // getUserById
      ]);
      
      const result = await authenticate(
        accessToken,
        mockDb,
        secret
      );
      
      expect(result).to.have.property('userId', userId);
      expect(result).to.have.property('sessionId', sessionId);
    });
    
    it('should throw AuthenticationError for invalid token', async () => {
      try {
        await authenticate('invalid-token', mockDb, mockEnv.ENCRYPTION_KEY);
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
      }
    });
  });
  
  describe('refreshAccessToken', () => {
    it('should refresh access token with valid refresh token', async () => {
      const userId = 'user-id';
      const sessionId = 'session-id';
      const refreshToken = 'valid-refresh-token';
      const newRefreshToken = 'new-refresh-token';
      
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const mockSession = {
        session_id: sessionId,
        user_id: userId,
        refresh_token: refreshToken,
        expires_at: futureDate,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockSession }, // getSessionByRefreshToken
        { run: { success: true, meta: { changes: 1 } } }, // updateSessionRefreshToken
      ]);
      
      const result = await refreshAccessToken(
        refreshToken,
        mockDb,
        mockEnv.ENCRYPTION_KEY
      );
      
      expect(result).to.have.property('accessToken');
      expect(result).to.have.property('refreshToken');
      expect(result).to.have.property('sessionId', sessionId);
      // Note: refreshToken will be different (rotated)
    });
    
    it('should throw AuthenticationError for invalid refresh token', async () => {
      mockDb = createMockD1WithSequence([
        { first: null }, // getSessionByRefreshToken - not found
      ]);
      
      try {
        await refreshAccessToken(
          'invalid-token',
          mockDb,
          mockEnv.ENCRYPTION_KEY
        );
        expect.fail('Should have thrown AuthenticationError');
      } catch (error) {
        expect(error).to.be.instanceOf(AuthenticationError);
      }
    });
  });
});
