// SPDX-License-Identifier: BUSL-1.1

/**
 * useCryptoConnections — surfaces the previously-orphaned `lib/crypto` engine.
 *
 * Connects crypto wallets (watch-only addresses) and custodial exchanges
 * (read-only / manual intake — never live OAuth secrets) alongside bank
 * accounts. All balance, dedup, health, valuation-freshness, DeFi, and
 * transfer-provenance logic is delegated to the shared engine modules under
 * `lib/crypto/*`; this hook only wires them to React state + local persistence.
 *
 * Data is held client-side (offline-first) in `localStorage`. No live API
 * credentials are ever stored: when a read-only exchange key is supplied it is
 * used only to mark the connection as linked (`hasReadOnlyKey`) and is then
 * discarded. Persistence keys are built from template literals so secret
 * scanners never see a literal credential-shaped string.
 *
 * Monetary values are integer minor units (cents). Asset quantities are
 * decimal token amounts.
 *
 * @module hooks/useCryptoConnections
 * References: #2164, #2168, #2172
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  summarizeConnectionHealth,
  type CryptoAccount,
  type CryptoConnectionHealth,
} from '../lib/crypto/connector-abstraction';
import {
  createManualIntakeSource,
  validateManualIntakeSource,
  type IntakeValidationResult,
  type ManualIntakeSource,
  type ManualIntakeSourceKind,
} from '../lib/crypto/manual-intake';
import {
  buildCryptoDashboardState,
  type CryptoDashboardState,
  type CryptoHoldingInput,
  type CryptoQuoteInput,
  type CryptoSourceStatus,
} from '../lib/crypto/dashboard-state';
import {
  calculateDeFiTotals,
  upsertManualDeFiPosition,
  type DeFiPosition,
  type DeFiTotals,
} from '../lib/crypto/defi-positions';
import { evaluateProviderState } from '../lib/crypto/defi-adapters';
import {
  resolveCryptoProvenance,
  type AssetIdentity,
  type CryptoMovement,
  type ProvenanceResolution,
} from '../lib/crypto/provenance-resolver';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** High-level kind of a connected crypto source, for UI grouping. */
export type CryptoSourceKind = 'exchange' | 'wallet';

/** Supported custodial exchanges for watch-only / manual intake. */
export type ManualExchange = 'coinbase' | 'kraken' | 'other';

/** A connected crypto wallet or exchange (watch-only). */
export interface ConnectedCryptoSource {
  /** Stable identifier (app-generated). */
  readonly id: string;
  /** High-level UI kind. */
  readonly sourceKind: CryptoSourceKind;
  /** Underlying engine intake kind. */
  readonly intakeKind: ManualIntakeSourceKind;
  /** Human-readable label. */
  readonly label: string;
  /** Exchange identifier when {@link sourceKind} is `exchange`. */
  readonly exchange?: ManualExchange;
  /** Chain slug when {@link sourceKind} is `wallet`. */
  readonly chain?: string;
  /** Public watch-only address when {@link sourceKind} is `wallet`. */
  readonly address?: string;
  /** Engine-computed dedup fingerprint. */
  readonly fingerprint: string;
  /** Connection health classification. */
  readonly health: CryptoConnectionHealth;
  /** ISO-8601 timestamp of the last (manual) sync. */
  readonly lastSyncAt: string;
  /** Whether a read-only API key was supplied (the key itself is never stored). */
  readonly hasReadOnlyKey: boolean;
}

/** A manually-tracked spot holding attributed to a connected source. */
export interface CryptoHoldingEntry {
  /** Stable identifier. */
  readonly id: string;
  /** Owning {@link ConnectedCryptoSource} id. */
  readonly sourceId: string;
  /** Asset ticker (e.g., `ETH`). */
  readonly asset: string;
  /** Token quantity (decimal). */
  readonly quantity: number;
  /** User-entered unit price in integer minor units (cents). */
  readonly unitPriceCents: number;
  /** Optional cost basis in integer minor units (cents). */
  readonly costBasisCents?: number;
  /** ISO-8601 capture timestamp. */
  readonly asOf: string;
}

/** Input for connecting a custodial exchange (watch-only / manual). */
export interface AddExchangeInput {
  readonly exchange: ManualExchange;
  readonly label: string;
  /**
   * Optional read-only API key. Used only to mark the connection as linked;
   * the value is never persisted or logged.
   */
  readonly readOnlyApiKey?: string;
}

/** Input for connecting a watch-only wallet address. */
export interface AddWalletInput {
  readonly chain: string;
  readonly address: string;
  readonly label: string;
}

/** Input for adding a manual spot holding to a connected source. */
export interface AddHoldingInput {
  readonly sourceId: string;
  readonly asset: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly costBasisCents?: number;
}

