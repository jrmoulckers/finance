// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearSampleDataMarker,
  consumeCleanSlateRequest,
  isCleanSlateRequested,
  isSampleDataActive,
  markSampleDataSeeded,
  requestCleanSlate,
  shouldSeedSampleData,
} from './sampleData';

describe('sampleData lifecycle helpers (#3415)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('is inactive with no markers set', () => {
    expect(isSampleDataActive()).toBe(false);
    expect(isCleanSlateRequested()).toBe(false);
  });

  it('marks and clears the sample-data flag', () => {
    markSampleDataSeeded();
    expect(isSampleDataActive()).toBe(true);

    clearSampleDataMarker();
    expect(isSampleDataActive()).toBe(false);
  });

  it('records a clean-slate request', () => {
    requestCleanSlate();
    expect(isCleanSlateRequested()).toBe(true);
  });

  it('consumes a clean-slate request exactly once and clears the sample marker', () => {
    markSampleDataSeeded();
    requestCleanSlate();

    // First consume honors the request and wipes both markers.
    expect(consumeCleanSlateRequest()).toBe(true);
    expect(isCleanSlateRequested()).toBe(false);
    expect(isSampleDataActive()).toBe(false);

    // A second consume is a no-op — the request does not linger.
    expect(consumeCleanSlateRequest()).toBe(false);
  });

  it('skips seeding once when a clean slate was requested, then seeds again', () => {
    requestCleanSlate();
    // The requested clean slate suppresses this boot's seed...
    expect(shouldSeedSampleData()).toBe(false);
    // ...but only once — a later empty boot seeds normally.
    expect(shouldSeedSampleData()).toBe(true);
  });

  it('seeds sample data by default', () => {
    expect(shouldSeedSampleData()).toBe(true);
  });
});
