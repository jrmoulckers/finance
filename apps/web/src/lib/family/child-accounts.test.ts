// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for child & teen sub-account engine.
 *
 * References: #1796
 */

import { describe, it, expect } from 'vitest';
import {
  getAvailableFeatures,
  roleForAge,
  hasFeature,
  createChildAccount,
  createFamilyMember,
  adjustBalance,
  updateVisibility,
  isLinkedToParent,
} from './child-accounts';

const NOW = '2025-01-15T12:00:00.000Z';

describe('child-accounts', () => {
  // -----------------------------------------------------------------------
  // Feature gating
  // -----------------------------------------------------------------------
  describe('getAvailableFeatures', () => {
    it('returns minimal features for very young children (< 5)', () => {
      const features = getAvailableFeatures(4);
      expect(features).toEqual(['view-balance']);
    });

    it('returns child features for ages 5-12', () => {
      const features = getAvailableFeatures(8);
      expect(features).toContain('view-balance');
      expect(features).toContain('set-goals');
      expect(features).toContain('view-education');
      expect(features).not.toContain('view-transactions');
      expect(features).not.toContain('category-spending');
    });

    it('returns full teen features for ages 13-17', () => {
      const features = getAvailableFeatures(15);
      expect(features).toContain('view-balance');
      expect(features).toContain('view-transactions');
      expect(features).toContain('request-spending');
      expect(features).toContain('category-spending');
      expect(features).toContain('transfer-to-goal');
    });
  });

  describe('roleForAge', () => {
    it('returns "child" for ages under 13', () => {
      expect(roleForAge(5)).toBe('child');
      expect(roleForAge(12)).toBe('child');
    });

    it('returns "teen" for ages 13-17', () => {
      expect(roleForAge(13)).toBe('teen');
      expect(roleForAge(17)).toBe('teen');
    });

    it('returns "parent" for ages 18+', () => {
      expect(roleForAge(18)).toBe('parent');
      expect(roleForAge(40)).toBe('parent');
    });
  });

  describe('hasFeature', () => {
    it('returns true for available features', () => {
      expect(hasFeature(15, 'view-transactions')).toBe(true);
    });

    it('returns false for unavailable features', () => {
      expect(hasFeature(8, 'view-transactions')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Account creation
  // -----------------------------------------------------------------------
  describe('createChildAccount', () => {
    it('creates a child account for age 8', () => {
      const account = createChildAccount({
        id: 'acc-1',
        memberId: 'mem-1',
        parentAccountId: 'parent-1',
        name: 'Savings',
        age: 8,
        now: NOW,
      });
      expect(account.role).toBe('child');
      expect(account.balanceCents).toBe(0);
      expect(account.canViewTransactions).toBe(false);
    });

    it('creates a teen account for age 15', () => {
      const account = createChildAccount({
        id: 'acc-2',
        memberId: 'mem-2',
        parentAccountId: 'parent-1',
        name: 'Teen Account',
        age: 15,
        now: NOW,
      });
      expect(account.role).toBe('teen');
      expect(account.canViewTransactions).toBe(true);
    });

    it('throws for age below minimum', () => {
      expect(() =>
        createChildAccount({
          id: 'acc-3',
          memberId: 'mem-3',
          parentAccountId: 'parent-1',
          name: 'Too Young',
          age: 3,
          now: NOW,
        }),
      ).toThrow(RangeError);
    });

    it('throws for age above maximum', () => {
      expect(() =>
        createChildAccount({
          id: 'acc-4',
          memberId: 'mem-4',
          parentAccountId: 'parent-1',
          name: 'Too Old',
          age: 18,
          now: NOW,
        }),
      ).toThrow(RangeError);
    });
  });

  describe('createFamilyMember', () => {
    it('creates a member with correct role', () => {
      const member = createFamilyMember({
        id: 'mem-1',
        name: 'Alice',
        age: 10,
        parentId: 'parent-1',
        now: NOW,
      });
      expect(member.role).toBe('child');
      expect(member.parentId).toBe('parent-1');
    });
  });

  // -----------------------------------------------------------------------
  // Balance operations
  // -----------------------------------------------------------------------
  describe('adjustBalance', () => {
    const baseAccount = createChildAccount({
      id: 'acc-1',
      memberId: 'mem-1',
      parentAccountId: 'parent-1',
      name: 'Test',
      age: 10,
      now: NOW,
    });

    it('adds funds', () => {
      const updated = adjustBalance(baseAccount, 1000);
      expect(updated.balanceCents).toBe(1000);
    });

    it('subtracts funds when sufficient', () => {
      const funded = adjustBalance(baseAccount, 5000);
      const updated = adjustBalance(funded, -2000);
      expect(updated.balanceCents).toBe(3000);
    });

    it('throws on insufficient balance', () => {
      expect(() => adjustBalance(baseAccount, -100)).toThrow(RangeError);
    });
  });

  // -----------------------------------------------------------------------
  // Visibility & linking
  // -----------------------------------------------------------------------
  describe('updateVisibility', () => {
    it('upgrades visibility when age crosses teen threshold', () => {
      const childAccount = createChildAccount({
        id: 'acc-1',
        memberId: 'mem-1',
        parentAccountId: 'parent-1',
        name: 'Test',
        age: 12,
        now: NOW,
      });
      expect(childAccount.canViewTransactions).toBe(false);
      const updated = updateVisibility(childAccount, 13);
      expect(updated.canViewTransactions).toBe(true);
    });

    it('returns same object when visibility unchanged', () => {
      const account = createChildAccount({
        id: 'acc-1',
        memberId: 'mem-1',
        parentAccountId: 'parent-1',
        name: 'Test',
        age: 15,
        now: NOW,
      });
      const updated = updateVisibility(account, 15);
      expect(updated).toBe(account); // same reference
    });
  });

  describe('isLinkedToParent', () => {
    const account = createChildAccount({
      id: 'acc-1',
      memberId: 'mem-1',
      parentAccountId: 'parent-1',
      name: 'Test',
      age: 10,
      now: NOW,
    });

    it('returns true for correct parent', () => {
      expect(isLinkedToParent(account, 'parent-1')).toBe(true);
    });

    it('returns false for wrong parent', () => {
      expect(isLinkedToParent(account, 'parent-2')).toBe(false);
    });
  });
});
