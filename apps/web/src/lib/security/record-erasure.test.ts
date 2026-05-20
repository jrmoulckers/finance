// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  checkRetentionPolicy,
  createErasureRequest,
  determineCascadeActions,
  generateErasureReceipt,
  updateErasureStatus,
} from './record-erasure';

describe('record-erasure', () => {
  describe('checkRetentionPolicy', () => {
    it('allows erasure for budget records (no retention)', () => {
      const result = checkRetentionPolicy('budget', new Date().toISOString());
      expect(result.canErase).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('allows erasure for goal records (no retention)', () => {
      const result = checkRetentionPolicy('goal', new Date().toISOString());
      expect(result.canErase).toBe(true);
    });

    it('blocks erasure for recent transaction records', () => {
      const result = checkRetentionPolicy('transaction', new Date().toISOString());
      expect(result.canErase).toBe(false);
      expect(result.reason).toContain('retention period');
      expect(result.retentionExpiresAt).toBeTruthy();
    });

    it('allows erasure for old transaction records past retention', () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 8); // 8 years ago
      const result = checkRetentionPolicy('transaction', oldDate.toISOString());
      expect(result.canErase).toBe(true);
    });

    it('allows erasure with override regardless of retention', () => {
      const result = checkRetentionPolicy('transaction', new Date().toISOString(), true);
      expect(result.canErase).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  describe('determineCascadeActions', () => {
    it('returns cascade actions for transaction erasure', () => {
      const actions = determineCascadeActions('transaction');
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some((a) => a.includes('balance'))).toBe(true);
    });

    it('returns cascade actions for account erasure', () => {
      const actions = determineCascadeActions('account');
      expect(actions.some((a) => a.includes('transactions'))).toBe(true);
    });

    it('returns cascade actions for category erasure', () => {
      const actions = determineCascadeActions('category');
      expect(actions.some((a) => a.includes('Uncategorized'))).toBe(true);
    });
  });

  describe('createErasureRequest', () => {
    it('creates a request with pending status and cascade actions', () => {
      const request = createErasureRequest('transaction', 'tx-123', 'User requested deletion');
      expect(request.id).toBeTruthy();
      expect(request.status).toBe('pending');
      expect(request.recordType).toBe('transaction');
      expect(request.recordId).toBe('tx-123');
      expect(request.reason).toBe('User requested deletion');
      expect(request.cascadeActions.length).toBeGreaterThan(0);
      expect(request.completedAt).toBeNull();
    });
  });

  describe('updateErasureStatus', () => {
    it('updates status to completed with timestamp', () => {
      const request = createErasureRequest('budget', 'b-1', 'cleanup');
      const completed = updateErasureStatus(request, 'completed');
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeTruthy();
    });

    it('updates status to rejected without timestamp', () => {
      const request = createErasureRequest('budget', 'b-1', 'cleanup');
      const rejected = updateErasureStatus(request, 'rejected');
      expect(rejected.status).toBe('rejected');
      expect(rejected.completedAt).toBeNull();
    });
  });

  describe('generateErasureReceipt', () => {
    it('generates a valid JSON receipt', () => {
      const request = createErasureRequest('transaction', 'tx-123', 'GDPR request');
      const completed = updateErasureStatus(request, 'completed');
      const receipt = generateErasureReceipt(completed);

      const parsed = JSON.parse(receipt);
      expect(parsed.type).toBe('erasure_receipt');
      expect(parsed.requestId).toBe(completed.id);
      expect(parsed.recordType).toBe('transaction');
      expect(parsed.status).toBe('completed');
    });

    it('does not contain actual financial data', () => {
      const request = createErasureRequest('transaction', 'tx-123', 'cleanup');
      const receipt = generateErasureReceipt(request);
      // Verify no financial amounts or account numbers appear in the receipt
      expect(receipt).not.toMatch(/\$\d+/);
      expect(receipt).not.toMatch(/\d{4}-\d{4}-\d{4}/);
    });
  });
});
