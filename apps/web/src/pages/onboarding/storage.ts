// SPDX-License-Identifier: BUSL-1.1

/**
 * localStorage-backed persistence and lightweight analytics helpers for the
 * onboarding flow. Every accessor degrades gracefully when storage is
 * unavailable (private mode / disabled). Extracted from `OnboardingPage.tsx`
 * (#3712).
 */

import {
  isIncomeType,
  isTaxIdStatus,
  type IncomeType,
  type TaxIdStatus,
} from '../../lib/onboarding/newcomer-tax-profile';

import type { StoredGoal } from './types';

export const LIFE_STAGE_STORAGE_KEY = 'finance-onboarding-life-stages';
export const LESSONS_STORAGE_KEY = 'finance-onboarding-completed-lessons';
export const GOALS_STORAGE_KEY = 'finance-onboarding-goals';
export const COACH_MARKS_STORAGE_KEY = 'finance-onboarding-coach-marks-dismissed';
export const CHECKLIST_HIDDEN_STORAGE_KEY = 'finance-onboarding-checklist-hidden';
export const ANALYTICS_EVENTS_STORAGE_KEY = 'finance-onboarding-analytics-events';

export const ONBOARDING_STORAGE_PREFIX = 'finance-onboarding';
export const TAX_ID_STATUS_STORAGE_KEY = `${ONBOARDING_STORAGE_PREFIX}-tax-id-status`;
export const INCOME_TYPE_STORAGE_KEY = `${ONBOARDING_STORAGE_PREFIX}-income-type`;

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode / disabled); values simply do not persist.
  }
}

export function readTaxIdStatus(): TaxIdStatus {
  try {
    const raw = localStorage.getItem(TAX_ID_STATUS_STORAGE_KEY);
    return raw && isTaxIdStatus(raw) ? raw : 'unspecified';
  } catch {
    return 'unspecified';
  }
}

export function readIncomeType(): IncomeType {
  try {
    const raw = localStorage.getItem(INCOME_TYPE_STORAGE_KEY);
    return raw && isIncomeType(raw) ? raw : 'unspecified';
  } catch {
    return 'unspecified';
  }
}

export function persistOnboardingCategory(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); selections simply do not persist.
  }
}

export function readStringArray(key: string): string[] {
  try {
    const stored = localStorage.getItem(key);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export function writeStringArray(key: string, values: string[]): void {
  safeSetItem(key, JSON.stringify(values));
}

export function readBoolean(key: string): boolean {
  return safeGetItem(key) === 'true';
}

export function writeBoolean(key: string, value: boolean): void {
  safeSetItem(key, String(value));
}

export function readGoals(): StoredGoal[] {
  try {
    const stored = localStorage.getItem(GOALS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? (parsed as StoredGoal[]) : [];
  } catch {
    return [];
  }
}

export function writeGoals(goals: StoredGoal[]): void {
  safeSetItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
}

export function trackOnboardingEvent(
  analyticsEnabled: boolean,
  eventName: string,
  payload: Record<string, unknown> = {},
): void {
  if (!analyticsEnabled) {
    return;
  }

  const existing = safeGetItem(ANALYTICS_EVENTS_STORAGE_KEY);
  let events: unknown;
  try {
    events = existing ? JSON.parse(existing) : [];
  } catch {
    events = [];
  }
  const nextEvents = Array.isArray(events) ? events : [];
  nextEvents.push({ eventName, payload, timestamp: new Date().toISOString() });
  safeSetItem(ANALYTICS_EVENTS_STORAGE_KEY, JSON.stringify(nextEvents));
}
