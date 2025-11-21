/**
 * Tests for sessionModel
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  createSession,
  getSessionById,
  getSessionByRefreshToken,
  updateSessionRefreshToken,
  deleteSession,
} from './sessionModel.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('sessionModel', () => {
  let mockDb;
  
  beforeEach(() => {
    mockDb = createMockD1();
  });
  
  describe('createSession', () => {
    it('should create a session successfully', async () => {
      const userId = 'test-user-id';
      const refreshToken = 'refresh-token-123';
      
      mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1, last_row_id: 1 },
          },
        },
      ]);
      
      const result = await createSession(mockDb, userId, refreshToken);
      
      expect(result).to.have.property('sessionId');
      expect(result).to.have.property('userId', userId);
      expect(result).to.have.property('expiresAt');
      expect(result).to.have.property('createdAt');
      expect(result.sessionId).to.be.a('string');
    });
    
    it('should throw error if database operation fails', async () => {
      mockDb = createMockD1WithSequence([
        {
          run: {
            success: false,
            meta: { changes: 0 },
          },
        },
      ]);
      
      try {
        await createSession(mockDb, 'user-id', 'token');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to create session');
      }
    });
  });
  
  describe('getSessionById', () => {
    it('should return session when found and not expired', async () => {
      const sessionId = 'test-session-id';
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const mockSession = {
        session_id: sessionId,
        user_id: 'user-id',
        refresh_token: 'refresh-token',
        expires_at: futureDate,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockSession },
      ]);
      
      const result = await getSessionById(mockDb, sessionId);
      
      expect(result).to.not.be.null;
      expect(result.session_id).to.equal(sessionId);
    });
    
    it('should return null when session not found', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getSessionById(mockDb, 'non-existent-id');
      
      expect(result).to.be.null;
    });
    
    it('should return null when session is expired', async () => {
      const sessionId = 'expired-session-id';
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const mockSession = {
        session_id: sessionId,
        user_id: 'user-id',
        refresh_token: 'refresh-token',
        expires_at: pastDate,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockSession },
      ]);
      
      const result = await getSessionById(mockDb, sessionId);
      
      expect(result).to.be.null;
    });
  });
  
  describe('getSessionByRefreshToken', () => {
    it('should return session when found and not expired', async () => {
      const refreshToken = 'valid-refresh-token';
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const mockSession = {
        session_id: 'session-id',
        user_id: 'user-id',
        refresh_token: refreshToken,
        expires_at: futureDate,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      
      mockDb = createMockD1WithSequence([
        { first: mockSession },
      ]);
      
      const result = await getSessionByRefreshToken(mockDb, refreshToken);
      
      expect(result).to.not.be.null;
      expect(result.refresh_token).to.equal(refreshToken);
    });
    
    it('should return null when token not found', async () => {
      mockDb = createMockD1WithSequence([
        { first: null },
      ]);
      
      const result = await getSessionByRefreshToken(mockDb, 'invalid-token');
      
      expect(result).to.be.null;
    });
  });
  
  describe('updateSessionRefreshToken', () => {
    it('should update refresh token successfully', async () => {
      const sessionId = 'test-session-id';
      const newRefreshToken = 'new-refresh-token';
      
      mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 },
          },
        },
      ]);
      
      const result = await updateSessionRefreshToken(mockDb, sessionId, newRefreshToken);
      
      expect(result).to.be.true;
    });
    
    it('should return false if session not found', async () => {
      mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 0 },
          },
        },
      ]);
      
      const result = await updateSessionRefreshToken(mockDb, 'non-existent', 'token');
      
      expect(result).to.be.false;
    });
  });
  
  describe('deleteSession', () => {
    it('should soft delete session successfully', async () => {
      const sessionId = 'test-session-id';
      
      mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 1 },
          },
        },
      ]);
      
      const result = await deleteSession(mockDb, sessionId);
      
      expect(result).to.be.true;
    });
    
    it('should return false if session not found', async () => {
      mockDb = createMockD1WithSequence([
        {
          run: {
            success: true,
            meta: { changes: 0 },
          },
        },
      ]);
      
      const result = await deleteSession(mockDb, 'non-existent');
      
      expect(result).to.be.false;
    });
  });
});

