// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for TransactionSort component.
 * References: issue #1464
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { TransactionSort, DEFAULT_SORT } from './TransactionSort';

describe('TransactionSort', () => {
  it('renders sort field select and direction button', () => {
    render(<TransactionSort sort={DEFAULT_SORT} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/sort field/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sort order/i)).toBeInTheDocument();
  });

  it('displays the current sort field', () => {
    render(<TransactionSort sort={{ field: 'amount', direction: 'asc' }} onChange={vi.fn()} />);

    const select = screen.getByLabelText(/sort field/i) as HTMLSelectElement;
    expect(select.value).toBe('amount');
  });

  it('calls onChange with new field when select changes', () => {
    const onChange = vi.fn();
    render(<TransactionSort sort={DEFAULT_SORT} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/sort field/i), { target: { value: 'payee' } });
    expect(onChange).toHaveBeenCalledWith({ field: 'payee', direction: 'desc' });
  });

  it('toggles direction on button click', () => {
    const onChange = vi.fn();
    render(<TransactionSort sort={{ field: 'date', direction: 'desc' }} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText(/sort order/i));
    expect(onChange).toHaveBeenCalledWith({ field: 'date', direction: 'asc' });
  });

  it('shows ascending arrow when direction is asc', () => {
    render(<TransactionSort sort={{ field: 'date', direction: 'asc' }} onChange={vi.fn()} />);

    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('shows descending arrow when direction is desc', () => {
    render(<TransactionSort sort={{ field: 'date', direction: 'desc' }} onChange={vi.fn()} />);

    expect(screen.getByText('↓')).toBeInTheDocument();
  });

  it('describes date direction in human terms', () => {
    const { rerender } = render(
      <TransactionSort sort={{ field: 'date', direction: 'desc' }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText(/newest first/i)).toBeInTheDocument();

    rerender(<TransactionSort sort={{ field: 'date', direction: 'asc' }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/oldest first/i)).toBeInTheDocument();
  });

  it('describes amount direction as largest/smallest first', () => {
    const { rerender } = render(
      <TransactionSort sort={{ field: 'amount', direction: 'desc' }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText(/largest first/i)).toBeInTheDocument();

    rerender(<TransactionSort sort={{ field: 'amount', direction: 'asc' }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/smallest first/i)).toBeInTheDocument();
  });

  it('describes payee direction alphabetically', () => {
    render(<TransactionSort sort={{ field: 'payee', direction: 'asc' }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/a to z/i)).toBeInTheDocument();
  });
});
