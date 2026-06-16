// SPDX-License-Identifier: BUSL-1.1

export const SIMPLIFIED_MODE_STORAGE_KEY = 'finance-simplified-mode';
const COGNITIVE_ATTRIBUTE = 'data-a11y-cognitive';

export function getStoredSimplifiedModePreference(): boolean {
  try {
    return localStorage.getItem(SIMPLIFIED_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function applySimplifiedModePreference(enabled: boolean): void {
  if (typeof document === 'undefined') return;

  if (enabled) {
    document.documentElement.setAttribute(COGNITIVE_ATTRIBUTE, 'true');
  } else {
    document.documentElement.removeAttribute(COGNITIVE_ATTRIBUTE);
  }
}

export function setSimplifiedModePreference(enabled: boolean): void {
  try {
    localStorage.setItem(SIMPLIFIED_MODE_STORAGE_KEY, String(enabled));
  } catch {
    // localStorage unavailable — still apply for this session
  }

  applySimplifiedModePreference(enabled);
}

export function applyStoredSimplifiedModePreference(): void {
  applySimplifiedModePreference(getStoredSimplifiedModePreference());
}
