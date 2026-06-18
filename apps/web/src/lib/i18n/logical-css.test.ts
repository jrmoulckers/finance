// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { findPhysicalCssProperties, replacePhysicalCssProperties } from './logical-css';

describe('logical-css', () => {
  it('finds physical left/right properties for localized surfaces', () => {
    expect(
      findPhysicalCssProperties('.card { margin-left: 1rem; right: 0; text-align: right; }'),
    ).toEqual([
      { line: 1, column: 9, property: 'margin-left', suggestedProperty: 'margin-inline-start' },
      { line: 1, column: 28, property: 'right', suggestedProperty: 'inset-inline-end' },
    ]);
  });

  it('can rewrite straightforward physical properties to logical equivalents', () => {
    expect(
      replacePhysicalCssProperties('.card { padding-right: 1rem; border-left: 1px solid; }'),
    ).toBe('.card { padding-inline-end: 1rem; border-inline-start: 1px solid; }');
  });
});
