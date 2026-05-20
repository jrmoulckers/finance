// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { CollaborationNote, ReviewItem } from './types';
import {
  addNote,
  buildCollaborationThread,
  countPendingReviews,
  countTransactionNotes,
  getReviewQueue,
  getTransactionNotes,
  getTransactionReview,
  getTransactionsWithCollaboration,
  resolveReview,
  tagForReview,
} from './collaboration';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = '2025-01-15T10:00:00Z';
const LATER = '2025-01-15T11:00:00Z';
const MEMBER_A = 'member-a';
const MEMBER_B = 'member-b';
const TXN_1 = 'txn-1';
const TXN_2 = 'txn-2';

const SAMPLE_NOTE: CollaborationNote = {
  id: 'note-1',
  transactionId: TXN_1,
  authorId: MEMBER_A,
  authorName: 'Alice',
  content: 'Is this correct?',
  createdAt: NOW,
};

const SAMPLE_REVIEW: ReviewItem = {
  id: 'review-1',
  transactionId: TXN_1,
  flaggedBy: MEMBER_A,
  assignedTo: MEMBER_B,
  status: 'PENDING',
  reason: 'Looks unusual',
  createdAt: NOW,
  resolvedAt: null,
};

// ---------------------------------------------------------------------------
// addNote / getTransactionNotes / countTransactionNotes
// ---------------------------------------------------------------------------

describe('addNote', () => {
  it('appends a note', () => {
    const result = addNote([], SAMPLE_NOTE);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Is this correct?');
  });

  it('preserves existing notes', () => {
    const result = addNote([SAMPLE_NOTE], {
      ...SAMPLE_NOTE,
      id: 'note-2',
      content: 'Reply',
      createdAt: LATER,
    });
    expect(result).toHaveLength(2);
  });
});

describe('getTransactionNotes', () => {
  const notes: CollaborationNote[] = [
    SAMPLE_NOTE,
    { ...SAMPLE_NOTE, id: 'note-2', createdAt: LATER, content: 'Later note' },
    { ...SAMPLE_NOTE, id: 'note-3', transactionId: TXN_2, content: 'Other txn' },
  ];

  it('returns notes for the specified transaction sorted by time', () => {
    const result = getTransactionNotes(notes, TXN_1);
    expect(result).toHaveLength(2);
    expect(result[0].createdAt).toBe(NOW);
    expect(result[1].createdAt).toBe(LATER);
  });

  it('returns empty for transaction with no notes', () => {
    expect(getTransactionNotes(notes, 'txn-none')).toHaveLength(0);
  });
});

