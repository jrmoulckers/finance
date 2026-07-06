// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for ExpectedIncomePage (#2193).
 *
 * Uses the real localStorage-backed store (cleared between tests) to verify the
 * add/list flow and that the page keeps spendable-now money separate from
 * expected money.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { ExpectedIncomePage } from './ExpectedIncomePage';

function addPayment(options: {
  name: string;
  amount: string;
  date: string;
  confidence?: 'High' | 'Medium' | 'Low';
  received?: boolean;
}) {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: options.name } });
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: options.amount } });
  fireEvent.change(screen.getByLabelText('Expected date'), { target: { value: options.date } });
  if (options.confidence) {
    fireEvent.change(screen.getByLabelText('Confidence'), {
      target: { value: options.confidence.toLowerCase() },
    });
  }
  if (options.received) {
    fireEvent.click(screen.getByLabelText('Already received (counts as spendable now)'));
  }
  fireEvent.click(screen.getByRole('button', { name: 'Add payment' }));
}

describe('ExpectedIncomePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the heading and an empty state initially', () => {
    render(<ExpectedIncomePage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /expected vs\. cleared income/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('No expected income yet')).toBeInTheDocument();
  });

  it('keeps cleared money spendable now and expected money separate', () => {
    render(<ExpectedIncomePage />);

    // A cleared (received) payment becomes spendable now.
    addPayment({ name: 'Cleared paycheck', amount: '300.00', date: '2026-06-01', received: true });
    // An expected (uncleared) payment must NOT be spendable now.
    addPayment({ name: 'Child support', amount: '500.00', date: '2026-06-25' });

    const realizedCard = screen
      .getByRole('heading', { name: 'Spendable now' })
      .closest('.expected-income__card') as HTMLElement;
    expect(within(realizedCard).getByText('$300.00')).toBeInTheDocument();

    const expectedCard = screen
      .getByRole('heading', { name: 'Expected (not yet received)' })
      .closest('.expected-income__card') as HTMLElement;
    expect(within(expectedCard).getByText('$500.00')).toBeInTheDocument();

    // Both items are listed.
    expect(screen.getByRole('heading', { level: 3, name: 'Cleared paycheck' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Child support' })).toBeInTheDocument();
  });

  it('toggles an expected payment to received and back', () => {
    render(<ExpectedIncomePage />);
    addPayment({ name: 'Child support', amount: '500.00', date: '2026-06-25' });

    const markReceived = screen.getByRole('button', { name: 'Mark received' });
    fireEvent.click(markReceived);

    // After clearing, spendable-now reflects the amount.
    const realizedCard = screen
      .getByRole('heading', { name: 'Spendable now' })
      .closest('.expected-income__card') as HTMLElement;
    expect(within(realizedCard).getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark not received' })).toBeInTheDocument();
  });

  it('deletes a payment', () => {
    render(<ExpectedIncomePage />);
    addPayment({ name: 'One-off gift', amount: '100.00', date: '2026-06-10' });
    expect(screen.getByRole('heading', { level: 3, name: 'One-off gift' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete One-off gift' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Remove expected income' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(
      screen.queryByRole('heading', { level: 3, name: 'One-off gift' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('No expected income yet')).toBeInTheDocument();
  });

  it('keeps the payment when the delete is cancelled', () => {
    render(<ExpectedIncomePage />);
    addPayment({ name: 'One-off gift', amount: '100.00', date: '2026-06-10' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete One-off gift' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('heading', { level: 3, name: 'One-off gift' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('validates the amount field', () => {
    render(<ExpectedIncomePage />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bad amount' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add payment' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/amount/i);
  });
});
