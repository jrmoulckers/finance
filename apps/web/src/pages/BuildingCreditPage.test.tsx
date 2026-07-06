// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for BuildingCreditPage.
 *
 * Covers: accessible structure (headings, labeled inputs, debounced status), the
 * lessons content, and the secured-card utilization tracker reacting to
 * balance/limit input with the correct classification and guidance.
 *
 * References: issue #2174
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BuildingCreditPage } from './BuildingCreditPage';

describe('BuildingCreditPage', () => {
  it('defers the main landmark to AppLayout and renders an h2 page heading (#3404)', () => {
    render(<BuildingCreditPage />);

    // AppLayout owns the single <main> and <h1>; the page must not duplicate them.
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Building credit' })).toBeInTheDocument();
  });

  it('announces a debounced, concise utilization summary (#3413)', () => {
    vi.useFakeTimers();
    try {
      render(<BuildingCreditPage />);
      fireEvent.change(screen.getByLabelText('Current balance'), { target: { value: '300' } });
      fireEvent.change(screen.getByLabelText('Credit limit'), { target: { value: '1000' } });

      const status = screen.getByRole('status');
      // Nothing is announced until the debounce settles, so a screen reader does
      // not re-read the entire result block on every keystroke.
      expect(status).toHaveTextContent('');

      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(status).toHaveTextContent(/of credit limit used/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('labels every tracker input for assistive technology', () => {
    render(<BuildingCreditPage />);

    expect(screen.getByLabelText('Current balance')).toBeInTheDocument();
    expect(screen.getByLabelText('Credit limit')).toBeInTheDocument();
    expect(screen.getByLabelText('Target utilization')).toBeInTheDocument();
  });

  it('prompts for a limit before one is entered', () => {
    render(<BuildingCreditPage />);

    expect(screen.getByText('Add your credit limit to see utilization')).toBeInTheDocument();
    expect(screen.getByText('Add a limit')).toBeInTheDocument();
  });

  it('computes utilization and classification from balance and limit', () => {
    render(<BuildingCreditPage />);

    fireEvent.change(screen.getByLabelText('Current balance'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Credit limit'), { target: { value: '500' } });

    // 150 / 500 = 30% -> caution
    expect(screen.getByText('Getting high')).toBeInTheDocument();
    expect(screen.getByText('Your utilization is creeping up at 30%')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Credit utilization' })).toHaveAttribute(
      'aria-valuenow',
      '30',
    );
  });

  it('classifies a low balance as on track', () => {
    render(<BuildingCreditPage />);

    fireEvent.change(screen.getByLabelText('Current balance'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Credit limit'), { target: { value: '500' } });

    // 50 / 500 = 10% -> good
    expect(screen.getByText('On track')).toBeInTheDocument();
  });

  it('warns and shows a pay-down amount for high utilization', () => {
    render(<BuildingCreditPage />);

    fireEvent.change(screen.getByLabelText('Current balance'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Credit limit'), { target: { value: '500' } });

    // 400 / 500 = 80% -> high; pay down to 30% (=$150) -> $250.00
    expect(screen.getByText('Too high')).toBeInTheDocument();
    expect(screen.getByText('$250.00')).toBeInTheDocument();
  });

  it('renders the beginner credit lessons as headings', () => {
    render(<BuildingCreditPage />);

    expect(
      screen.getByRole('heading', { level: 3, name: 'What a credit score is' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Why utilization matters' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'How secured cards build credit' }),
    ).toBeInTheDocument();
  });
});
