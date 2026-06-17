// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsAdvancedPage } from './SettingsAdvancedPage';
import { MOOD_JOURNAL_STORAGE_KEY } from '../../lib/mood';
import { MOOD_TAGS_ENABLED_KEY, MOOD_TAGS_SYNC_ENABLED_KEY } from '../../lib/mood-tags';
import { eraseAllMoodTags } from '../../db/repositories/transactions';

vi.mock('../../components/settings', () => ({
  SettingInfoWidget: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => ({ name: 'mock-db' }),
}));

vi.mock('../../db/repositories/transactions', () => ({
  eraseAllMoodTags: vi.fn(),
}));

describe('SettingsAdvancedPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(MOOD_TAGS_ENABLED_KEY, 'true');
    localStorage.setItem(MOOD_TAGS_SYNC_ENABLED_KEY, 'true');
    localStorage.setItem(MOOD_JOURNAL_STORAGE_KEY, JSON.stringify([{ id: 'entry-1' }]));
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  it('erases mood journal data alongside mood tag preferences', () => {
    render(<SettingsAdvancedPage />);

    fireEvent.click(screen.getByRole('button', { name: /erase all mood data/i }));

    expect(eraseAllMoodTags).toHaveBeenCalledWith({ name: 'mock-db' });
    expect(localStorage.getItem(MOOD_JOURNAL_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(MOOD_TAGS_ENABLED_KEY)).toBe('false');
    expect(localStorage.getItem(MOOD_TAGS_SYNC_ENABLED_KEY)).toBe('false');
  });
});
