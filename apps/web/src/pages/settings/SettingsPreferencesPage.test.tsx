// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MoneyDisplayProvider } from '../../lib/display-settings';
import { SettingsPreferencesPage } from './SettingsPreferencesPage';

const setThemeMock = vi.fn();

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: setThemeMock,
    themes: ['system', 'light', 'dark', 'dark-oled'],
  }),
}));

vi.mock('../../components/settings/CurrencyRatesSettings', () => ({
  CurrencyRatesSettings: () => <section aria-label="Currency Rates">Currency rates mock</section>,
}));

function renderPreferences(): void {
  render(
    <MoneyDisplayProvider>
      <SettingsPreferencesPage />
    </MoneyDisplayProvider>,
  );
}

describe('SettingsPreferencesPage currency display polish', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders accurate negative format examples', () => {
    renderPreferences();

    const examples = screen.getByLabelText('Negative format examples');
    expect(examples).toHaveTextContent('Standard-$1,234.56');
    expect(examples).toHaveTextContent('Accounting($1,234.56)');

    const colorOnlyExample = within(examples).getByText('$1,234.56');
    expect(colorOnlyExample).toHaveClass('negative-format-preview__amount--error');
  });

  it('updates the live preview when currency display changes to code', () => {
    renderPreferences();

    fireEvent.change(screen.getByLabelText('Currency display mode'), { target: { value: 'code' } });

    expect(screen.getByRole('group', { name: /live preview/i })).toHaveTextContent('USD');
  });
});
