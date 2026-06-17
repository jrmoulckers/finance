// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { ES_ES_CATALOG } from './locales/es-ES';
import { getBetaCriticalCompleteness, getBetaCriticalMessageIds } from './beta-critical-copy';

describe('beta-critical-copy', () => {
  it('tracks beta-critical journey IDs for Spanish activation', () => {
    expect(getBetaCriticalMessageIds()).toContain('transactions.action.add');
    expect(getBetaCriticalCompleteness(ES_ES_CATALOG)).toMatchObject({
      missing: [],
      completionRatio: 1,
    });
  });
});
