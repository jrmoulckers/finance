// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotificationSettings } from './NotificationSettings';

const PREFS_KEY = 'finance-notification-preferences';
const LEGACY_LIST_KEY = 'finance-notifications';

describe('NotificationSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the master toggle enabled by default', () => {
    render(<NotificationSettings />);

    expect(screen.getByRole('checkbox', { name: 'Enable notifications' })).toBeChecked();
  });

  it('persists changes to the notification-preferences store, not the legacy list key', () => {
    render(<NotificationSettings />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Do not disturb' }));

    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    expect(stored.doNotDisturb).toBe(true);
    // Regression guard for #3788: the settings UI must never write to the key
    // that `useNotifications` uses for the notification list.
    expect(localStorage.getItem(LEGACY_LIST_KEY)).toBeNull();
  });

  it('never overwrites an existing notification list stored under the legacy key', () => {
    const list = JSON.stringify([{ id: 'n1', status: 'unread' }]);
    localStorage.setItem(LEGACY_LIST_KEY, list);

    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable notifications' }));

    expect(localStorage.getItem(LEGACY_LIST_KEY)).toBe(list);
  });

  it('disables sub-toggles when notifications are turned off', () => {
    render(<NotificationSettings />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable notifications' }));

    expect(screen.getByRole('checkbox', { name: 'Do not disturb' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Transaction confirmations' })).toBeDisabled();
  });

  it('enables the quiet-hours time inputs when quiet hours are on', () => {
    render(<NotificationSettings />);

    expect(screen.getByLabelText('Quiet hours start time')).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Quiet hours' }));

    expect(screen.getByLabelText('Quiet hours start time')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Quiet hours start time'), {
      target: { value: '23:30' },
    });

    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    expect(stored.quietHours.enabled).toBe(true);
    expect(stored.quietHours.startTime).toBe('23:30');
  });

  it('resets preferences to defaults', () => {
    render(<NotificationSettings />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Transaction confirmations' }));
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}').transactionConfirmations).toBe(
      false,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset notification preferences to defaults' }),
    );

    expect(screen.getByRole('checkbox', { name: 'Transaction confirmations' })).toBeChecked();
  });
});
