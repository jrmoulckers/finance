// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { SINGLE_PARENT_FAMILY_TEMPLATE } from '../single-parent-starter-template';

describe('SINGLE_PARENT_FAMILY_TEMPLATE', () => {
  it('provides editable kid-specific envelopes with supportive copy', () => {
    expect(SINGLE_PARENT_FAMILY_TEMPLATE.isAvailable).toBe(true);
    expect(SINGLE_PARENT_FAMILY_TEMPLATE.name).toBe('Single Parent / Family');
    expect(SINGLE_PARENT_FAMILY_TEMPLATE.guidance.toLowerCase()).not.toContain('over budget');
    expect(SINGLE_PARENT_FAMILY_TEMPLATE.categories.map((category) => category.name)).toEqual([
      'Housing',
      'Groceries & Household',
      'Childcare',
      'School',
      'Activities & Sports',
      'Birthdays & Parties',
      'Field Trips',
      'Kids’ Clothing',
      'Family Emergency Buffer',
    ]);
    expect(SINGLE_PARENT_FAMILY_TEMPLATE.categories.every((category) => category.createBudget !== false)).toBe(true);
  });
});
