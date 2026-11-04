// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { CoachAnalysis } from '../../lib/coaching';
import { CoachPanel } from './CoachPanel';

const analysis = {
  velocities: [],
  suggestions: [],
  anomalies: [],
  cashFlow: {
    currentBalanceCents: 0,
    projectedEndBalanceCents: 0,
    projectedRecurringIncomeCents: 0,
    projectedDiscretionaryExpenseCents: 0,
    recurringItems: [
      {
        id: 'r1',
        label: 'Paycheck',
        type: 'INCOME',
        cadence: 'biweekly',
        nextExpectedDate: '2026-11-04',
        occurrencesRemaining: 1,
        projectedAmountCents: 100000,
      },
    ],
  },
} as unknown as CoachAnalysis;

describe('CoachPanel', () => {
  it('shows the next expected date formatted, not as a raw ISO string', () => {
    render(
      <MemoryRouter>
        <CoachPanel analysis={analysis} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/next expected Nov 4/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-11-04/)).not.toBeInTheDocument();
  });
});
