// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  ALL_DATA_CATEGORIES,
  DATA_CATEGORY_DESCRIPTIONS,
  buildDataInventory,
  createDataAccessRequest,
  generateExportPackage,
  serializeExportPackage,
  updateRequestStatus,
} from './data-access';
import type { DataCategory } from './types';

describe('data-access', () => {
  describe('createDataAccessRequest', () => {
    it('creates a request with pending status', () => {
      const request = createDataAccessRequest(['accounts', 'transactions']);
      expect(request.id).toBeTruthy();
      expect(request.status).toBe('pending');
      expect(request.categories).toEqual(['accounts', 'transactions']);
      expect(request.completedAt).toBeNull();
      expect(request.format).toBe('json');
    });

    it('uses specified format', () => {
      const request = createDataAccessRequest(['accounts'], 'csv');
      expect(request.format).toBe('csv');
    });

    it('throws on empty categories', () => {
      expect(() => createDataAccessRequest([])).toThrow(
        'At least one data category must be selected',
      );
    });
  });

  describe('updateRequestStatus', () => {
    it('advances status to processing', () => {
      const request = createDataAccessRequest(['accounts']);
      const updated = updateRequestStatus(request, 'processing');
      expect(updated.status).toBe('processing');
      expect(updated.completedAt).toBeNull();
    });

    it('sets completedAt when status is completed', () => {
      const request = createDataAccessRequest(['accounts']);
      const updated = updateRequestStatus(request, 'completed');
      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeTruthy();
    });
  });

  describe('buildDataInventory', () => {
    it('counts records per category', () => {
      const inventory = buildDataInventory({
        accounts: [{ id: '1' }, { id: '2' }],
        transactions: [{ id: '3' }],
      });
      expect(inventory.accounts).toBe(2);
      expect(inventory.transactions).toBe(1);
      expect(inventory.budgets).toBe(0);
    });

    it('returns zero for all categories with empty sources', () => {
      const inventory = buildDataInventory({});
      for (const cat of ALL_DATA_CATEGORIES) {
        expect(inventory[cat]).toBe(0);
      }
    });
  });

  describe('generateExportPackage', () => {
    it('generates package with only requested categories', () => {
      const request = createDataAccessRequest(['accounts']);
      const pkg = generateExportPackage(request, {
        accounts: [{ id: '1', name: 'Checking' }],
        transactions: [{ id: '99' }],
      });

      expect(pkg.meta.categories).toEqual(['accounts']);
      expect(pkg.data.accounts).toHaveLength(1);
      expect(pkg.data.transactions).toBeUndefined();
      expect(pkg.meta.totalRecords).toBe(1);
    });

    it('handles missing data sources gracefully', () => {
      const request = createDataAccessRequest(['budgets']);
      const pkg = generateExportPackage(request, {});
      expect(pkg.data.budgets).toEqual([]);
      expect(pkg.meta.totalRecords).toBe(0);
    });
  });

  describe('serializeExportPackage', () => {
    it('produces valid JSON', () => {
      const request = createDataAccessRequest(['accounts']);
      const pkg = generateExportPackage(request, { accounts: [{ id: '1' }] });
      const json = serializeExportPackage(pkg);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('constants', () => {
    it('ALL_DATA_CATEGORIES contains all expected categories', () => {
      expect(ALL_DATA_CATEGORIES).toContain('accounts');
      expect(ALL_DATA_CATEGORIES).toContain('transactions');
      expect(ALL_DATA_CATEGORIES).toContain('audit_log');
      expect(ALL_DATA_CATEGORIES.length).toBe(8);
    });

    it('DATA_CATEGORY_DESCRIPTIONS has entry for every category', () => {
      for (const cat of ALL_DATA_CATEGORIES) {
        expect(DATA_CATEGORY_DESCRIPTIONS[cat as DataCategory]).toBeTruthy();
      }
    });
  });
});
