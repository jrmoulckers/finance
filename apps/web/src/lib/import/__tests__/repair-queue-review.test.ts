// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { createRepairableRow } from '../import-repair';
import {
  applySessionRepair,
  createRepairReviewSession,
  filterRepairQueueRows,
  setRepairQueueFilters,
  summarizeRepairFilters,
} from '../repair-queue-review';

describe('repair queue review', () => {
  it('filters blocking, warning, duplicate, and attachment-needed rows', () => {
    const session = createRepairReviewSession([
      createRepairableRow({ rowIndex: 0, payee: 'Broken' }),
      createRepairableRow({
        rowIndex: 1,
        date: '2024-01-15',
        amountCents: -100,
        payee: 'Receipt',
        account: 'Checking',
        note: 'receipt needed',
      }),
      createRepairableRow({
        rowIndex: 2,
        date: '2024-01-15',
        amountCents: -100,
        payee: 'Dup',
        account: 'Checking',
        duplicate: true,
      }),
    ]);

    expect(summarizeRepairFilters(session.queue)).toMatchObject({
      blocking: 3,
      warnings: 2,
      duplicates: 1,
      attachmentNeeded: 1,
    });
    expect(
      filterRepairQueueRows(session.queue, { blocking: true }).map((row) => row.rowIndex),
    ).toEqual([0]);
    expect(
      filterRepairQueueRows(session.queue, { attachmentNeeded: true }).map((row) => row.rowIndex),
    ).toEqual([1]);
    expect(
      filterRepairQueueRows(session.queue, { duplicates: true }).map((row) => row.rowIndex),
    ).toEqual([2]);
  });

  it('persists inline repair edits while filters change', () => {
    let session = createRepairReviewSession([createRepairableRow({ rowIndex: 0, payee: null })]);

    session = applySessionRepair(session, 0, {
      date: '01/15/2024',
      amount: '-12.34',
      payee: 'Coffee',
      account: 'Checking',
    });
    session = setRepairQueueFilters(session, { search: 'coffee' });

    expect(session.rows[0].issues).toHaveLength(0);
    expect(
      filterRepairQueueRows(session.queue, session.filters).map((row) => row.parsed.payee),
    ).toEqual(['Coffee']);
  });
});