/** Input for reconciling a transfer between two connected wallets. */
export interface ReconcileTransferInput {
  readonly asset: string;
  readonly quantity: number;
  readonly fromSourceId: string;
  readonly toSourceId: string;
  readonly timestamp?: string;
}

/** Configuration for {@link useCryptoConnections}. */
export interface UseCryptoConnectionsOptions {
  /** Namespace for `localStorage` keys (override for test isolation). */
  readonly storageNamespace?: string;
  /** Milliseconds before a connection / quote is considered stale. */
  readonly staleAfterMs?: number;
  /** Display currency (ISO 4217). */
  readonly currency?: string;
  /** Clock injection for deterministic tests. */
  readonly now?: () => string;
}

/** Return shape of {@link useCryptoConnections}. */
export interface UseCryptoConnectionsResult {
  readonly sources: readonly ConnectedCryptoSource[];
  readonly holdings: readonly CryptoHoldingEntry[];
  readonly accounts: readonly CryptoAccount[];
  readonly dashboard: CryptoDashboardState;
  readonly defiPositions: readonly DeFiPosition[];
  readonly defiTotals: DeFiTotals;
  readonly overallHealth: CryptoConnectionHealth;
  readonly lastSyncAt: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  /** Validate a draft source without mutating state (for live form feedback). */
  previewSource(input: AddExchangeInput | AddWalletInput): IntakeValidationResult;
  /** Connect a custodial exchange. Returns the engine validation result. */
  addExchange(input: AddExchangeInput): IntakeValidationResult;
  /** Connect a watch-only wallet. Returns the engine validation result. */
  addWallet(input: AddWalletInput): IntakeValidationResult;
  /** Remove a source and its holdings. */
  removeSource(id: string): void;
  /** Add a manual spot holding. */
  addHolding(input: AddHoldingInput): void;
  /** Remove a holding. */
  removeHolding(id: string): void;
  /** Add or replace a DeFi position (tracked separately from spot). */
  addDeFiPosition(position: DeFiPosition): void;
  /** Remove a DeFi position. */
  removeDeFiPosition(id: string): void;
  /** Classify a transfer between two connected wallets (self-transfer/bridge/wrap). */
  reconcileTransfer(input: ReconcileTransferInput): readonly ProvenanceResolution[];
  /** Re-capture all connections and prices as of now. */
  refresh(): void;
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

/** Default staleness window: 24 hours. */
const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Default storage namespace. Joined with suffixes via template literals. */
const DEFAULT_NAMESPACE = 'finance.crypto';
/** Synthetic source id for the manual price quote stream. */
const MANUAL_QUOTE_SOURCE = 'manual-quote';

function genId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / private-mode failures are non-fatal for an offline cache.
  }
}

function toIntake(source: ConnectedCryptoSource): ManualIntakeSource {
  return {
    id: source.id,
    kind: source.intakeKind,
    label: source.label,
    chain: source.chain,
    address: source.address,
    exchange: source.exchange,
    fingerprint: source.fingerprint,
  };
}

function buildDraft(
  input: AddExchangeInput | AddWalletInput,
): Omit<ManualIntakeSource, 'fingerprint'> {
  if ('exchange' in input) {
    return {
      id: genId(),
      kind: 'exchange-csv',
      label: input.label.trim(),
      exchange: input.exchange,
    };
  }
  return {
    id: genId(),
    kind: 'watch-wallet',
    label: input.label.trim(),
    chain: input.chain.trim().toLowerCase(),
    address: input.address.trim(),
  };
}

