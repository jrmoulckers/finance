// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for financial education content and glossary utilities.
 *
 * References: #1770
 */

import { describe, it, expect } from 'vitest';
import {
  FINANCIAL_GLOSSARY,
  EDUCATION_CONTENT,
  lookupTerm,
  searchGlossary,
  filterByDifficulty,
  filterByCategory,
  getRelatedTerms,
  getContentByConceptKey,
  filterContentByDifficulty,
  markViewed,
  markUnderstood,
  calculateEducationProgress,
} from './education-content';
import type { ContentCompletion, EducationContent } from './types';

// ---------------------------------------------------------------------------
// Glossary data integrity
// ---------------------------------------------------------------------------

describe('FINANCIAL_GLOSSARY', () => {
  it('has at least 10 terms', () => {
    expect(FINANCIAL_GLOSSARY.length).toBeGreaterThanOrEqual(10);
  });

  it('has unique IDs', () => {
    const ids = FINANCIAL_GLOSSARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has compound_interest term', () => {
    const term = FINANCIAL_GLOSSARY.find((t) => t.id === 'compound_interest');
    expect(term).toBeDefined();
    expect(term?.difficulty).toBe('beginner');
  });
});

describe('EDUCATION_CONTENT', () => {
  it('has at least 5 entries', () => {
    expect(EDUCATION_CONTENT.length).toBeGreaterThanOrEqual(5);
  });

  it('has unique IDs', () => {
    const ids = EDUCATION_CONTENT.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// lookupTerm
// ---------------------------------------------------------------------------

describe('lookupTerm', () => {
  it('finds a term by ID', () => {
    const term = lookupTerm('apr');
    expect(term).toBeDefined();
    expect(term?.term).toContain('APR');
  });

  it('returns undefined for unknown ID', () => {
    expect(lookupTerm('nonexistent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// searchGlossary
// ---------------------------------------------------------------------------

describe('searchGlossary', () => {
  it('finds terms matching keyword in term name', () => {
    const results = searchGlossary('interest');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((t) => t.id === 'compound_interest')).toBe(true);
  });

  it('finds terms matching keyword in definition', () => {
    const results = searchGlossary('purchasing power');
    expect(results.some((t) => t.id === 'inflation')).toBe(true);
  });

  it('is case-insensitive', () => {
    const upper = searchGlossary('COMPOUND');
    const lower = searchGlossary('compound');
    expect(upper.length).toBe(lower.length);
  });

  it('returns empty for no matches', () => {
    expect(searchGlossary('zzzznonexistent')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterByDifficulty
// ---------------------------------------------------------------------------

describe('filterByDifficulty', () => {
  it('returns only beginner terms', () => {
    const result = filterByDifficulty('beginner');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.difficulty === 'beginner')).toBe(true);
  });

  it('returns only advanced terms', () => {
    const result = filterByDifficulty('advanced');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.difficulty === 'advanced')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterByCategory
// ---------------------------------------------------------------------------

describe('filterByCategory', () => {
  it('returns only investing terms', () => {
    const result = filterByCategory('investing');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.category === 'investing')).toBe(true);
  });

  it('returns empty for unknown category', () => {
    expect(filterByCategory('unknown_category')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getRelatedTerms
// ---------------------------------------------------------------------------

describe('getRelatedTerms', () => {
  it('returns related terms for compound_interest', () => {
    const related = getRelatedTerms('compound_interest');
    expect(related.length).toBeGreaterThan(0);
    expect(related.some((t) => t.id === 'apr' || t.id === 'apy')).toBe(true);
  });

  it('returns empty for unknown term', () => {
    expect(getRelatedTerms('nonexistent')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getContentByConceptKey
// ---------------------------------------------------------------------------

describe('getContentByConceptKey', () => {
  it('finds content by concept key', () => {
    const content = getContentByConceptKey('compound_interest');
    expect(content).toBeDefined();
    expect(content?.title).toContain('Compound Interest');
  });

  it('returns undefined for unknown key', () => {
    expect(getContentByConceptKey('nonexistent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// filterContentByDifficulty
// ---------------------------------------------------------------------------

describe('filterContentByDifficulty', () => {
  it('filters content by difficulty', () => {
    const beginner = filterContentByDifficulty('beginner');
    expect(beginner.length).toBeGreaterThan(0);
    expect(beginner.every((c) => c.difficulty === 'beginner')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// markViewed
// ---------------------------------------------------------------------------

describe('markViewed', () => {
  it('adds a new completion entry', () => {
    const result = markViewed([], 'edu_1', '2024-01-15');
    expect(result).toHaveLength(1);
    expect(result[0].contentId).toBe('edu_1');
    expect(result[0].viewed).toBe(true);
    expect(result[0].viewedDate).toBe('2024-01-15');
    expect(result[0].understood).toBe(false);
  });

  it('updates existing entry without overwriting viewedDate', () => {
    const existing: ContentCompletion[] = [
      { contentId: 'edu_1', viewed: true, viewedDate: '2024-01-10', understood: false },
    ];
    const result = markViewed(existing, 'edu_1', '2024-01-15');
    expect(result).toHaveLength(1);
    expect(result[0].viewedDate).toBe('2024-01-10'); // preserved
  });
});

// ---------------------------------------------------------------------------
// markUnderstood
// ---------------------------------------------------------------------------

describe('markUnderstood', () => {
  it('marks content as both viewed and understood', () => {
    const result = markUnderstood([], 'edu_1', '2024-01-15');
    expect(result).toHaveLength(1);
    expect(result[0].viewed).toBe(true);
    expect(result[0].understood).toBe(true);
  });

  it('updates existing entry', () => {
    const existing: ContentCompletion[] = [
      { contentId: 'edu_1', viewed: true, viewedDate: '2024-01-10', understood: false },
    ];
    const result = markUnderstood(existing, 'edu_1', '2024-01-15');
    expect(result[0].understood).toBe(true);
    expect(result[0].viewedDate).toBe('2024-01-10'); // preserved
  });
});

// ---------------------------------------------------------------------------
// calculateEducationProgress
// ---------------------------------------------------------------------------

describe('calculateEducationProgress', () => {
  it('calculates progress from completions', () => {
    const completions: ContentCompletion[] = [
      {
        contentId: 'edu_compound_interest',
        viewed: true,
        viewedDate: '2024-01-01',
        understood: true,
      },
      { contentId: 'edu_apr_vs_apy', viewed: true, viewedDate: '2024-01-02', understood: false },
    ];
    const progress = calculateEducationProgress(completions);
    expect(progress.totalItems).toBe(EDUCATION_CONTENT.length);
    expect(progress.viewedCount).toBe(2);
    expect(progress.understoodCount).toBe(1);
    expect(progress.completionPercent).toBeGreaterThan(0);
  });

  it('returns zero progress with no completions', () => {
    const progress = calculateEducationProgress([]);
    expect(progress.viewedCount).toBe(0);
    expect(progress.understoodCount).toBe(0);
    expect(progress.completionPercent).toBe(0);
  });

  it('handles empty content array', () => {
    const progress = calculateEducationProgress([], []);
    expect(progress.totalItems).toBe(0);
    expect(progress.completionPercent).toBe(0);
  });

  it('breaks down by difficulty', () => {
    const completions: ContentCompletion[] = [
      {
        contentId: 'edu_compound_interest',
        viewed: true,
        viewedDate: '2024-01-01',
        understood: true,
      },
    ];
    const progress = calculateEducationProgress(completions);
    expect(progress.byDifficulty.beginner.total).toBeGreaterThan(0);
  });

  it('uses custom content array', () => {
    const customContent: EducationContent[] = [
      {
        id: 'custom1',
        conceptKey: 'test',
        title: 'Test',
        shortExplanation: 'Test',
        fullExplanation: 'Test',
        example: 'Test',
        difficulty: 'beginner',
        relatedTermIds: [],
      },
    ];
    const completions: ContentCompletion[] = [
      { contentId: 'custom1', viewed: true, viewedDate: '2024-01-01', understood: true },
    ];
    const progress = calculateEducationProgress(completions, customContent);
    expect(progress.totalItems).toBe(1);
    expect(progress.completionPercent).toBe(100);
  });
});
