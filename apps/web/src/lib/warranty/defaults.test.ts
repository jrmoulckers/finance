// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { suggestReturnWindow } from './defaults';

describe('warranty defaults', () => {
  it('suggests Amazon return windows by merchant', () => {
    const suggestion = suggestReturnWindow('Amazon Marketplace', '2025-05-10');

    expect(suggestion.source).toBe('merchant');
    expect(suggestion.days).toBe(30);
    expect(suggestion.endDate).toBe('2025-06-09');
  });

  it('falls back to category rules for electronics', () => {
    const suggestion = suggestReturnWindow(null, '2025-05-10', 'Electronics');

    expect(suggestion.source).toBe('category');
    expect(suggestion.days).toBe(15);
    expect(suggestion.endDate).toBe('2025-05-25');
  });

  it('uses the standard retail window when no specific rule matches', () => {
    const suggestion = suggestReturnWindow('Local Shop', '2025-05-10');

    expect(suggestion.source).toBe('default');
    expect(suggestion.days).toBe(30);
  });
});
