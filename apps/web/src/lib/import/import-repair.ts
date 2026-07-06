// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure import repair queue helpers for reviewing malformed rows and attachments.
 * References: #2283.
 */

import { parseCurrencyToCents, parseDate } from './csv-parser';

export type RepairSeverity = 'blocking' | 'warning' | 'info';
export type RepairField =
  'date' | 'amount' | 'payee' | 'category' | 'account' | 'note' | 'sourceReference';
export type DuplicateRepairAction = 'skip' | 'import' | 'replace';

export interface RepairIssue {
  readonly code: string;
  readonly rowIndex: number;
  readonly field: RepairField | null;
  readonly severity: RepairSeverity;
  readonly message: string;
  readonly suggestion: string | null;
}

export interface ImportAttachmentDraft {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface RepairableImportRow {
  readonly rowIndex: number;
  readonly parsed: {
    readonly date: string | null;
    readonly amountCents: number | null;
    readonly payee: string | null;
    readonly category: string | null;
    readonly account: string | null;
    readonly note: string | null;
    readonly sourceReference: string | null;
  };
  readonly issues: readonly RepairIssue[];
  readonly duplicate: boolean;
  readonly attachments: readonly ImportAttachmentDraft[];
}

export interface RepairQueue {
  readonly rows: readonly RepairableImportRow[];
  readonly blocking: readonly RepairIssue[];
  readonly warnings: readonly RepairIssue[];
  readonly duplicates: readonly RepairableImportRow[];
  readonly attachmentNeeded: readonly RepairableImportRow[];
  readonly readyCount: number;
}

export interface RepairChangeSet {
  readonly date?: string;
  readonly amount?: string;
  readonly payee?: string;
  readonly category?: string | null;
  readonly account?: string | null;
  readonly note?: string | null;
  readonly sourceReference?: string | null;
}

export interface RepairCommitPlan {
  readonly importableRows: readonly RepairableImportRow[];
  readonly skippedDuplicateRows: readonly RepairableImportRow[];
  readonly blockedRows: readonly RepairableImportRow[];
  readonly warningRows: readonly RepairableImportRow[];
  readonly attachmentCount: number;
  readonly canCommit: boolean;
}

export function buildRepairQueue(rows: readonly RepairableImportRow[]): RepairQueue {
  const blocking = rows.flatMap((row) =>
    row.issues.filter((issue) => issue.severity === 'blocking'),
  );
  const warnings = rows.flatMap((row) =>
    row.issues.filter((issue) => issue.severity === 'warning'),
  );
  const duplicates = rows.filter((row) => row.duplicate);
  const attachmentNeeded = rows.filter((row) =>
    row.issues.some((issue) => issue.code === 'attachment_needed'),
  );
  const readyCount = rows.filter((row) => !hasBlockingIssue(row)).length;

  return { rows, blocking, warnings, duplicates, attachmentNeeded, readyCount };
}

export function createRepairableRow(input: {
  readonly rowIndex: number;
  readonly date?: string | null;
  readonly amountCents?: number | null;
  readonly payee?: string | null;
  readonly category?: string | null;
  readonly account?: string | null;
  readonly note?: string | null;
  readonly sourceReference?: string | null;
  readonly duplicate?: boolean;
  readonly attachments?: readonly ImportAttachmentDraft[];
}): RepairableImportRow {
  const row: RepairableImportRow = {
    rowIndex: input.rowIndex,
    parsed: {
      date: input.date ?? null,
      amountCents: input.amountCents ?? null,
      payee: input.payee ?? null,
      category: input.category ?? null,
      account: input.account ?? null,
      note: input.note ?? null,
      sourceReference: input.sourceReference ?? null,
    },
    issues: [],
    duplicate: input.duplicate ?? false,
    attachments: input.attachments ?? [],
  };
  return validateRepairRow(row);
}

export function applyRepair(
  row: RepairableImportRow,
  changes: RepairChangeSet,
): RepairableImportRow {
  const next = {
    ...row,
    parsed: {
      ...row.parsed,
      date: changes.date !== undefined ? parseDate(changes.date) : row.parsed.date,
      amountCents:
        changes.amount !== undefined
          ? parseCurrencyToCents(changes.amount)
          : row.parsed.amountCents,
      payee: changes.payee !== undefined ? emptyToNull(changes.payee) : row.parsed.payee,
      category:
        changes.category !== undefined ? emptyToNull(changes.category) : row.parsed.category,
      account: changes.account !== undefined ? emptyToNull(changes.account) : row.parsed.account,
      note: changes.note !== undefined ? emptyToNull(changes.note) : row.parsed.note,
      sourceReference:
        changes.sourceReference !== undefined
          ? emptyToNull(changes.sourceReference)
          : row.parsed.sourceReference,
    },
  };
  return validateRepairRow(next);
}

export function linkImportAttachment(
  row: RepairableImportRow,
  attachment: ImportAttachmentDraft,
): RepairableImportRow {
  const withoutDuplicate = row.attachments.filter((item) => item.id !== attachment.id);
  return validateRepairRow({ ...row, attachments: [...withoutDuplicate, attachment] });
}

export function buildRepairCommitPlan(
  rows: readonly RepairableImportRow[],
  duplicateActions: Readonly<Record<number, DuplicateRepairAction>> = {},
): RepairCommitPlan {
  const blockedRows = rows.filter(hasBlockingIssue);
  const skippedDuplicateRows = rows.filter(
    (row) => row.duplicate && (duplicateActions[row.rowIndex] ?? 'skip') === 'skip',
  );
  const importableRows = rows.filter(
    (row) =>
      !hasBlockingIssue(row) &&
      !skippedDuplicateRows.some((skip) => skip.rowIndex === row.rowIndex),
  );
  const warningRows = importableRows.filter((row) =>
    row.issues.some((issue) => issue.severity === 'warning'),
  );

  return {
    importableRows,
    skippedDuplicateRows,
    blockedRows,
    warningRows,
    attachmentCount: importableRows.reduce((total, row) => total + row.attachments.length, 0),
    canCommit: blockedRows.length === 0,
  };
}

function validateRepairRow(row: RepairableImportRow): RepairableImportRow {
  const issues: RepairIssue[] = [];
  if (!row.parsed.date) {
    issues.push(
      makeIssue(row.rowIndex, 'date', 'blocking', 'missing_date', 'A valid date is required.'),
    );
  }
  if (row.parsed.amountCents === null) {
    issues.push(
      makeIssue(
        row.rowIndex,
        'amount',
        'blocking',
        'missing_amount',
        'A valid amount is required.',
      ),
    );
  }
  if (!row.parsed.payee) {
    issues.push(
      makeIssue(
        row.rowIndex,
        'payee',
        'warning',
        'missing_payee',
        'Add a payee for easier review.',
      ),
    );
  }
  if (!row.parsed.account) {
    issues.push(
      makeIssue(row.rowIndex, 'account', 'blocking', 'missing_account', 'Choose a target account.'),
    );
  }
  if (row.duplicate) {
    issues.push(
      makeIssue(row.rowIndex, null, 'warning', 'possible_duplicate', 'Review duplicate action.'),
    );
  }
  if (/receipt|invoice/i.test(row.parsed.note ?? '') && row.attachments.length === 0) {
    issues.push(
      makeIssue(
        row.rowIndex,
        'note',
        'warning',
        'attachment_needed',
        'Attach the referenced receipt or invoice before import if available.',
      ),
    );
  }
  return { ...row, issues };
}

function makeIssue(
  rowIndex: number,
  field: RepairField | null,
  severity: RepairSeverity,
  code: string,
  message: string,
): RepairIssue {
  return { rowIndex, field, severity, code, message, suggestion: null };
}

function hasBlockingIssue(row: RepairableImportRow): boolean {
  return row.issues.some((issue) => issue.severity === 'blocking');
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
