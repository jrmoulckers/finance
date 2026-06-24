// SPDX-License-Identifier: BUSL-1.1

/**
 * Component tests for the credit-building education section on the Learning
 * page (issue #2174). Hooks are mocked — never repositories.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLocalePreferences } from '../hooks/useLocalePreferences';
import { CreditBuildingSection } from './LearningPage';

vi.mock('../hooks/useLocalePreferences', () => ({
  useLocalePreferences: vi.fn(),
}));

const mockedUseLocalePreferences = vi.mocked(useLocalePreferences);

function mockLocale(locale: string): void {
  mockedUseLocalePreferences.mockReturnValue({
    locale,
    timeZone: 'UTC',
    supportedLocales: [],
    timeZoneOptions: [],
    setLocale: vi.fn(),
    setTimeZone: vi.fn(),
  });
}

describe('CreditBuildingSection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mockLocale('en-US');
  });

  it('renders the five plain-language credit explainers in English by default', () => {
    render(<CreditBuildingSection />);

    expect(
      screen.getByRole('heading', { level: 2, name: /building credit from zero/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what is a fico score/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /what is credit utilization/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /statement date vs\. due date/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what is a hard inquiry/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what is a credit report/i })).toBeInTheDocument();
  });

  it('renders secured-card guidance covering deposit, on-time payments, and graduation', () => {
    render(<CreditBuildingSection />);

    expect(screen.getByRole('heading', { name: /how a secured card helps/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /place a refundable deposit/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /pay on time/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /aim to graduate/i })).toBeInTheDocument();
  });

  it('states that no real credit score is required', () => {
    render(<CreditBuildingSection />);

    expect(
      screen.getByText(/none of these steps need you to buy or pull a credit score/i),
    ).toBeInTheDocument();
  });

  it('checks a checklist item, updates progress, and persists to localStorage', () => {
    render(<CreditBuildingSection />);

    const checkbox = screen.getByRole('checkbox', { name: /open a starter account/i });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText('0 of 8 steps done')).toBeInTheDocument();

    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(screen.getByText('1 of 8 steps done')).toBeInTheDocument();

    const stored = window.localStorage.getItem('finance:credit-building-checklist:v1');
    expect(stored).toContain('secureCard');
  });

  it('exposes checklist progress through a native progressbar', () => {
    render(<CreditBuildingSection />);

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('max', '8');
    expect(progress).toHaveAttribute('value', '0');

    fireEvent.click(screen.getByRole('checkbox', { name: /turn on autopay/i }));
    expect(progress).toHaveAttribute('value', '1');
  });

  it('switches the reading language to Spanish via the toggle', () => {
    render(<CreditBuildingSection />);

    const englishButton = screen.getByRole('button', { name: 'English' });
    const spanishButton = screen.getByRole('button', { name: 'Español' });
    expect(englishButton).toHaveAttribute('aria-pressed', 'true');
    expect(spanishButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(spanishButton);

    expect(spanishButton).toHaveAttribute('aria-pressed', 'true');
    expect(englishButton).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('heading', { level: 2, name: /crear crédito desde cero/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /¿qué es una puntuación fico\?/i }),
    ).toBeInTheDocument();
  });

  it('defaults the reading language to Spanish when the app locale is Spanish', () => {
    mockLocale('es-ES');
    render(<CreditBuildingSection />);

    expect(screen.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('heading', { level: 2, name: /crear crédito desde cero/i }),
    ).toBeInTheDocument();
  });
});
