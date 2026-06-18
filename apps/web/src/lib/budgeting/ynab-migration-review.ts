// SPDX-License-Identifier: BUSL-1.1

export type YnabClearedState = 'cleared' | 'uncleared' | 'reconciled';

export interface YnabMigrationRow {
  readonly Account?: string;
  readonly 'Account Name'?: string;
  readonly Category?: string;
  readonly 'Category Group'?: string;
  readonly 'Category Group/Category'?: string;
  readonly Memo?: string;
  readonly Flag?: string;
  readonly Cleared?: string;
  readonly Inflow?: string;
  readonly Outflow?: string;
  readonly Amount?: string;
  readonly [key: string]: string | undefined;
}

export interface YnabMigrationReviewRecord {
  readonly accountName: string;
  readonly categoryGroupName: string | null;
  readonly categoryName: string | null;
  readonly memo: string;
  readonly flag: string | null;
  readonly clearedState: YnabClearedState;
  readonly amountCents: number;
  readonly warnings: readonly string[];
}

export interface YnabMigrationReview {
  readonly records: readonly YnabMigrationReviewRecord[];
  readonly warnings: readonly string[];
}

function parseMoney(value: string | undefined): number | null {
  if (!value || value.trim().length === 0) return null;
  const negative = /^\s*\(/.test(value) || /^\s*-/.test(value);
  const cleaned = value.replace(/[(),$€£¥\s]/g, '').replace(/^[-+]/, '');
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) * (negative ? -1 : 1);
}

function parseCategory(row: YnabMigrationRow): {
  categoryGroupName: string | null;
  categoryName: string | null;
} {
  const explicitGroup = row['Category Group']?.trim();
  const combined = row['Category Group/Category']?.trim() ?? row.Category?.trim() ?? '';
  if (combined.includes(':')) {
    const [group, ...categoryParts] = combined.split(':');
    return {
      categoryGroupName:
        explicitGroup && explicitGroup.length > 0 ? explicitGroup : group.trim() || null,
      categoryName: categoryParts.join(':').trim() || null,
    };
  }

  return {
    categoryGroupName: explicitGroup && explicitGroup.length > 0 ? explicitGroup : null,
    categoryName: combined.length > 0 ? combined : null,
  };
}

function parseCleared(value: string | undefined): YnabClearedState {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (normalized === 'r' || normalized === 'reconciled') return 'reconciled';
  if (normalized === 'c' || normalized === 'cleared' || normalized === 'yes') return 'cleared';
  return 'uncleared';
}

function chooseAmount(row: YnabMigrationRow): { amountCents: number; warnings: readonly string[] } {
  const warnings: string[] = [];
  const signedAmount = parseMoney(row.Amount);
  const inflow = parseMoney(row.Inflow) ?? 0;
  const outflow = parseMoney(row.Outflow) ?? 0;
  const splitAmount = inflow - Math.abs(outflow);

  if (signedAmount !== null) {
    if ((row.Inflow || row.Outflow) && splitAmount !== 0 && signedAmount !== splitAmount) {
      warnings.push(
        'Signed amount differs from inflow/outflow columns; signed amount was preserved.',
      );
    }
    return { amountCents: signedAmount, warnings };
  }

  return { amountCents: splitAmount, warnings };
}

export function reviewYnabMigrationRows(rows: readonly YnabMigrationRow[]): YnabMigrationReview {
  const records = rows.map((row) => {
    const amount = chooseAmount(row);
    const category = parseCategory(row);
    return {
      accountName: (row.Account ?? row['Account Name'] ?? '').trim(),
      categoryGroupName: category.categoryGroupName,
      categoryName: category.categoryName,
      memo: row.Memo?.trim() ?? '',
      flag: row.Flag?.trim() || null,
      clearedState: parseCleared(row.Cleared),
      amountCents: amount.amountCents,
      warnings: amount.warnings,
    };
  });

  return {
    records,
    warnings: records.flatMap((record) => record.warnings),
  };
}