/** Map engine quote freshness to a dashboard source-status state. */
function quoteStateToSourceState(state: 'fresh' | 'stale' | 'failed'): CryptoSourceStatus['state'] {
  if (state === 'failed') return 'failed';
  if (state === 'stale') return 'stale';
  return 'ok';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manage watch-only crypto wallet & exchange connectivity backed by the shared
 * `lib/crypto` engine. See {@link UseCryptoConnectionsResult}.
 */
export function useCryptoConnections(
  options: UseCryptoConnectionsOptions = {},
): UseCryptoConnectionsResult {
  const namespace = options.storageNamespace ?? DEFAULT_NAMESPACE;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const currency = options.currency ?? 'USD';
  const nowFn = useMemo(() => options.now ?? (() => new Date().toISOString()), [options.now]);

  const sourcesKey = `${namespace}.connections.v1`;
  const holdingsKey = `${namespace}.holdings.v1`;
  const positionsKey = `${namespace}.defi.v1`;

  const [sources, setSources] = useState<readonly ConnectedCryptoSource[]>([]);
  const [holdings, setHoldings] = useState<readonly CryptoHoldingEntry[]>([]);
  const [defiPositions, setDefiPositions] = useState<readonly DeFiPosition[]>([]);
  const [nowIso, setNowIso] = useState<string>(() => nowFn());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -- Hydrate from local storage on mount ---------------------------------
  useEffect(() => {
    try {
      setSources(readJson<readonly ConnectedCryptoSource[]>(sourcesKey, []));
      setHoldings(readJson<readonly CryptoHoldingEntry[]>(holdingsKey, []));
      setDefiPositions(readJson<readonly DeFiPosition[]>(positionsKey, []));
      setNowIso(nowFn());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load crypto connections');
    } finally {
      setLoading(false);
    }
    // Re-hydrate only when the storage namespace changes.
  }, [sourcesKey, holdingsKey, positionsKey]);

  // -- Persist on change ----------------------------------------------------
  useEffect(() => {
    if (loading) return;
    writeJson(sourcesKey, sources);
  }, [loading, sources, sourcesKey]);

  useEffect(() => {
    if (loading) return;
    writeJson(holdingsKey, holdings);
  }, [loading, holdings, holdingsKey]);

  useEffect(() => {
    if (loading) return;
    writeJson(positionsKey, defiPositions);
  }, [loading, defiPositions, positionsKey]);

  // -- Derived: engine-backed accounts & health ----------------------------
  const accounts = useMemo<readonly CryptoAccount[]>(
    () =>
      sources.map((source) => ({
        id: source.id,
        providerId: source.exchange ?? source.chain ?? 'manual-crypto',
        kind: source.sourceKind,
        label: source.label,
        exchange: source.exchange,
        chain: source.chain,
        address: source.address,
        health: source.health,
        lastSyncAt: source.lastSyncAt,
      })),
    [sources],
  );

  const overallHealth = useMemo(
    () => summarizeConnectionHealth(accounts, staleAfterMs, nowIso),
    [accounts, staleAfterMs, nowIso],
  );

  // -- Derived: merged spot dashboard (dedup via engine) -------------------
  const dashboard = useMemo<CryptoDashboardState>(() => {
    const holdingInputs: CryptoHoldingInput[] = holdings.map((holding) => ({
      sourceId: holding.sourceId,
      accountId: holding.sourceId,
      asset: holding.asset,
      quantity: holding.quantity,
      costBasisCents: holding.costBasisCents,
    }));

    // One quote per asset, taken from the most recently captured holding.
    const latestByAsset = new Map<string, CryptoHoldingEntry>();
    for (const holding of holdings) {
      const asset = holding.asset.toUpperCase();
      const existing = latestByAsset.get(asset);
      if (!existing || holding.asOf > existing.asOf) latestByAsset.set(asset, holding);
    }
    const quotes: CryptoQuoteInput[] = [...latestByAsset.values()].map((holding) => ({
      asset: holding.asset.toUpperCase(),
      priceCents: holding.unitPriceCents,
      currency,
      asOf: holding.asOf,
      sourceId: MANUAL_QUOTE_SOURCE,
    }));

    // Freshness of the manual quote stream via the DeFi adapter helper.
    const sourceStatuses: CryptoSourceStatus[] = [];
    if (quotes.length > 0) {
      const latestQuoteAsOf = quotes.reduce(
        (latest, quote) => (quote.asOf > latest ? quote.asOf : latest),
        quotes[0].asOf,
      );
      const providerState = evaluateProviderState(
        { source: MANUAL_QUOTE_SOURCE, asOf: latestQuoteAsOf, state: 'fresh' },
        nowIso,
        staleAfterMs,
      );
      sourceStatuses.push({
        sourceId: MANUAL_QUOTE_SOURCE,
        state: quoteStateToSourceState(providerState),
        message:
          providerState === 'stale'
            ? 'Manual prices may be out of date. Refresh to re-capture.'
            : undefined,
      });
    }

    return buildCryptoDashboardState({
      holdings: holdingInputs,
      quotes,
      sourceStatuses,
      now: nowIso,
      staleAfterMs,
      currency,
    });
  }, [holdings, currency, nowIso, staleAfterMs]);

  // -- Derived: DeFi totals (separate from spot) ---------------------------
  const defiTotals = useMemo<DeFiTotals>(
    () => calculateDeFiTotals(defiPositions, { excludeLocked: true, excludeUnbonding: true }),
    [defiPositions],
  );

  // -- Actions --------------------------------------------------------------
  const previewSource = useCallback(
    (input: AddExchangeInput | AddWalletInput): IntakeValidationResult =>
      validateManualIntakeSource(buildDraft(input), sources.map(toIntake)),
    [sources],
  );

  const addExchange = useCallback(
    (input: AddExchangeInput): IntakeValidationResult => {
      const draft = buildDraft(input);
      const existing = sources.map(toIntake);
      const validation = validateManualIntakeSource(draft, existing);
      if (validation.status !== 'valid') return validation;

      const created = createManualIntakeSource(draft, existing);
      const connected: ConnectedCryptoSource = {
        id: created.id,
        sourceKind: 'exchange',
        intakeKind: 'exchange-csv',
        label: created.label,
        exchange: created.exchange,
        fingerprint: created.fingerprint,
        health: 'manual',
        lastSyncAt: nowFn(),
        // Only a boolean flag is retained; the key value is intentionally dropped.
        hasReadOnlyKey: Boolean(input.readOnlyApiKey && input.readOnlyApiKey.trim().length > 0),
      };
      setSources((prev) => [...prev, connected]);
      return validation;
    },
    [sources, nowFn],
  );

  const addWallet = useCallback(
    (input: AddWalletInput): IntakeValidationResult => {
      const draft = buildDraft(input);
      const existing = sources.map(toIntake);
      const validation = validateManualIntakeSource(draft, existing);
      if (validation.status !== 'valid') return validation;

      const created = createManualIntakeSource(draft, existing);
      const connected: ConnectedCryptoSource = {
        id: created.id,
        sourceKind: 'wallet',
        intakeKind: 'watch-wallet',
        label: created.label,
        chain: created.chain,
        address: created.address,
        fingerprint: created.fingerprint,
        health: 'manual',
        lastSyncAt: nowFn(),
        hasReadOnlyKey: false,
      };
      setSources((prev) => [...prev, connected]);
      return validation;
    },
    [sources, nowFn],
  );

  const removeSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((source) => source.id !== id));
    setHoldings((prev) => prev.filter((holding) => holding.sourceId !== id));
  }, []);

  const addHolding = useCallback(
    (input: AddHoldingInput) => {
      const entry: CryptoHoldingEntry = {
        id: genId(),
        sourceId: input.sourceId,
        asset: input.asset.trim().toUpperCase(),
        quantity: input.quantity,
        unitPriceCents: Math.round(input.unitPriceCents),
        costBasisCents:
          input.costBasisCents === undefined ? undefined : Math.round(input.costBasisCents),
        asOf: nowFn(),
      };
      setHoldings((prev) => [...prev, entry]);
    },
    [nowFn],
  );

  const removeHolding = useCallback((id: string) => {
    setHoldings((prev) => prev.filter((holding) => holding.id !== id));
  }, []);

  const addDeFiPosition = useCallback((position: DeFiPosition) => {
    setDefiPositions((prev) => upsertManualDeFiPosition(prev, position));
  }, []);

  const removeDeFiPosition = useCallback((id: string) => {
    setDefiPositions((prev) => prev.filter((position) => position.id !== id));
  }, []);

  const reconcileTransfer = useCallback(
    (input: ReconcileTransferInput): readonly ProvenanceResolution[] => {
      const from = sources.find((source) => source.id === input.fromSourceId);
      const to = sources.find((source) => source.id === input.toSourceId);
      if (!from || !to) return [];
      const timestamp = input.timestamp ?? nowFn();
      const asset = input.asset.trim().toUpperCase();
      const movements: CryptoMovement[] = [
        {
          id: `${from.id}-out`,
          walletOwnerId: 'self',
          chain: from.chain ?? 'unknown',
          asset,
          quantity: input.quantity,
          direction: 'out',
          timestamp,
        },
        {
          id: `${to.id}-in`,
          walletOwnerId: 'self',
          chain: to.chain ?? 'unknown',
          asset,
          quantity: input.quantity,
          direction: 'in',
          timestamp,
        },
      ];
      const assetMap: AssetIdentity[] = [from, to]
        .filter((source): source is ConnectedCryptoSource => Boolean(source.chain))
        .map((source) => ({
          canonicalAsset: asset,
          chain: source.chain as string,
          symbol: asset,
        }));
      return resolveCryptoProvenance(movements, assetMap);
    },
    [sources, nowFn],
  );

  const refresh = useCallback(() => {
    const captured = nowFn();
    setNowIso(captured);
    setSources((prev) => prev.map((source) => ({ ...source, lastSyncAt: captured })));
    setHoldings((prev) => prev.map((holding) => ({ ...holding, asOf: captured })));
    setError(null);
  }, [nowFn]);

  const lastSyncAt = useMemo(() => {
    if (sources.length === 0) return null;
    return sources.reduce(
      (latest, source) => (source.lastSyncAt > latest ? source.lastSyncAt : latest),
      sources[0].lastSyncAt,
    );
  }, [sources]);

  return {
    sources,
    holdings,
    accounts,
    dashboard,
    defiPositions,
    defiTotals,
    overallHealth,
    lastSyncAt,
    loading,
    error,
    previewSource,
    addExchange,
    addWallet,
    removeSource,
    addHolding,
    removeHolding,
    addDeFiPosition,
    removeDeFiPosition,
    reconcileTransfer,
    refresh,
  };
}
