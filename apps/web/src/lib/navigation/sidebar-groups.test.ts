// @vitest-environment jsdom
// SPDX-License-Identifier: BUSL-1.1

import { afterEach, describe, expect, it } from 'vitest';

import {
  getStoredGroupExpanded,
  setStoredGroupExpanded,
  SIDEBAR_GROUPS_STORAGE_KEY,
} from './sidebar-groups';

describe('sidebar-groups persistence', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns undefined when a group has never been toggled', () => {
    expect(getStoredGroupExpanded('money')).toBeUndefined();
  });

  it('persists and reads back an explicit expanded state', () => {
    setStoredGroupExpanded('money', false);
    setStoredGroupExpanded('insights', true);

    expect(getStoredGroupExpanded('money')).toBe(false);
    expect(getStoredGroupExpanded('insights')).toBe(true);
  });

  it('merges without clobbering other groups', () => {
    setStoredGroupExpanded('money', false);
    setStoredGroupExpanded('plan', true);

    expect(getStoredGroupExpanded('money')).toBe(false);
    expect(getStoredGroupExpanded('plan')).toBe(true);
  });

  it('survives a corrupted storage payload', () => {
    localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, '{not valid json');

    expect(getStoredGroupExpanded('money')).toBeUndefined();
    // A subsequent write should recover cleanly.
    setStoredGroupExpanded('money', true);
    expect(getStoredGroupExpanded('money')).toBe(true);
  });
});
