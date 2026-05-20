/**
 * Biometric-protected sensitive categories.
 * Closes #1719.
 * @module enhancements/biometric-categories
 */

import type { BiometricCategory, SensitivityLevel, AccessAttempt, TemporaryUnlock } from './types';

/**
 * Create a biometric category protection assignment.
 * @param categoryId - Category identifier
 * @param categoryName - Display name
 * @param sensitivityLevel - Sensitivity level
 * @returns A BiometricCategory
 */
export function createBiometricCategory(
  categoryId: string,
  categoryName: string,
  sensitivityLevel: SensitivityLevel,
): BiometricCategory {
  return { categoryId, categoryName, sensitivityLevel };
}

/**
 * Update the sensitivity level of a category.
 * @param category - The category to update
 * @param level - New sensitivity level
 * @returns Updated category
 */
export function setSensitivityLevel(
  category: BiometricCategory,
  level: SensitivityLevel,
): BiometricCategory {
  return { ...category, sensitivityLevel: level };
}

/**
 * Check whether biometric verification is needed to access a category.
 * @param category - The category to check
 * @param temporaryUnlocks - Active temporary unlocks
 * @param currentTimestamp - ISO-8601 current timestamp
 * @returns `true` if biometric gate should be shown
 */
export function requiresBiometric(
  category: BiometricCategory,
  temporaryUnlocks: readonly TemporaryUnlock[],
  currentTimestamp: string,
): boolean {
  if (category.sensitivityLevel !== 'biometric_required') {
    return false;
  }

  // Check for active temporary unlock
  const unlock = temporaryUnlocks.find((u) => u.categoryId === category.categoryId);
  if (unlock) {
    const unlockTime = new Date(unlock.unlockedAt).getTime();
    const expiresAt = unlockTime + unlock.durationSeconds * 1000;
    const now = new Date(currentTimestamp).getTime();
    if (now < expiresAt) {
      return false; // temporarily unlocked
    }
  }

  return true;
}

/**
 * Create an access attempt log entry.
 * @param categoryId - Category accessed
 * @param timestamp - ISO-8601 timestamp
 * @param granted - Whether access was granted
 * @param method - Authentication method used
 * @returns An AccessAttempt record
 */
export function logAccessAttempt(
  categoryId: string,
  timestamp: string,
  granted: boolean,
  method: 'biometric' | 'pin' | 'none',
): AccessAttempt {
  return { categoryId, timestamp, granted, method };
}

/**
 * Create a temporary unlock for a category.
 * @param categoryId - Category to unlock
 * @param unlockedAt - ISO-8601 unlock timestamp
 * @param durationSeconds - Duration of unlock in seconds (default 300 = 5 min)
 * @returns A TemporaryUnlock record
 */
export function createTemporaryUnlock(
  categoryId: string,
  unlockedAt: string,
  durationSeconds: number = 300,
): TemporaryUnlock {
  return { categoryId, unlockedAt, durationSeconds };
}

/**
 * Check whether a temporary unlock is still active.
 * @param unlock - The unlock record
 * @param currentTimestamp - ISO-8601 current timestamp
 * @returns `true` if the unlock has not yet expired
 */
export function isUnlockActive(unlock: TemporaryUnlock, currentTimestamp: string): boolean {
  const unlockTime = new Date(unlock.unlockedAt).getTime();
  const expiresAt = unlockTime + unlock.durationSeconds * 1000;
  const now = new Date(currentTimestamp).getTime();
  return now < expiresAt;
}

/**
 * Filter categories that require biometric protection.
 * @param categories - All categories
 * @returns Categories with biometric_required level
 */
export function getBiometricProtectedCategories(
  categories: readonly BiometricCategory[],
): readonly BiometricCategory[] {
  return categories.filter((c) => c.sensitivityLevel === 'biometric_required');
}

/**
 * Get failed access attempts for audit purposes.
 * @param attempts - All access attempts
 * @returns Only denied attempts
 */
export function getFailedAttempts(attempts: readonly AccessAttempt[]): readonly AccessAttempt[] {
  return attempts.filter((a) => !a.granted);
}
