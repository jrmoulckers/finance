// SPDX-License-Identifier: BUSL-1.1

export type AuditedRoute = 'dashboard' | 'transactions' | 'import' | 'reports' | 'settings';

export interface RouteChunkSize {
  readonly route: AuditedRoute;
  readonly chunkName: string;
  readonly gzipBytes: number;
  readonly initial: boolean;
}

export interface RouteChunkBudget {
  readonly route: AuditedRoute;
  readonly maxInitialGzipBytes: number;
  readonly maxLazyGzipBytes: number;
}

export interface RouteBudgetWaiver {
  readonly route: AuditedRoute;
  readonly chunkName: string;
  readonly reason: string;
  readonly expiresOn: string;
}

export interface RouteBundleAuditFinding {
  readonly route: AuditedRoute;
  readonly chunkName: string;
  readonly gzipBytes: number;
  readonly budgetBytes: number;
  readonly waived: boolean;
}

export interface RouteBundleAuditReport {
  readonly initialGzipBytes: number;
  readonly largestLazyChunks: readonly RouteChunkSize[];
  readonly findings: readonly RouteBundleAuditFinding[];
  readonly summary: string;
}

export function createRouteBundleAuditReport(
  chunks: readonly RouteChunkSize[],
  budgets: readonly RouteChunkBudget[],
  waivers: readonly RouteBudgetWaiver[] = [],
): RouteBundleAuditReport {
  const budgetByRoute = new Map(budgets.map((budget) => [budget.route, budget] as const));
  const waiverKeys = new Set(waivers.map((waiver) => `${waiver.route}:${waiver.chunkName}`));
  const findings: RouteBundleAuditFinding[] = [];

  for (const chunk of chunks) {
    const budget = budgetByRoute.get(chunk.route);
    if (budget === undefined) continue;
    const budgetBytes = chunk.initial ? budget.maxInitialGzipBytes : budget.maxLazyGzipBytes;
    if (chunk.gzipBytes > budgetBytes) {
      findings.push({
        route: chunk.route,
        chunkName: chunk.chunkName,
        gzipBytes: chunk.gzipBytes,
        budgetBytes,
        waived: waiverKeys.has(`${chunk.route}:${chunk.chunkName}`),
      });
    }
  }

  const initialGzipBytes = chunks
    .filter((chunk) => chunk.initial)
    .reduce((total, chunk) => total + chunk.gzipBytes, 0);
  const largestLazyChunks = chunks
    .filter((chunk) => !chunk.initial)
    .slice()
    .sort((left, right) => right.gzipBytes - left.gzipBytes)
    .slice(0, 5);

  return {
    initialGzipBytes,
    largestLazyChunks,
    findings,
    summary: createRouteBundleCiSummary(initialGzipBytes, largestLazyChunks, findings),
  };
}

export function createRouteBundleCiSummary(
  initialGzipBytes: number,
  largestLazyChunks: readonly RouteChunkSize[],
  findings: readonly RouteBundleAuditFinding[],
): string {
  const lazySummary = largestLazyChunks
    .map((chunk) => `${chunk.route}/${chunk.chunkName}: ${chunk.gzipBytes} gzip bytes`)
    .join('; ');
  const findingSummary =
    findings.length === 0
      ? 'No budget findings.'
      : findings
          .map(
            (finding) =>
              `${finding.route}/${finding.chunkName} ${finding.gzipBytes}/${finding.budgetBytes}${finding.waived ? ' waived' : ''}`,
          )
          .join('; ');
  return `Initial JS: ${initialGzipBytes} gzip bytes. Largest lazy chunks: ${lazySummary || 'none'}. ${findingSummary}`;
}
