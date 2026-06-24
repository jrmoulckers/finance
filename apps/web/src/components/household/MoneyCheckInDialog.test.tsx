// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the couples money check-in dialog (#2150).
 *
 * Covers cadence gating, the neutral-summary-before-line-items guarantee,
 * stepping through the supportive prompts, privacy-safe recap redaction, and
 * per-partner sharing-consent persistence.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MoneyCheckInDialog } from './MoneyCheckInDialog';
import type { CheckInFacts } from '../../lib/household/check-in-rules';

const PARTNERS = [
  { id: 'avery', name: 'Avery' },
  { id: 'bo', name: 'Bo' },
] as const;

const FACTS: CheckInFacts = {
  categoryTotals: [
    { label: 'Groceries', amountCents: 42_000 },
    { label: 'Dining out', amountCents: 18_000 },
  ],
  budgetDriftByCategory: [
    { label: 'Groceries', amountCents: 2_000 },
    { label: 'Dining out', amountCents: -1_500 },
  ],
  sharedSpendingChanges: [{ label: 'Wedding', amountCents: 35_000 }],
};

const HOUSEHOLD_ID = 'hh-test';
const TODAY = '2026-04-10';

function renderDialog(overrides: { onClose?: () => void } = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <MoneyCheckInDialog
      isOpen
      onClose={onClose}
      householdId={HOUSEHOLD_ID}
      partners={PARTNERS}
      facts={FACTS}
      today={TODAY}
    />,
  );
  return { onClose };
}

function optInBothPartners() {
  fireEvent.click(screen.getByRole('checkbox', { name: /Avery opts in/i }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Bo opts in/i }));
}

describe('MoneyCheckInDialog (#2150)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('is presented as a labelled modal dialog', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { name: 'Money check-in' })).toBeInTheDocument();
  });

  it('gates the start until both partners opt in', () => {
    renderDialog();
    const beginButton = screen.getByRole('button', { name: /Begin check-in/i });
    expect(beginButton).toBeDisabled();

    optInBothPartners();
    expect(beginButton).toBeEnabled();
  });

  it('respects the cadence: a recent check-in keeps the next one gated', () => {
    // Two days ago — inside the default weekly cadence window.
    localStorage.setItem(`finance-household-${HOUSEHOLD_ID}-checkin-last`, '2026-04-08');
    renderDialog();

    optInBothPartners();
    expect(screen.getByRole('button', { name: /Begin check-in/i })).toBeDisabled();
    expect(screen.getByText(/Your last check-in was 2026-04-08/)).toBeInTheDocument();
  });

  it('shows neutral totals before any line items, revealing detail only on request', () => {
    renderDialog();
    optInBothPartners();
    fireEvent.click(screen.getByRole('button', { name: /Begin check-in/i }));

    // Neutral aggregate headline ($420 + $180 = $600) is visible immediately...
    expect(screen.getByText('$600.00')).toBeInTheDocument();
    // ...but the category line items are NOT shown yet.
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument();

    // Reveal only the category-totals section.
    const revealButtons = screen.getAllByRole('button', { name: /Reveal line items/i });
    fireEvent.click(revealButtons[0]);

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Dining out')).toBeInTheDocument();
  });

  it('steps through every prompt, redacts private notes, and persists sharing consent', () => {
    const { onClose } = renderDialog();
    optInBothPartners();
    fireEvent.click(screen.getByRole('button', { name: /Begin check-in/i }));

    // Move past the neutral summary into the prompts.
    fireEvent.click(screen.getByRole('button', { name: /Continue to prompts/i }));

    // First prompt is the supportive fun-money-boundaries prompt.
    expect(screen.getByText(/fun-money boundaries/i)).toBeInTheDocument();

    // Add a private note on the first prompt — it should be redacted in the recap.
    fireEvent.change(screen.getByLabelText(/Note for this prompt/i), {
      target: { value: 'Feeling a little stretched this month' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Keep this note private/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Add note$/i }));

    // Walk through the remaining prompts until the recap appears.
    for (let i = 0; i < 10; i += 1) {
      const advance = screen.queryByRole('button', { name: /Next prompt|See recap/i });
      if (!advance) break;
      fireEvent.click(advance);
      if (screen.queryByRole('heading', { name: /Share & finish/i })) break;
    }

    expect(screen.getByRole('heading', { name: /Share & finish/i })).toBeInTheDocument();
    // Private note is redacted in the privacy-safe recap.
    expect(screen.getByText('avery: redacted')).toBeInTheDocument();

    // Avery un-shares budget drift; persistence should reflect the choice.
    const averyFieldset = screen.getByRole('group', { name: /Avery shares/i });
    fireEvent.click(within(averyFieldset).getByRole('checkbox', { name: /Budget drift/i }));

    fireEvent.click(screen.getByRole('button', { name: /Save & finish/i }));

    expect(onClose).toHaveBeenCalledTimes(1);

    const storedSharing = JSON.parse(
      localStorage.getItem(`finance-household-${HOUSEHOLD_ID}-checkin-sharing`) ?? '{}',
    );
    expect(storedSharing.avery).not.toContain('budget-drift');
    expect(storedSharing.avery).toContain('category-totals');
    expect(localStorage.getItem(`finance-household-${HOUSEHOLD_ID}-checkin-last`)).toBe(TODAY);
  });

  it('closes on Escape', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
