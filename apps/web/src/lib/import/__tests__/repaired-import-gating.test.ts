// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { createRepairableRow } from '../import-repair';
import { applyOcrRepairSuggestion, buildRepairedImportGate } from '../repaired-import-gating';

describe('repaired import gating', () => {
  it('blocks unresolved errors and requires warning confirmation', () => {
    const broken = createRepairableRow({ rowIndex: 0, payee: 'Broken' });
    const warning = createRepairableRow({
      rowIndex: 1,
      date: '2024-01-15',
      amountCents: -100,
      payee: 'Receipt',
      account: 'Checking',
      note: 'receipt mentioned',
    });

    expect(buildRepairedImportGate({ rows: [broken, warning] }).canCommit).toBe(false);
    const warningGate = buildRepairedImportGate({ rows: [warning] });
    expect(warningGate.requiresWarningConfirmation).toBe(true);
    expect(buildRepairedImportGate({ rows: [warning], warningsConfirmed: true }).canCommit).toBe(true);
  });

  it('applies high-confidence OCR suggestions to repair rows', () => {
    const row = createRepairableRow({ rowIndex: 0, payee: null });

    const repaired = applyOcrRepairSuggestion(row, {
      confidence: 0.91,
      date: '01/15/2024',
      amount: '-5.25',
      payee: 'Cafe',
      account: 'Checking',
    });

    expect(repaired.parsed).toMatchObject({ date: '2024-01-15', amountCents: -525, payee: 'Cafe', account: 'Checking' });
    expect(repaired.issues).toHaveLength(0);
  });
});