describe('countTransactionNotes', () => {
  it('counts notes for a transaction', () => {
    expect(countTransactionNotes([SAMPLE_NOTE], TXN_1)).toBe(1);
  });

  it('returns 0 for no notes', () => {
    expect(countTransactionNotes([], TXN_1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// tagForReview / resolveReview
// ---------------------------------------------------------------------------

describe('tagForReview', () => {
  it('creates a new review item', () => {
    const result = tagForReview(
      [],
      { transactionId: TXN_1, flaggedBy: MEMBER_A, assignedTo: MEMBER_B, reason: 'Check this' },
      'review-new',
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('PENDING');
    expect(result[0].reason).toBe('Check this');
  });

  it('allows null reason', () => {
    const result = tagForReview(
      [],
      { transactionId: TXN_1, flaggedBy: MEMBER_A, assignedTo: MEMBER_B, reason: null },
      'review-new',
      NOW,
    );
    expect(result[0].reason).toBeNull();
  });
});

describe('resolveReview', () => {
  it('approves a review item', () => {
    const result = resolveReview([SAMPLE_REVIEW], 'review-1', 'APPROVED', LATER);
    expect(result[0].status).toBe('APPROVED');
    expect(result[0].resolvedAt).toBe(LATER);
  });

  it('rejects a review item', () => {
    const result = resolveReview([SAMPLE_REVIEW], 'review-1', 'REJECTED', LATER);
    expect(result[0].status).toBe('REJECTED');
  });

  it('does not modify other review items', () => {
    const other: ReviewItem = { ...SAMPLE_REVIEW, id: 'review-2', transactionId: TXN_2 };
    const result = resolveReview([SAMPLE_REVIEW, other], 'review-1', 'APPROVED', LATER);
    expect(result[1].status).toBe('PENDING');
  });
});

// ---------------------------------------------------------------------------
// getReviewQueue / countPendingReviews
// ---------------------------------------------------------------------------

describe('getReviewQueue', () => {
  const items: ReviewItem[] = [
    SAMPLE_REVIEW,
    { ...SAMPLE_REVIEW, id: 'review-2', transactionId: TXN_2, createdAt: LATER },
    { ...SAMPLE_REVIEW, id: 'review-3', assignedTo: MEMBER_A },
  ];

  it('returns items assigned to the specified member', () => {
    const result = getReviewQueue(items, MEMBER_B);
    expect(result).toHaveLength(2);
  });

  it('sorts newest first', () => {
    const result = getReviewQueue(items, MEMBER_B);
    expect(result[0].id).toBe('review-2');
    expect(result[1].id).toBe('review-1');
  });

  it('filters by status when provided', () => {
    const resolved: ReviewItem[] = [{ ...SAMPLE_REVIEW, status: 'APPROVED', resolvedAt: LATER }];
    expect(getReviewQueue(resolved, MEMBER_B, 'PENDING')).toHaveLength(0);
    expect(getReviewQueue(resolved, MEMBER_B, 'APPROVED')).toHaveLength(1);
  });
});

describe('countPendingReviews', () => {
  it('counts pending items for the member', () => {
    expect(countPendingReviews([SAMPLE_REVIEW], MEMBER_B)).toBe(1);
  });

  it('returns 0 when all are resolved', () => {
    const resolved: ReviewItem = { ...SAMPLE_REVIEW, status: 'APPROVED', resolvedAt: LATER };
    expect(countPendingReviews([resolved], MEMBER_B)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getTransactionReview
// ---------------------------------------------------------------------------

describe('getTransactionReview', () => {
  it('returns the review item for a transaction', () => {
    const result = getTransactionReview([SAMPLE_REVIEW], TXN_1);
    expect(result?.id).toBe('review-1');
  });

  it('returns null when no review exists', () => {
    expect(getTransactionReview([], TXN_1)).toBeNull();
  });

  it('returns the most recent review when multiple exist', () => {
    const items: ReviewItem[] = [
      SAMPLE_REVIEW,
      { ...SAMPLE_REVIEW, id: 'review-2', createdAt: LATER },
    ];
    const result = getTransactionReview(items, TXN_1);
    expect(result?.id).toBe('review-2');
  });
});

// ---------------------------------------------------------------------------
// buildCollaborationThread
// ---------------------------------------------------------------------------

describe('buildCollaborationThread', () => {
  it('builds a thread with notes and review', () => {
    const thread = buildCollaborationThread([SAMPLE_NOTE], [SAMPLE_REVIEW], TXN_1);
    expect(thread.transactionId).toBe(TXN_1);
    expect(thread.notes).toHaveLength(1);
    expect(thread.reviewItem?.id).toBe('review-1');
  });

  it('handles transaction with no collaboration', () => {
    const thread = buildCollaborationThread([], [], 'txn-none');
    expect(thread.notes).toHaveLength(0);
    expect(thread.reviewItem).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getTransactionsWithCollaboration
// ---------------------------------------------------------------------------

describe('getTransactionsWithCollaboration', () => {
  it('returns unique transaction IDs from notes and reviews', () => {
    const result = getTransactionsWithCollaboration(
      [SAMPLE_NOTE],
      [{ ...SAMPLE_REVIEW, transactionId: TXN_2 }],
    );
    expect(result).toContain(TXN_1);
    expect(result).toContain(TXN_2);
    expect(result).toHaveLength(2);
  });

  it('deduplicates IDs', () => {
    const result = getTransactionsWithCollaboration(
      [SAMPLE_NOTE],
      [SAMPLE_REVIEW], // same TXN_1
    );
    expect(result).toHaveLength(1);
  });

  it('returns empty when no collaboration exists', () => {
    expect(getTransactionsWithCollaboration([], [])).toHaveLength(0);
  });
});
