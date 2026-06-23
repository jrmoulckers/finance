// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the newcomer (ITIN-aware) plain-language explainer content.
 *
 * References: issue #2178
 */

import { describe, expect, it } from 'vitest';

import {
  NEWCOMER_EXPLAINER_KEYS,
  getNewcomerExplainer,
  listNewcomerExplainers,
  newcomerExplainers,
} from './newcomer-explainers';

describe('newcomer explainers', () => {
  it('provides the four required US-finance basics plus ITIN guidance', () => {
    expect(NEWCOMER_EXPLAINER_KEYS).toEqual([
      'w2',
      'form1099',
      'taxWithholding',
      'retirement401k',
      'itinBasics',
    ]);
  });

  it('gives every explainer a title, link label, body, and why-it-matters', () => {
    for (const key of NEWCOMER_EXPLAINER_KEYS) {
      const entry = newcomerExplainers[key];
      expect(entry.id).toBe(key);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.linkLabel.length).toBeGreaterThan(0);
      expect(entry.body.length).toBeGreaterThan(0);
      expect(entry.whyItMatters.length).toBeGreaterThan(0);
    }
  });

  it('returns a single explainer by key', () => {
    expect(getNewcomerExplainer('itinBasics').title).toMatch(/itin/i);
  });

  it('lists explainers in canonical order, deduped, when a subset is requested', () => {
    const list = listNewcomerExplainers(['itinBasics', 'w2', 'w2']);
    expect(list.map((entry) => entry.id)).toEqual(['w2', 'itinBasics']);
  });

  it('lists every explainer when no subset is given', () => {
    expect(listNewcomerExplainers().map((entry) => entry.id)).toEqual([...NEWCOMER_EXPLAINER_KEYS]);
  });
});
