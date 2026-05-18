// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { formatTagDisplay, getTagColor, getTagColorDark, getTagRootName } from './tag-colors';

describe('tag-colors', () => {
  describe('getTagRootName', () => {
    it('returns the full name when no subtag separator exists', () => {
      expect(getTagRootName('groceries')).toBe('groceries');
    });

    it('returns the root portion before the colon', () => {
      expect(getTagRootName('travel:flights')).toBe('travel');
    });

    it('handles multiple colons by splitting only on the first', () => {
      expect(getTagRootName('a:b:c')).toBe('a');
    });

    it('returns empty string for a tag starting with colon', () => {
      expect(getTagRootName(':orphan')).toBe('');
    });
  });

  describe('getTagColor', () => {
    it('returns an object with bg, text, and border properties', () => {
      const color = getTagColor('travel');
      expect(color).toHaveProperty('bg');
      expect(color).toHaveProperty('text');
      expect(color).toHaveProperty('border');
    });

    it('produces deterministic colors for the same tag name', () => {
      const first = getTagColor('shopping');
      const second = getTagColor('shopping');
      expect(first).toEqual(second);
    });

    it('produces the same color for a subtag as its root', () => {
      const rootColor = getTagColor('travel');
      const subColor = getTagColor('travel:flights');
      expect(rootColor).toEqual(subColor);
    });

    it('produces different colors for different root tags', () => {
      const a = getTagColor('food');
      const b = getTagColor('travel');
      // At minimum one property should differ
      expect(a.bg !== b.bg || a.text !== b.text || a.border !== b.border).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(getTagColor('Travel')).toEqual(getTagColor('travel'));
    });

    it('trims whitespace', () => {
      expect(getTagColor('  travel  ')).toEqual(getTagColor('travel'));
    });
  });

  describe('getTagColorDark', () => {
    it('returns valid dark color values', () => {
      const color = getTagColorDark('bills');
      expect(color.bg).toContain('hsl');
      expect(color.text).toContain('hsl');
      expect(color.border).toContain('hsl');
    });

    it('produces different values from light mode', () => {
      const light = getTagColor('shopping');
      const dark = getTagColorDark('shopping');
      expect(light.bg).not.toBe(dark.bg);
    });
  });

  describe('formatTagDisplay', () => {
    it('returns root only for simple tags', () => {
      expect(formatTagDisplay('groceries')).toEqual({ root: 'groceries', sub: null });
    });

    it('splits subtags on the first colon', () => {
      expect(formatTagDisplay('travel:flights')).toEqual({ root: 'travel', sub: 'flights' });
    });

    it('handles multiple colons by keeping everything after first colon as sub', () => {
      expect(formatTagDisplay('a:b:c')).toEqual({ root: 'a', sub: 'b:c' });
    });
  });
});
