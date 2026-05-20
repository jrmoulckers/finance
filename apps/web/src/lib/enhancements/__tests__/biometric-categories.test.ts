import { describe, it, expect } from 'vitest';
import {
  createBiometricCategory,
  setSensitivityLevel,
  requiresBiometric,
  logAccessAttempt,
  createTemporaryUnlock,
  isUnlockActive,
  getBiometricProtectedCategories,
  getFailedAttempts,
} from '../biometric-categories';
import type { TemporaryUnlock } from '../types';

describe('biometric-categories', () => {
  describe('createBiometricCategory', () => {
    it('creates a category with sensitivity level', () => {
      const cat = createBiometricCategory('cat-1', 'Medical', 'biometric_required');
      expect(cat.categoryId).toBe('cat-1');
      expect(cat.sensitivityLevel).toBe('biometric_required');
    });
  });

  describe('setSensitivityLevel', () => {
    it('updates sensitivity level', () => {
      const cat = createBiometricCategory('cat-1', 'Medical', 'normal');
      const updated = setSensitivityLevel(cat, 'biometric_required');
      expect(updated.sensitivityLevel).toBe('biometric_required');
    });
  });

  describe('requiresBiometric', () => {
    it('returns true for biometric_required category', () => {
      const cat = createBiometricCategory('cat-1', 'Medical', 'biometric_required');
      expect(requiresBiometric(cat, [], '2025-01-15T12:00:00Z')).toBe(true);
    });

    it('returns false for normal category', () => {
      const cat = createBiometricCategory('cat-1', 'Food', 'normal');
      expect(requiresBiometric(cat, [], '2025-01-15T12:00:00Z')).toBe(false);
    });

    it('returns false for sensitive (not biometric_required)', () => {
      const cat = createBiometricCategory('cat-1', 'Finance', 'sensitive');
      expect(requiresBiometric(cat, [], '2025-01-15T12:00:00Z')).toBe(false);
    });

    it('returns false when temporarily unlocked', () => {
      const cat = createBiometricCategory('cat-1', 'Medical', 'biometric_required');
      const unlock: TemporaryUnlock = {
        categoryId: 'cat-1',
        unlockedAt: '2025-01-15T12:00:00Z',
        durationSeconds: 300,
      };
      // 2 minutes after unlock
      expect(requiresBiometric(cat, [unlock], '2025-01-15T12:02:00Z')).toBe(false);
    });

    it('returns true when temporary unlock expired', () => {
      const cat = createBiometricCategory('cat-1', 'Medical', 'biometric_required');
      const unlock: TemporaryUnlock = {
        categoryId: 'cat-1',
        unlockedAt: '2025-01-15T12:00:00Z',
        durationSeconds: 300,
      };
      // 10 minutes after unlock (expired)
      expect(requiresBiometric(cat, [unlock], '2025-01-15T12:10:00Z')).toBe(true);
    });
  });

  describe('logAccessAttempt', () => {
    it('creates an access attempt record', () => {
      const attempt = logAccessAttempt('cat-1', '2025-01-15T12:00:00Z', true, 'biometric');
      expect(attempt.granted).toBe(true);
      expect(attempt.method).toBe('biometric');
    });
  });

  describe('createTemporaryUnlock', () => {
    it('creates unlock with default duration', () => {
      const unlock = createTemporaryUnlock('cat-1', '2025-01-15T12:00:00Z');
      expect(unlock.durationSeconds).toBe(300);
    });

    it('creates unlock with custom duration', () => {
      const unlock = createTemporaryUnlock('cat-1', '2025-01-15T12:00:00Z', 600);
      expect(unlock.durationSeconds).toBe(600);
    });
  });

  describe('isUnlockActive', () => {
    it('returns true within duration', () => {
      const unlock = createTemporaryUnlock('cat-1', '2025-01-15T12:00:00Z', 300);
      expect(isUnlockActive(unlock, '2025-01-15T12:04:00Z')).toBe(true);
    });

    it('returns false after expiry', () => {
      const unlock = createTemporaryUnlock('cat-1', '2025-01-15T12:00:00Z', 300);
      expect(isUnlockActive(unlock, '2025-01-15T12:06:00Z')).toBe(false);
    });
  });

  describe('getBiometricProtectedCategories', () => {
    it('filters biometric_required categories', () => {
      const cats = [
        createBiometricCategory('1', 'Medical', 'biometric_required'),
        createBiometricCategory('2', 'Food', 'normal'),
        createBiometricCategory('3', 'Legal', 'biometric_required'),
      ];
      expect(getBiometricProtectedCategories(cats)).toHaveLength(2);
    });
  });

  describe('getFailedAttempts', () => {
    it('returns only denied attempts', () => {
      const attempts = [
        logAccessAttempt('1', '2025-01-15T12:00:00Z', true, 'biometric'),
        logAccessAttempt('2', '2025-01-15T12:01:00Z', false, 'none'),
        logAccessAttempt('3', '2025-01-15T12:02:00Z', false, 'pin'),
      ];
      expect(getFailedAttempts(attempts)).toHaveLength(2);
    });
  });
});
