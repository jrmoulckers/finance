// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MoneyDisplayProvider } from '../../lib/display-settings';
import { SettingsPreferencesPage } from './SettingsPreferencesPage';

const setThemeMock = vi.fn();
const setDisplayDensityMock = vi.fn();

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: setThemeMock,
    themes: ['system', 'light', 'dark', 'dark-oled'],
    displayDensity: 'comfortable',
    setDisplayDensity: setDisplayDensityMock,
    densities: ['comfortable', 'compact'],
  }),
}));

vi.mock('../../components/settings/CurrencyRatesSettings', () => ({
  CurrencyRatesSettings: () => <section aria-label="Currency Rates">Currency rates mock</section>,
}));

vi.mock('../../hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [
      {
        id: 'cat-food',
        householdId: 'hh-1',
        name: 'Food',
        icon: null,
        color: null,
        parentId: null,
        isIncome: false,
        isSystem: false,
        sortOrder: 0,
      },
    ],
  }),
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
    document.documentElement.style.fontSize = '';
    document.documentElement.style.removeProperty('--finance-font-scale');
    document.documentElement.removeAttribute('data-font-scale');
    document.documentElement.removeAttribute('data-density');
    vi.clearAllMocks();
    setDisplayDensityMock.mockImplementation((value: string) => {
      localStorage.setItem('finance-display-density-preference', value);
      if (value === 'compact') {
        document.documentElement.setAttribute('data-density', 'compact');
      } else {
        document.documentElement.removeAttribute('data-density');
      }
    });
  });

  it('renders accurate negative format examples', () => {
    renderPreferences();

    const examples = screen.getByLabelText('Negative format examples');
    expect(examples).toHaveTextContent('Standard-$1,234.56');
    expect(examples).toHaveTextContent('Accounting($1,234.56)');

    const textLabelExample = within(examples).getByText('Negative $1,234.56');
    expect(textLabelExample).toHaveClass('negative-format-preview__amount--error');
  });

  it('updates the live preview when currency display changes to code', () => {
    renderPreferences();

    fireEvent.change(screen.getByLabelText('Currency display mode'), { target: { value: 'code' } });

    expect(screen.getByRole('group', { name: /live preview/i })).toHaveTextContent('USD');
  });

  it('offers and persists very large text size preferences', () => {
    renderPreferences();

    const textSizeSelect = screen.getByLabelText('Text size');
    expect(within(textSizeSelect).getByRole('option', { name: 'Huge (200%)' })).toBeInTheDocument();

    fireEvent.change(textSizeSelect, { target: { value: 'huge' } });

    expect(localStorage.getItem('finance-font-scale-preference')).toBe('huge');
    expect(document.documentElement.style.fontSize).toBe('200%');
    expect(document.documentElement.style.getPropertyValue('--finance-font-scale')).toBe('2');
  });

  it('offers and persists language and timezone preferences', () => {
    renderPreferences();

    const languageSelect = screen.getByLabelText('Language');
    fireEvent.change(languageSelect, { target: { value: 'es-ES' } });
    expect(localStorage.getItem('finance-locale-preference')).toBe('es-ES');
    expect(document.documentElement.lang).toBe('es-ES');

    const timeZoneSelect = screen.getByLabelText('Home time zone');
    fireEvent.change(timeZoneSelect, { target: { value: 'Asia/Tokyo' } });
    expect(localStorage.getItem('finance-time-zone-preference')).toBe('Asia/Tokyo');
  });

  it('offers and persists compact display density', () => {
    renderPreferences();

    const densitySelect = screen.getByLabelText('Display density');
    expect(
      within(densitySelect).getByRole('option', { name: 'Compact / Dense' }),
    ).toBeInTheDocument();

    fireEvent.change(densitySelect, { target: { value: 'compact' } });

    expect(setDisplayDensityMock).toHaveBeenCalledWith('compact');
    expect(localStorage.getItem('finance-display-density-preference')).toBe('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('lets users disable single-key shortcuts while keeping modified shortcuts documented', () => {
    renderPreferences();

    const singleKeyShortcuts = screen.getByLabelText('Single-key shortcuts');
    expect(singleKeyShortcuts).toBeChecked();
    expect(screen.getByText(/Ctrl\/Cmd\+K remains available/i)).toBeInTheDocument();

    fireEvent.click(singleKeyShortcuts);

    expect(localStorage.getItem('finance-single-key-shortcuts-enabled')).toBe('false');
    expect(singleKeyShortcuts).not.toBeChecked();
  });
});
