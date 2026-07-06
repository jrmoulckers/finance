// SPDX-License-Identifier: BUSL-1.1

/**
 * Sample-data lifecycle helpers.
 *
 * On first run the local database is seeded with clearly-labeled sample data
 * (see `seed.ts`) so a brand-new user can explore the app before entering any
 * real numbers. These helpers track whether the active workspace is sample
 * data and let the user request a genuine clean slate — an empty workspace with
 * no auto-reseed — via a durable `localStorage` marker that survives the reload
 * that `wipeLocalData` triggers.
 *
 * All storage access is wrapped in try/catch so private-browsing modes (where
 * `localStorage` can throw) degrade gracefully instead of breaking app boot.
 *
 * References: issue #3415
 */

const SAMPLE_DATA_ACTIVE_KEY = 'finance.sampleDataActive';
const CLEAN_SLATE_KEY = 'finance.cleanSlate';

function readFlag(key: string): boolean {
  try {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    if (value) {
      localStorage.setItem(key, '1');
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Private mode / storage disabled — sample-data labeling is best-effort.
  }
}

/**
 * Whether sample-data seeding is disabled by build configuration.
 *
 * Defaults to enabled; set `VITE_DISABLE_SAMPLE_DATA=true` for a build whose
 * first run should start empty (e.g. production). Guarding via env keeps
 * first-run behavior intentional per environment (#3415).
 */
export function isSampleDataSeedingDisabledByEnv(): boolean {
  try {
    return import.meta.env?.VITE_DISABLE_SAMPLE_DATA === 'true';
  } catch {
    return false;
  }
}

/** Whether the current workspace is showing seeded sample data. */
export function isSampleDataActive(): boolean {
  return readFlag(SAMPLE_DATA_ACTIVE_KEY);
}

/** Record that sample data has just been seeded into the local database. */
export function markSampleDataSeeded(): void {
  writeFlag(SAMPLE_DATA_ACTIVE_KEY, true);
}

/** Clear the sample-data marker (the workspace is no longer sample data). */
export function clearSampleDataMarker(): void {
  writeFlag(SAMPLE_DATA_ACTIVE_KEY, false);
}

/** Whether a clean slate has been requested and not yet consumed. */
export function isCleanSlateRequested(): boolean {
  return readFlag(CLEAN_SLATE_KEY);
}

/**
 * Request a genuine clean slate on the next boot: the durable marker tells
 * `seedDatabase` to skip re-seeding exactly once, yielding an empty workspace
 * instead of fresh sample data. Set this immediately before wiping local data.
 */
export function requestCleanSlate(): void {
  writeFlag(CLEAN_SLATE_KEY, true);
}

/**
 * Consume a pending clean-slate request. Returns `true` (and clears both the
 * clean-slate and sample-data markers) when the caller should skip seeding.
 */
export function consumeCleanSlateRequest(): boolean {
  if (!isCleanSlateRequested()) {
    return false;
  }
  writeFlag(CLEAN_SLATE_KEY, false);
  clearSampleDataMarker();
  return true;
}

/**
 * Whether `seedDatabase` should seed sample data on an empty database.
 *
 * Returns `false` — and leaves the workspace empty — when a clean slate was
 * requested (consumed here, so it only applies to the next boot) or when
 * seeding is disabled for this build. Otherwise returns `true`.
 */
export function shouldSeedSampleData(): boolean {
  if (consumeCleanSlateRequest()) {
    return false;
  }
  if (isSampleDataSeedingDisabledByEnv()) {
    return false;
  }
  return true;
}
