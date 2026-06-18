// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  applyDocumentDirection,
  bidiIsolate,
  getTextDirectionForLocale,
  joinBidiIsolated,
} from './rtl';

describe('rtl utilities', () => {
  it('detects locale direction from language subtags', () => {
    expect(getTextDirectionForLocale('ar')).toBe('rtl');
    expect(getTextDirectionForLocale('he-IL')).toBe('rtl');
    expect(getTextDirectionForLocale('es-ES')).toBe('ltr');
  });

  it('applies document lang and dir attributes', () => {
    const direction = applyDocumentDirection('ar');

    expect(direction).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('isolates currency codes and amounts for mixed-direction text', () => {
    expect(bidiIsolate('USD')).toBe('\u2068USD\u2069');
    expect(bidiIsolate('\u2068USD\u2069')).toBe('\u2068USD\u2069');
    expect(joinBidiIsolated(['USD', '123.45'])).toBe('\u2068USD\u2069 \u2068123.45\u2069');
  });
});
