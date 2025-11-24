/**
 * Tests for database utility
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import {
  executeTransaction,
  softDelete,
  queryJsonbField,
} from './database.js';
import { createMockD1, createMockD1WithSequence } from '../../test/setup.js';

describe('database', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockD1();
  });

  describe('executeTransaction', () => {
    it('should execute callback and return result', async () => {
      const callback = async (db) => {
        return { success: true, data: 'test' };
      };
      
      const result = await executeTransaction(mockDb, callback);
      
      expect(result).to.have.property('success', true);
      expect(result).to.have.property('data', 'test');
    });

    it('should throw error when db is null', async () => {
      const callback = async (db) => {
        return { success: true };
      };
      
      try {
        await executeTransaction(null, callback);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Database instance');
      }
    });

    it('should throw error when callback is not a function', async () => {
      try {
        await executeTransaction(mockDb, 'not-a-function');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('callback function');
      }
    });

    it('should propagate errors from callback', async () => {
      const callback = async (db) => {
        throw new Error('Callback error');
      };
      
      try {
        await executeTransaction(mockDb, callback);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Callback error');
      }
    });
  });

  describe('softDelete', () => {
    it('should soft delete a record', async () => {
      const table = 'products';
      const idColumn = 'product_id';
      const id = 'product-123';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 1 } } }
      ]);
      
      const result = await softDelete(mockDb, table, idColumn, id);
      
      expect(result).to.be.true;
    });

    it('should return false when record not found', async () => {
      const table = 'products';
      const idColumn = 'product_id';
      const id = 'non-existent';
      
      mockDb = createMockD1WithSequence([
        { run: { success: true, meta: { changes: 0 } } }
      ]);
      
      const result = await softDelete(mockDb, table, idColumn, id);
      
      expect(result).to.be.false;
    });
  });

  describe('queryJsonbField', () => {
    it('should create prepared statement for JSONB query', () => {
      const table = 'products';
      const jsonbColumn = 'data';
      const jsonPath = '$.category';
      const value = 'Electronics';
      
      // queryJsonbField calls db.prepare().bind(), so it returns the bound statement
      // which has first, run, all methods (not bind)
      const statement = queryJsonbField(mockDb, table, jsonbColumn, jsonPath, value);
      
      expect(statement).to.not.be.null;
      // The statement is the result of .bind(), which has first, run, all methods
      expect(statement).to.have.property('first');
      expect(statement).to.have.property('run');
      expect(statement).to.have.property('all');
      expect(typeof statement.first).to.equal('function');
    });

    it('should handle non-string values', () => {
      const table = 'products';
      const jsonbColumn = 'data';
      const jsonPath = '$.price';
      const value = 100;
      
      const statement = queryJsonbField(mockDb, table, jsonbColumn, jsonPath, value);
      
      expect(statement).to.not.be.null;
    });
  });
});

