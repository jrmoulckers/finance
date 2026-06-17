// SPDX-License-Identifier: BUSL-1.1

import { getRegionForLocale, type RegionCode } from './regional-conventions';

export const REGIONAL_PROFILE_STORAGE_KEY = 'finance-regional-profile';
export const SUPPORTED_REGIONAL_PROFILES: readonly RegionCode[] = ['US', 'GB', 'ES', 'EU', 'CA', 'AU'];

function isSupportedRegionalProfile(value: string | null | undefined): value is RegionCode {
  return SUPPORTED_REGIONAL_PROFILES.includes(value as RegionCode);
}

function readStorage(): string | null {
  try {
    return globalThis.localStorage?.getItem(REGIONAL_PROFILE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(region: RegionCode): void {
  try {
    globalThis.localStorage?.setItem(REGIONAL_PROFILE_STORAGE_KEY, region);
  } catch {
    // Regional profile persistence is best-effort when storage is unavailable.
  }
}

export function suggestRegionalProfile(locale: string): RegionCode {
  const suggested = getRegionForLocale(locale);
  return isSupportedRegionalProfile(suggested) ? suggested : 'US';
}

export function getStoredRegionalProfile(): RegionCode | null {
  const stored = readStorage();
  return isSupportedRegionalProfile(stored) ? stored : null;
}

export function getRegionalProfilePreference(locale: string): RegionCode {
  return getStoredRegionalProfile() ?? suggestRegionalProfile(locale);
}

export function setRegionalProfilePreference(region: RegionCode): RegionCode {
  if (!isSupportedRegionalProfile(region)) throw new Error(`Unsupported regional profile: ${region}`);
  writeStorage(region);
  return region;
}

export function clearRegionalProfilePreference(): void {
  try {
    globalThis.localStorage?.removeItem(REGIONAL_PROFILE_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
