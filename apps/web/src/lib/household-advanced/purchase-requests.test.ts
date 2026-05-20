// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  createThreshold,
  requiresDiscussion,
  shouldAutoApprove,
  createPurchaseRequest,
  approveRequest,
  denyRequest,
  markForDiscussion,
  filterByStatus,
  filterByHousehold,
  getPendingRequests,
  totalPendingAmount,
} from './purchase-requests';
import type { PurchaseRequest } from './types';

const NOW = '2025-01-15T10:00:00.000Z';
const LATER = '2025-01-15T11:00:00.000Z';

describe('purchase-requests', () => {
  describe('threshold', () => {
    it('creates a threshold with non-negative value', () => {
      const t = createThreshold('groceries', 5000);
      expect(t.thresholdCents).toBe(5000);
      expect(t.autoApproveBelow).toBe(true);
    });

    it('clamps negative thresholds to 0', () => {
      const t = createThreshold('groceries', -100);
      expect(t.thresholdCents).toBe(0);
    });

    it('requiresDiscussion when at or above threshold', () => {
      const t = createThreshold('groceries', 5000);
      expect(requiresDiscussion(5000, t)).toBe(true);
      expect(requiresDiscussion(5001, t)).toBe(true);
      expect(requiresDiscussion(4999, t)).toBe(false);
    });

    it('shouldAutoApprove below threshold when enabled', () => {
      const t = createThreshold('groceries', 5000, true);
      expect(shouldAutoApprove(4999, t)).toBe(true);
      expect(shouldAutoApprove(5000, t)).toBe(false);
    });

    it('shouldAutoApprove returns false when disabled', () => {
      const t = createThreshold('groceries', 5000, false);
      expect(shouldAutoApprove(1000, t)).toBe(false);
    });
  });

  describe('request lifecycle', () => {
    const makeRequest = (): PurchaseRequest =>
      createPurchaseRequest('r1', 'hh1', 'u1', 'electronics', 25000, 'New monitor', NOW);

    it('creates a pending request', () => {
      const r = makeRequest();
      expect(r.status).toBe('pending');
      expect(r.resolvedAt).toBeNull();
      expect(r.resolvedBy).toBeNull();
    });

    it('approves a request', () => {
      const r = approveRequest(makeRequest(), 'u2', LATER, 'Looks good');
      expect(r.status).toBe('approved');
      expect(r.resolvedBy).toBe('u2');
      expect(r.resolvedAt).toBe(LATER);
      expect(r.note).toBe('Looks good');
    });

    it('denies a request', () => {
      const r = denyRequest(makeRequest(), 'u2', LATER, 'Too expensive');
      expect(r.status).toBe('denied');
      expect(r.note).toBe('Too expensive');
    });

    it('marks for discussion', () => {
      const r = markForDiscussion(makeRequest(), 'u2', LATER, 'Let us talk');
      expect(r.status).toBe('discussed');
    });
  });

  describe('filtering', () => {
    const requests: PurchaseRequest[] = [
      createPurchaseRequest('r1', 'hh1', 'u1', 'c1', 1000, 'd1', NOW),
      {
        ...createPurchaseRequest('r2', 'hh1', 'u1', 'c1', 2000, 'd2', NOW),
        status: 'approved' as const,
      },
      createPurchaseRequest('r3', 'hh2', 'u2', 'c2', 3000, 'd3', NOW),
    ];

    it('filters by status', () => {
      expect(filterByStatus(requests, 'pending')).toHaveLength(2);
      expect(filterByStatus(requests, 'approved')).toHaveLength(1);
    });

    it('filters by household', () => {
      expect(filterByHousehold(requests, 'hh1')).toHaveLength(2);
      expect(filterByHousehold(requests, 'hh2')).toHaveLength(1);
    });

    it('gets pending requests for a household', () => {
      expect(getPendingRequests(requests, 'hh1')).toHaveLength(1);
    });

    it('totals pending amount', () => {
      expect(totalPendingAmount(requests, 'hh1')).toBe(1000);
      expect(totalPendingAmount(requests, 'hh2')).toBe(3000);
    });
  });
});
