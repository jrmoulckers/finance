// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildDemoModeBanner,
  buildDemoModeEntryState,
  resetDemoRecords,
  tagDemoRecords,
  type DemoTaggedRecord,
} from './demo-mode-session';

describe('demo mode session', () => {
  it('tags and removes only demo records during reset', () => {
    const tagged = tagDemoRecords<DemoTaggedRecord>([{ id: 'demo-account' }]);
    const result = resetDemoRecords([...tagged, { id: 'real-account', tags: ['real'] }]);

    expect(tagged[0].metadata?.demoMode).toBe(true);
    expect(result.deletedDemoIds).toEqual(['demo-account']);
    expect(result.keptRecords.map((record) => record.id)).toEqual(['real-account']);
  });

  it('builds accessible banner and protects real setup from demo mixing', () => {
    expect(buildDemoModeBanner(true).ariaLabel).toContain('Fictional sample data');
    expect(buildDemoModeEntryState({ hasRealAccounts: true, demoEnabled: false })).toMatchObject({
      canStartDemo: false,
      primaryLabel: 'Demo unavailable',
    });
  });
});
