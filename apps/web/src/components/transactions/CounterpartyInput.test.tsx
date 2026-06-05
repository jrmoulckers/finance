// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the CounterpartyInput combobox component.
 *
 * References: issue #1514
 */

import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { KnownMerchant } from '../../lib/merchants';
import { CounterpartyInput } from './CounterpartyInput';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_MERCHANTS: KnownMerchant[] = [
  {
    id: 'walgreens-id',
    name: 'Walgreens',
    categoryDefault: 'Health & Pharmacy',
    patterns: ['WALGREENS.*'],
    matchCount: 10,
  },
  {
    id: 'amazon-id',
    name: 'Amazon',
    categoryDefault: 'Shopping',
    patterns: ['AMAZON.*'],
    matchCount: 25,
  },
  {
    id: 'starbucks-id',
    name: 'Starbucks',
    categoryDefault: 'Coffee & Cafes',
    patterns: ['STARBUCKS.*'],
    matchCount: 5,
  },
];

const MOCK_RECENT = ['Walmart', 'Walgreens', 'Netflix'];

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('CounterpartyInput', () => {
  it('renders the input with combobox role', () => {
    render(<CounterpartyInput value="" onChange={vi.fn()} merchants={MOCK_MERCHANTS} />);

    const input = screen.getByRole('combobox');
    expect(input).toBeDefined();
  });

  it('shows placeholder text', () => {
    render(
      <CounterpartyInput
        value=""
        onChange={vi.fn()}
        merchants={MOCK_MERCHANTS}
        placeholder="Enter counterparty"
      />,
    );

    const input = screen.getByPlaceholderText('Enter counterparty');
    expect(input).toBeDefined();
  });

  it('shows no dropdown when value is empty', () => {
    render(<CounterpartyInput value="" onChange={vi.fn()} merchants={MOCK_MERCHANTS} />);

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('calls onChange when typing', () => {
    const onChange = vi.fn();
    render(<CounterpartyInput value="" onChange={onChange} merchants={MOCK_MERCHANTS} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Wal' } });

    expect(onChange).toHaveBeenCalledWith('Wal');
  });

  it('shows matched indicator when matchResult is provided', () => {
    render(
      <CounterpartyInput
        value="Walgreens"
        onChange={vi.fn()}
        merchants={MOCK_MERCHANTS}
        matchResult={{
          merchant: MOCK_MERCHANTS[0],
          matchedPattern: 'WALGREENS.*',
          confidence: 0.9,
        }}
      />,
    );

    const indicator = screen.getByText(/Matched: Walgreens/);
    expect(indicator).toBeDefined();
  });

  it('does not show matched indicator when value is empty', () => {
    render(
      <CounterpartyInput
        value=""
        onChange={vi.fn()}
        merchants={MOCK_MERCHANTS}
        matchResult={{
          merchant: MOCK_MERCHANTS[0],
          matchedPattern: 'WALGREENS.*',
          confidence: 0.9,
        }}
      />,
    );

    expect(screen.queryByText(/Matched:/)).toBeNull();
  });

  it('shows suggestions from merchants when typing a matching query', () => {
    const { rerender } = render(
      <CounterpartyInput value="" onChange={vi.fn()} merchants={MOCK_MERCHANTS} />,
    );

    // Simulate typing "wal" by setting value and focusing
    rerender(<CounterpartyInput value="wal" onChange={vi.fn()} merchants={MOCK_MERCHANTS} />);

    // Trigger the input change to open the dropdown
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'wal' } });

    // After typing, the dropdown should appear with Walgreens
    rerender(<CounterpartyInput value="wal" onChange={vi.fn()} merchants={MOCK_MERCHANTS} />);

    fireEvent.focus(input);

    const listbox = screen.queryByRole('listbox');
    expect(listbox).not.toBeNull();
  });

  it('shows recent counterparties in suggestions', () => {
    render(
      <CounterpartyInput
        value="wal"
        onChange={vi.fn()}
        merchants={MOCK_MERCHANTS}
        recentCounterparties={MOCK_RECENT}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);

    // Should show both recent "Walmart", "Walgreens" and merchant "Walgreens"
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThanOrEqual(2);
  });

  it('handles keyboard navigation with ArrowDown', () => {
    render(
      <CounterpartyInput
        value="wal"
        onChange={vi.fn()}
        merchants={MOCK_MERCHANTS}
        recentCounterparties={MOCK_RECENT}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const options = screen.getAllByRole('option');
    // First option should be focused (aria-selected)
    expect(options[0].getAttribute('aria-selected')).toBe('true');
  });

  it('closes dropdown on Escape', () => {
    render(
      <CounterpartyInput
        value="wal"
        onChange={vi.fn()}
        merchants={MOCK_MERCHANTS}
        recentCounterparties={MOCK_RECENT}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.queryByRole('listbox')).not.toBeNull();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('dismisses dropdown and prevents form submission on Enter with free text', () => {
    render(
      <CounterpartyInput
        value="wal"
        onChange={vi.fn()}
        merchants={MOCK_MERCHANTS}
        recentCounterparties={MOCK_RECENT}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.queryByRole('listbox')).not.toBeNull();

    const enterEvent = createEvent.keyDown(input, { key: 'Enter' });
    fireEvent(input, enterEvent);

    expect(enterEvent.defaultPrevented).toBe(true);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('selects the highlighted suggestion on Enter', async () => {
    const onChange = vi.fn();
    render(<CounterpartyInput value="ama" onChange={onChange} merchants={MOCK_MERCHANTS} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('Amazon');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('is disabled when disabled prop is true', () => {
    render(
      <CounterpartyInput value="" onChange={vi.fn()} merchants={MOCK_MERCHANTS} disabled={true} />,
    );

    const input = screen.getByRole('combobox');
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it('has aria-expanded false when dropdown is closed', () => {
    render(<CounterpartyInput value="" onChange={vi.fn()} merchants={MOCK_MERCHANTS} />);

    const input = screen.getByRole('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });
});
