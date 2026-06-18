// SPDX-License-Identifier: BUSL-1.1

/** Data-source-agnostic crypto dashboard state model. References: issue #2700 */
export type CryptoDataSourceState = 'ok' | 'stale' | 'failed' | 'manual' | 'missing-quote';

export interface CryptoHoldingInput {
  readonly sourceId: string;
  readonly accountId: string;
  readonly asset: string;
  readonly quantity: number;
  readonly costBasisCents?: number;
}

export interface CryptoQuoteInput {
  readonly asset: string;
  readonly priceCents: number;
  readonly currency: string;
  readonly asOf: string;
  readonly move24hBps?: number;
  readonly move7dBps?: number;
  readonly sourceId: string;
}

export interface CryptoSourceStatus {
  readonly sourceId: string;
  readonly state: CryptoDataSourceState;
  readonly message?: string;
}

export interface CryptoDashboardRow {
  readonly asset: string;
  readonly quantity: number;
  readonly valueCents: number;
  readonly costBasisCents?: number;
  readonly unrealizedPnlCents?: number;
  readonly move24hBps?: number;
  readonly move7dBps?: number;
  readonly sourceBreakdown: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
}

export interface CryptoDashboardState {
  readonly currency: string;
  readonly rows: readonly CryptoDashboardRow[];
  readonly totalValueCents: number;
  readonly warnings: readonly string[];
  readonly sourceStatuses: readonly CryptoSourceStatus[];
}

export function buildCryptoDashboardState(input: {
  readonly holdings: readonly CryptoHoldingInput[];
  readonly quotes: readonly CryptoQuoteInput[];
  readonly sourceStatuses?: readonly CryptoSourceStatus[];
  readonly now: string;
  readonly staleAfterMs: number;
  readonly currency: string;
}): CryptoDashboardState {
  const quoteByAsset = new Map(input.quotes.map((quote) => [quote.asset.toUpperCase(), quote]));
  const groups = new Map<string, CryptoHoldingInput[]>();
  for (const holding of input.holdings) {
    const asset = holding.asset.toUpperCase();
    groups.set(asset, [...(groups.get(asset) ?? []), holding]);
  }

  const rows: CryptoDashboardRow[] = [];
  const warnings = new Set<string>();
  const nowMs = new Date(input.now).getTime();
  for (const [asset, holdings] of groups) {
    const quote = quoteByAsset.get(asset);
    const quantity = holdings.reduce((sum, holding) => sum + holding.quantity, 0);
    const costBasis = holdings.reduce((sum, holding) => sum + (holding.costBasisCents ?? 0), 0);
    const sourceBreakdown: Record<string, number> = {};
    for (const holding of holdings)
      sourceBreakdown[holding.sourceId] =
        (sourceBreakdown[holding.sourceId] ?? 0) + holding.quantity;
    const rowWarnings: string[] = [];
    if (!quote) {
      rowWarnings.push('missing quote');
      warnings.add(`${asset}: missing quote`);
    } else if (nowMs - new Date(quote.asOf).getTime() > input.staleAfterMs) {
      rowWarnings.push('stale quote');
      warnings.add(`${asset}: stale quote`);
    }
    const valueCents = quote ? Math.round(quantity * quote.priceCents) : 0;
    rows.push({
      asset,
      quantity,
      valueCents,
      costBasisCents: costBasis || undefined,
      unrealizedPnlCents: costBasis ? valueCents - costBasis : undefined,
      move24hBps: quote?.move24hBps,
      move7dBps: quote?.move7dBps,
      sourceBreakdown,
      warnings: rowWarnings,
    });
  }

  for (const status of input.sourceStatuses ?? []) {
    if (status.state === 'failed' || status.state === 'stale')
      warnings.add(`${status.sourceId}: ${status.message ?? status.state}`);
  }

  return {
    currency: input.currency,
    rows: rows.sort((a, b) => b.valueCents - a.valueCents || a.asset.localeCompare(b.asset)),
    totalValueCents: rows.reduce((sum, row) => sum + row.valueCents, 0),
    warnings: [...warnings].sort(),
    sourceStatuses: input.sourceStatuses ?? [],
  };
}
