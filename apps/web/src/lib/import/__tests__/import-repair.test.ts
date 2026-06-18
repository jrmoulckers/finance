// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  applyRepair,
  buildRepairCommitPlan,
  buildRepairQueue,
  createRepairableRow,
  linkImportAttachment,
} from '../import-repair';

describe('import repair queue', () => {
  it('groups blocking errors, warnings, duplicates, and attachment-needed rows', () => {
    const rows = [
      createRepairableRow({ rowIndex: 0, payee: 'Coffee', duplicate: true }),
      createRepairableRow({
        rowIndex: 1,
        date: '2024-01-15',
        amountCents: -1299,
        payee: 'Office supply',
        account: 'Checking',
        note: 'receipt expected',
      }),
    ];

    const queue = buildRepairQueue(rows);

    expect(queue.blocking.map((issue) => issue.code)).toEqual([
      'missing_date',
      'missing_amount',
      'missing_account',
    ]);
    expect(queue.duplicates.map((row) => row.rowIndex)).toEqual([0]);
    expect(queue.attachmentNeeded.map((row) => row.rowIndex)).toEqual([1]);
    expect(queue.readyCount).toBe(1);
  });

  it('applies field repairs and revalidates the row', () => {
    const broken = createRepairableRow({ rowIndex: 0, payee: null });

    const repaired = applyRepair(broken, {
      date: '01/15/2024',
      amount: '-12.34',
      payee: 'Coffee Shop',
      account: 'Checking',
    });

    expect(repaired.parsed.date).toBe('2024-01-15');
    expect(repaired.parsed.amountCents).toBe(-1234);
    expect(repaired.issues).toHaveLength(0);
  });

  it('links receipt attachments and removes attachment-needed warning', () => {
    const row = createRepairableRow({
      rowIndex: 2,
      date: '2024-01-15',
      amountCents: -2500,
      payee: 'Restaurant',
      account: 'Checking',
      note: 'receipt attached later',
    });

    const linked = linkImportAttachment(row, {
      id: 'receipt-1',
      fileName: 'receipt.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });

    expect(row.issues.some((issue) => issue.code === 'attachment_needed')).toBe(true);
    expect(linked.attachments).toHaveLength(1);
    expect(linked.issues.some((issue) => issue.code === 'attachment_needed')).toBe(false);
  });

  it('builds commit plan with blocked rows and skipped duplicates', () => {
    const rows = [
      createRepairableRow({
        rowIndex: 0,
        date: '2024-01-15',
        amountCents: -100,
        payee: 'A',
        account: 'Checking',
      }),
      createRepairableRow({
        rowIndex: 1,
        date: '2024-01-15',
        amountCents: -100,
        payee: 'A',
        account: 'Checking',
        duplicate: true,
      }),
      createRepairableRow({ rowIndex: 2, amountCents: -100, payee: 'Broken' }),
    ];

    const plan = buildRepairCommitPlan(rows, { 1: 'skip' });

    expect(plan.canCommit).toBe(false);
    expect(plan.importableRows.map((row) => row.rowIndex)).toEqual([0]);
    expect(plan.skippedDuplicateRows.map((row) => row.rowIndex)).toEqual([1]);
    expect(plan.blockedRows.map((row) => row.rowIndex)).toEqual([2]);
  });
});
