// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MODULE_VISIBILITY_STORAGE_KEY } from '../../lib/ux/module-visibility';
import { MinimalistModeSettings } from './MinimalistModeSettings';

describe('MinimalistModeSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('groups areas into semantic fieldsets with legends', () => {
    render(<MinimalistModeSettings />);

    for (const groupName of ['Money', 'Plan', 'Insights', 'Connect']) {
      expect(screen.getByRole('group', { name: groupName })).toBeInTheDocument();
    }
  });

  it('renders every area as a switch that starts shown', () => {
    render(<MinimalistModeSettings />);

    const billsSwitch = screen.getByRole('switch', { name: 'Bills' });
    expect(billsSwitch).toBeChecked();
  });

  it('hides an area and persists it when its switch is turned off', () => {
    render(<MinimalistModeSettings />);

    const billsSwitch = screen.getByRole('switch', { name: 'Bills' });
    fireEvent.click(billsSwitch);

    expect(billsSwitch).not.toBeChecked();
    expect(JSON.parse(localStorage.getItem(MODULE_VISIBILITY_STORAGE_KEY) ?? '[]')).toContain(
      'bills',
    );
  });

  it('conveys state with text, not colour alone', () => {
    render(<MinimalistModeSettings />);

    const billsRow = screen.getByRole('switch', { name: 'Bills' }).closest('.settings-item');
    expect(billsRow).not.toBeNull();
    expect(within(billsRow as HTMLElement).getByText('Shown')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Bills' }));
    expect(within(billsRow as HTMLElement).getByText('Hidden')).toBeInTheDocument();
  });

  it('reports how many areas are hidden in a live region', () => {
    render(<MinimalistModeSettings />);

    expect(screen.getByRole('status')).toHaveTextContent('Every area is shown.');

    fireEvent.click(screen.getByRole('switch', { name: 'Reports' }));
    expect(screen.getByRole('status')).toHaveTextContent('1 area is hidden.');
  });

  it('restores every area with "Show all areas"', () => {
    localStorage.setItem(MODULE_VISIBILITY_STORAGE_KEY, JSON.stringify(['bills', 'reports']));
    render(<MinimalistModeSettings />);

    const showAll = screen.getByRole('button', { name: /show all areas/i });
    expect(showAll).toBeEnabled();

    fireEvent.click(showAll);

    expect(JSON.parse(localStorage.getItem(MODULE_VISIBILITY_STORAGE_KEY) ?? '[]')).toEqual([]);
    expect(screen.getByRole('switch', { name: 'Bills' })).toBeChecked();
    expect(showAll).toBeDisabled();
  });

  it('does not list essential areas that must stay available', () => {
    render(<MinimalistModeSettings />);

    expect(screen.queryByRole('switch', { name: 'Dashboard' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Settings' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Accounts' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Transactions' })).toBeNull();
  });
});
