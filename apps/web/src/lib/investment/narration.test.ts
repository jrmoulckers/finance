// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { narrateFinanceState } from './narration';

describe('narrateFinanceState', () => {
  it('handles empty data with non-alarmist language', () => {
    const summary = narrateFinanceState({ trends: [], spendingChanges: [], alerts: [], confidence: 'low', uncertainty: 'more data will improve this' });

    expect(summary.headline).toBe('No finance activity to summarize yet.');
    expect(summary.confidencePhrase).toBe('Low confidence; more data will improve this.');
  });

  it('summarizes volatile and negative trends without alarmist phrasing', () => {
    const summary = narrateFinanceState({ trends: [{ label: 'Crypto portfolio', direction: 'volatile', changePercent: -8.2 }, { label: 'Net worth', direction: 'down', changePercent: -1.1 }], spendingChanges: [{ category: 'Dining', changeCents: 5000, direction: 'higher' }], alerts: [{ severity: 'warning', message: 'One quote is stale.' }], confidence: 'medium' }, 'detailed');

    expect(summary.details).toContain('Crypto portfolio is moving around more than usual 8.2%.');
    expect(summary.details).toContain('Net worth is lower 1.1%.');
    expect(summary.confidencePhrase).toBe('Moderate confidence.');
  });
});
