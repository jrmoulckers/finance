import { describe, expect, it } from 'vitest';
import { formatCount, pluralize } from './pluralize';

describe('pluralize', () => {
  it('returns the singular form for a count of 1', () => {
    expect(pluralize(1, 'day')).toBe('day');
    expect(pluralize(1, 'bill')).toBe('bill');
  });

  it('returns the plural form for 0 and counts greater than 1', () => {
    expect(pluralize(0, 'day')).toBe('days');
    expect(pluralize(2, 'day')).toBe('days');
    expect(pluralize(12, 'month')).toBe('months');
  });

  it('treats a count of -1 as singular', () => {
    expect(pluralize(-1, 'month')).toBe('month');
    expect(pluralize(-3, 'month')).toBe('months');
  });

  it('supports irregular explicit plurals', () => {
    expect(pluralize(1, 'entry', 'entries')).toBe('entry');
    expect(pluralize(4, 'entry', 'entries')).toBe('entries');
  });
});

describe('formatCount', () => {
  it('combines the count with the pluralized noun', () => {
    expect(formatCount(1, 'day')).toBe('1 day');
    expect(formatCount(3, 'day')).toBe('3 days');
    expect(formatCount(0, 'transaction')).toBe('0 transactions');
  });
});
