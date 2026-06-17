// SPDX-License-Identifier: BUSL-1.1

export const DASHBOARD_SUMMARY_STORAGE_KEY = 'finance.dashboard.summary.v1';
export const DASHBOARD_SUMMARY_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export interface DashboardSummarySnapshotV1 {
  readonly version: 1;
  readonly capturedAt: number;
  readonly totalBalanceCents: number;
  readonly cashFlowCents: number;
  readonly accountCount: number;
  readonly transactionCount: number;
}

export interface DashboardSummaryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DashboardShellSnapshotState =
  | { readonly mode: 'empty-cache'; readonly snapshot: null }
  | { readonly mode: 'valid-snapshot'; readonly snapshot: DashboardSummarySnapshotV1 }
  | { readonly mode: 'stale-snapshot'; readonly snapshot: null }
  | { readonly mode: 'expired-session'; readonly snapshot: null };

export function persistDashboardSummarySnapshot(
  storage: DashboardSummaryStorage,
  snapshot: Omit<DashboardSummarySnapshotV1, 'version'>,
): DashboardSummarySnapshotV1 {
  const versioned: DashboardSummarySnapshotV1 = { version: 1, ...snapshot };
  storage.setItem(DASHBOARD_SUMMARY_STORAGE_KEY, JSON.stringify(versioned));
  return versioned;
}

export function readDashboardShellSnapshot(
  storage: DashboardSummaryStorage,
  input: { readonly now: number; readonly sessionExpired: boolean; readonly maxAgeMs?: number },
): DashboardShellSnapshotState {
  if (input.sessionExpired) {
    storage.removeItem(DASHBOARD_SUMMARY_STORAGE_KEY);
    return { mode: 'expired-session', snapshot: null };
  }

  const raw = storage.getItem(DASHBOARD_SUMMARY_STORAGE_KEY);
  if (raw === null) return { mode: 'empty-cache', snapshot: null };

  const snapshot = parseDashboardSummarySnapshot(raw);
  const maxAgeMs = input.maxAgeMs ?? DASHBOARD_SUMMARY_MAX_AGE_MS;
  if (snapshot === null || snapshot.capturedAt > input.now || input.now - snapshot.capturedAt > maxAgeMs) {
    storage.removeItem(DASHBOARD_SUMMARY_STORAGE_KEY);
    return { mode: 'stale-snapshot', snapshot: null };
  }

  return { mode: 'valid-snapshot', snapshot };
}

export function parseDashboardSummarySnapshot(raw: string): DashboardSummarySnapshotV1 | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DashboardSummarySnapshotV1>;
    if (parsed.version !== 1) return null;
    if (!isFiniteNumber(parsed.capturedAt)) return null;
    if (!isFiniteNumber(parsed.totalBalanceCents)) return null;
    if (!isFiniteNumber(parsed.cashFlowCents)) return null;
    if (!isFiniteNumber(parsed.accountCount)) return null;
    if (!isFiniteNumber(parsed.transactionCount)) return null;
    return {
      version: 1,
      capturedAt: parsed.capturedAt,
      totalBalanceCents: parsed.totalBalanceCents,
      cashFlowCents: parsed.cashFlowCents,
      accountCount: parsed.accountCount,
      transactionCount: parsed.transactionCount,
    };
  } catch {
    return null;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
