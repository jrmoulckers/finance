// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { parseFinanceQuery } from './finance-query-parser';

describe('finance query parser', () => {
  it('parses spend by merchant and date range', () => {
    expect(parseFinanceQuery('How much did I spend at Starbucks this month?')).toMatchObject({
      intent: 'spend-by-merchant',
      merchant: 'starbucks',
      dateRange: 'this-month',
    });
  });

  it('parses category, account, and net worth read-only intents', () => {
    expect(parseFinanceQuery('spend on groceries last month')).toMatchObject({ intent: 'spend-by-category', category: 'groceries' });
    expect(parseFinanceQuery('spend from checking today')).toMatchObject({ intent: 'spend-by-account', account: 'checking' });
    expect(parseFinanceQuery('net worth this year')).toMatchObject({ intent: 'net-worth', dateRange: 'this-year' });
  });
});
