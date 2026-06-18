// SPDX-License-Identifier: BUSL-1.1

import {
  applyRepair,
  buildRepairQueue,
  type RepairableImportRow,
  type RepairChangeSet,
  type RepairQueue,
} from './import-repair';

export interface RepairQueueFilters {
  readonly blocking?: boolean;
  readonly warnings?: boolean;
  readonly duplicates?: boolean;
  readonly attachmentNeeded?: boolean;
  readonly search?: string;
}

export interface RepairReviewSession {
  readonly rows: readonly RepairableImportRow[];
  readonly filters: RepairQueueFilters;
  readonly queue: RepairQueue;
}

export function createRepairReviewSession(
  rows: readonly RepairableImportRow[],
  filters: RepairQueueFilters = {},
): RepairReviewSession {
  return { rows, filters, queue: buildRepairQueue(rows) };
}

export function filterRepairQueueRows(
  queue: RepairQueue,
  filters: RepairQueueFilters,
): readonly RepairableImportRow[] {
  const normalizedSearch = filters.search?.toLowerCase().trim() ?? '';
  return queue.rows.filter((row) => {
    if (filters.blocking && !row.issues.some((issue) => issue.severity === 'blocking'))
      return false;
    if (filters.warnings && !row.issues.some((issue) => issue.severity === 'warning')) return false;
    if (filters.duplicates && !row.duplicate) return false;
    if (
      filters.attachmentNeeded &&
      !row.issues.some((issue) => issue.code === 'attachment_needed')
    ) {
      return false;
    }
    if (normalizedSearch && !rowMatchesSearch(row, normalizedSearch)) return false;
    return true;
  });
}

export function applySessionRepair(
  session: RepairReviewSession,
  rowIndex: number,
  changes: RepairChangeSet,
): RepairReviewSession {
  const rows = session.rows.map((row) =>
    row.rowIndex === rowIndex ? applyRepair(row, changes) : row,
  );
  return createRepairReviewSession(rows, session.filters);
}

export function setRepairQueueFilters(
  session: RepairReviewSession,
  filters: RepairQueueFilters,
): RepairReviewSession {
  return createRepairReviewSession(session.rows, filters);
}

export function summarizeRepairFilters(
  queue: RepairQueue,
): Record<keyof Omit<RepairQueueFilters, 'search'>, number> {
  return {
    blocking: queue.blocking.length,
    warnings: queue.warnings.length,
    duplicates: queue.duplicates.length,
    attachmentNeeded: queue.attachmentNeeded.length,
  };
}

function rowMatchesSearch(row: RepairableImportRow, search: string): boolean {
  const values = [
    row.parsed.date,
    row.parsed.payee,
    row.parsed.category,
    row.parsed.account,
    row.parsed.note,
    row.parsed.sourceReference,
    ...row.issues.map((issue) => issue.message),
  ];
  return values.some((value) => value?.toLowerCase().includes(search));
}
