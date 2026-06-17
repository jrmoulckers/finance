// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  REQUIRED_LOCAL_WIPE_AREAS,
  buildDeletionModeCopy,
  buildLocalWipeReceipt,
  localWipeOutcome,
} from './local-wipe-verification';

describe('local wipe verification helpers', () => {
  it('verifies deleted and not-applicable local wipe areas', () => {
    const receipt = buildLocalWipeReceipt(
      'online',
      REQUIRED_LOCAL_WIPE_AREAS.map((area) => localWipeOutcome(area, area === 'service-workers' ? 'not_applicable' : 'deleted')),
    );

    expect(receipt.verified).toBe(true);
    expect(receipt.deleted).toContain('indexeddb');
    expect(receipt.notApplicable).toEqual(['service-workers']);
    expect(receipt.serverDeletionClaim).toBe('confirmed');
  });

  it('turns missing and failed instrumentation into failed receipt rows', () => {
    const receipt = buildLocalWipeReceipt('online', [localWipeOutcome('opfs', 'failed', 'quota manager denied wipe')], [
      'opfs',
      'indexeddb',
    ]);

    expect(receipt.verified).toBe(false);
    expect(receipt.failed).toEqual([
      { area: 'opfs', detail: 'quota manager denied wipe' },
      { area: 'indexeddb', detail: 'No wipe verification was recorded.' },
    ]);
  });

  it('does not claim server deletion for offline or demo mode', () => {
    expect(buildLocalWipeReceipt('offline', [], []).serverDeletionClaim).toBe('not_claimed');
    expect(buildLocalWipeReceipt('demo', [], []).userCopy).toContain('No production server deletion is claimed');
    expect(buildDeletionModeCopy('offline', 0)).toContain('Server deletion has not been claimed');
  });
});
