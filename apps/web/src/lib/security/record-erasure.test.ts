// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi } from 'vitest';
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
      // The receipt embeds a random requestId (crypto.randomUUID()). A random
      // v4 UUID lands three 4-digit groups separated by hyphens ~1.3% of the
      // time (e.g. "1234-5678-9012"), which used to trip the account-number
      // assertion below and fail this test on unrelated CI runs. Pin the id to
      // a digit-group-free value so the receipt is deterministic and the
      // assertions reflect only real record data. (#3206)
      const fixedRequestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const uuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(fixedRequestId);

      try {
        const request = createErasureRequest('transaction', 'tx-123', 'cleanup');
        const receipt = generateErasureReceipt(request);
        const parsed = JSON.parse(receipt);

        // The receipt is metadata-only: it must never embed monetary amounts
        // or account-number-formatted strings from the erased record.
        expect(receipt).not.toMatch(/\$\d/); // no dollar amounts
        expect(receipt).not.toMatch(/\d{4}-\d{4}-\d{4}/); // no account numbers

        // Strengthen the guarantee structurally: only known-safe metadata keys
        // may be serialized, so a future change that spills a raw record field
        // (amount, balance, account number) fails here instead of silently
        // leaking into the receipt.
        const expectedKeys = [
          'type',
          'requestId',
          'recordType',
          'recordId',
          'requestedAt',
          'completedAt',
          'status',
          'cascadeActions',
          'reason',
        ];
        expect(Object.keys(parsed).sort()).toEqual(expectedKeys.sort());
      } finally {
        uuidSpy.mockRestore();
      }
    });
  });
});
