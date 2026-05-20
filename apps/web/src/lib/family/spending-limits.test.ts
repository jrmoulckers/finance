// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for spending limits & approval workflow engine.
 *
 * References: #1800, #1728
 */

import { describe, it, expect } from 'vitest';
import {
  getPeriodStart,
  calculatePeriodSpending,
  checkSpendingLimits,
  createSpendingLimit,
  createApprovalRequest,
  reviewApprovalRequest,
  overrideLimit,
  buildSpendingSummaries,
} from './spending-limits';
import type { SpendingTransaction } from './spending-limits';
import type { SpendingLimit } from './types';

const NOW = '2025-01-15T12:00:00.000Z';

function makeLimit(overrides: Partial<SpendingLimit> = {}): SpendingLimit {
  return {
    id: 'lim-1',
    accountId: 'acc-1',
    categoryId: null,
    categoryName: 'All',
    maxAmountCents: 10000, // $100
    period: 'monthly',
    perTransactionMaxCents: 0,
    enabled: true,
    ...overrides,
  };
}

function makeTxn(overrides: Partial<SpendingTransaction> = {}): SpendingTransaction {
  return {
    amountCents: 1000,
    categoryId: null,
    timestamp: NOW,
    ...overrides,
  };
}

describe('spending-limits', () => {
  describe('getPeriodStart', () => {
    it('returns start of day for daily period', () => {
      const start = getPeriodStart('daily', '2025-01-15T14:30:00.000Z');
      const d = new Date(start);
      expect(d.getDate()).toBe(15);
      expect(d.getHours()).toBe(0);
    });

    it('returns start of month for monthly period', () => {
      const start = getPeriodStart('monthly', '2025-01-15T14:30:00.000Z');
      const d = new Date(start);
      expect(d.getDate()).toBe(1);
    });
  });

  describe('calculatePeriodSpending', () => {
    it('sums transactions within the period', () => {
      const limit = makeLimit({ period: 'monthly' });
      const txns: SpendingTransaction[] = [
        makeTxn({ amountCents: 2000, timestamp: '2025-01-05T10:00:00.000Z' }),
        makeTxn({ amountCents: 3000, timestamp: '2025-01-10T10:00:00.000Z' }),
        makeTxn({ amountCents: 500, timestamp: '2024-12-31T10:00:00.000Z' }), // prior month
      ];
      const spent = calculatePeriodSpending(txns, limit, NOW);
      expect(spent).toBe(5000);
    });
  });

  describe('checkSpendingLimits', () => {
    it('allows transaction within limits', () => {
      const limit = makeLimit({ maxAmountCents: 10000 });
      const result = checkSpendingLimits(makeTxn({ amountCents: 2000 }), [limit], [], NOW);
      expect(result.allowed).toBe(true);
      expect(result.exceededLimit).toBeNull();
    });

    it('denies transaction exceeding period limit', () => {
      const limit = makeLimit({ maxAmountCents: 5000 });
      const existing = [makeTxn({ amountCents: 4000, timestamp: '2025-01-10T10:00:00.000Z' })];
      const result = checkSpendingLimits(makeTxn({ amountCents: 2000 }), [limit], existing, NOW);
      expect(result.allowed).toBe(false);
      expect(result.exceededLimit).toBe(limit);
      expect(result.overageCents).toBe(1000);
    });

    it('denies transaction exceeding per-transaction limit', () => {
      const limit = makeLimit({ perTransactionMaxCents: 1000 });
      const result = checkSpendingLimits(makeTxn({ amountCents: 1500 }), [limit], [], NOW);
      expect(result.allowed).toBe(false);
      expect(result.overageCents).toBe(500);
    });

    it('respects category-specific limits', () => {
      const limit = makeLimit({
        categoryId: 'food',
        categoryName: 'Food',
        maxAmountCents: 3000,
      });
      // Different category — should be allowed
      const result = checkSpendingLimits(
        makeTxn({ amountCents: 5000, categoryId: 'games' }),
        [limit],
        [],
        NOW,
      );
      expect(result.allowed).toBe(true);
    });

    it('ignores disabled limits', () => {
      const limit = makeLimit({ maxAmountCents: 100, enabled: false });
      const result = checkSpendingLimits(makeTxn({ amountCents: 5000 }), [limit], [], NOW);
      expect(result.allowed).toBe(true);
    });
  });

  describe('createSpendingLimit', () => {
    it('creates a limit with defaults', () => {
      const limit = createSpendingLimit({
        id: 'lim-1',
        accountId: 'acc-1',
        categoryId: 'food',
        categoryName: 'Food',
        maxAmountCents: 5000,
        period: 'weekly',
      });
      expect(limit.enabled).toBe(true);
      expect(limit.perTransactionMaxCents).toBe(0);
      expect(limit.period).toBe('weekly');
    });
  });

  describe('approval workflow', () => {
    it('creates a pending approval request', () => {
      const req = createApprovalRequest({
        id: 'req-1',
        accountId: 'acc-1',
        requestorName: 'Alice',
        amountCents: 5000,
        categoryId: 'games',
        description: 'Want a game',
        now: NOW,
      });
      expect(req.status).toBe('pending');
      expect(req.reviewedBy).toBeNull();
    });

    it('approves a request', () => {
      const req = createApprovalRequest({
        id: 'req-1',
        accountId: 'acc-1',
        requestorName: 'Alice',
        amountCents: 5000,
        categoryId: null,
        description: 'test',
        now: NOW,
      });
      const reviewed = reviewApprovalRequest(req, 'approved', 'parent-1', 'OK', NOW);
      expect(reviewed.status).toBe('approved');
      expect(reviewed.reviewedBy).toBe('parent-1');
    });

    it('denies a request', () => {
      const req = createApprovalRequest({
        id: 'req-1',
        accountId: 'acc-1',
        requestorName: 'Alice',
        amountCents: 5000,
        categoryId: null,
        description: 'test',
        now: NOW,
      });
      const reviewed = reviewApprovalRequest(req, 'denied', 'parent-1', 'Too much', NOW);
      expect(reviewed.status).toBe('denied');
    });

    it('throws when reviewing non-pending request', () => {
      const req = createApprovalRequest({
        id: 'req-1',
        accountId: 'acc-1',
        requestorName: 'Alice',
        amountCents: 5000,
        categoryId: null,
        description: 'test',
        now: NOW,
      });
      const approved = reviewApprovalRequest(req, 'approved', 'p1', 'OK', NOW);
      expect(() => reviewApprovalRequest(approved, 'denied', 'p2', 'No', NOW)).toThrow();
    });
  });

  describe('overrideLimit', () => {
    it('updates the max amount', () => {
      const limit = makeLimit({ maxAmountCents: 5000 });
      const updated = overrideLimit(limit, 10000, 'Holiday increase');
      expect(updated.maxAmountCents).toBe(10000);
    });
  });

  describe('buildSpendingSummaries', () => {
    it('computes usage correctly', () => {
      const limit = makeLimit({ maxAmountCents: 10000 });
      const txns = [makeTxn({ amountCents: 3000, timestamp: '2025-01-10T10:00:00.000Z' })];
      const summaries = buildSpendingSummaries([limit], txns, NOW);
      expect(summaries).toHaveLength(1);
      expect(summaries[0].spentCents).toBe(3000);
      expect(summaries[0].remainingCents).toBe(7000);
      expect(summaries[0].usagePercent).toBe(30);
    });

    it('handles zero max amount without divide-by-zero', () => {
      const limit = makeLimit({ maxAmountCents: 0 });
      const summaries = buildSpendingSummaries([limit], [], NOW);
      expect(summaries[0].usagePercent).toBe(0);
    });
  });
});
