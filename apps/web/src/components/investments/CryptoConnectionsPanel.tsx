// SPDX-License-Identifier: BUSL-1.1

/**
 * CryptoConnectionsPanel — surfaces the `lib/crypto` engine in the UI.
 *
 * Lets the user connect watch-only crypto wallets (MetaMask / Ledger style
 * public addresses) and custodial exchanges (Coinbase / Kraken via read-only
 * or manual intake — never live OAuth secrets) alongside their bank accounts.
 *
 * Responsibilities (all logic delegated to `useCryptoConnections` + the engine):
 *  - Connect flow with live, engine-backed validation + duplicate detection.
 *  - Connection health, last-sync time, stale-data warnings, manual refresh.
 *  - Merged spot balances deduplicated across sources (no double-counting),
 *    with a per-asset source breakdown.
 *  - DeFi positions surfaced separately from spot holdings.
 *  - Self-transfer / bridge / wrap reconciliation between connected wallets.
 *
 * Accessibility: status uses `aria-live`, every control is labelled and
 * keyboard reachable, and status is never conveyed by colour alone (icon +
 * text in every badge). Money is rendered from integer minor units (cents).
 *
 * References: #2164, #2168, #2172
 */

import React, { useCallback, useId, useMemo, useState } from 'react';

import { AppIcon, type IconName } from '../icons';
import { dollarsToCents as toCents, formatCurrency } from '../../lib/currency';
import {
  useCryptoConnections,
  type ConnectedCryptoSource,
  type CryptoSourceKind,
  type ManualExchange,
} from '../../hooks/useCryptoConnections';
import type { CryptoConnectionHealth } from '../../lib/crypto/connector-abstraction';
import type { DeFiPosition, DeFiPositionType, LockStatus } from '../../lib/crypto/defi-positions';
import type { ProvenanceResolution } from '../../lib/crypto/provenance-resolver';

import './crypto-connections.css';

// ---------------------------------------------------------------------------
// Static option metadata
// ---------------------------------------------------------------------------

const EXCHANGE_OPTIONS: readonly { value: ManualExchange; label: string }[] = [
  { value: 'coinbase', label: 'Coinbase' },
  { value: 'kraken', label: 'Kraken' },
  { value: 'other', label: 'Other exchange' },
];

const CHAIN_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'bitcoin', label: 'Bitcoin' },
  { value: 'solana', label: 'Solana' },
  { value: 'polygon', label: 'Polygon' },
];

const DEFI_TYPE_OPTIONS: readonly { value: DeFiPositionType; label: string }[] = [
  { value: 'staking', label: 'Staking' },
  { value: 'liquidity-pool', label: 'Liquidity pool' },
  { value: 'lending', label: 'Lending' },
  { value: 'borrow', label: 'Borrow' },
  { value: 'vault', label: 'Vault' },
  { value: 'farm', label: 'Farm' },
];

const LOCK_OPTIONS: readonly { value: LockStatus; label: string }[] = [
  { value: 'liquid', label: 'Liquid' },
  { value: 'locked', label: 'Locked' },
  { value: 'unbonding', label: 'Unbonding' },
  { value: 'withdrawal-pending', label: 'Withdrawal pending' },
];

const HEALTH_META: Record<
  CryptoConnectionHealth,
  { label: string; icon: IconName; className: string }
> = {
  healthy: { label: 'Healthy', icon: 'check-circle', className: 'crypto-badge--healthy' },
  manual: { label: 'Watch-only', icon: 'eye', className: 'crypto-badge--manual' },
  stale: { label: 'Stale', icon: 'refresh', className: 'crypto-badge--stale' },
  'needs-attention': {
    label: 'Needs attention',
    icon: 'alert-triangle',
    className: 'crypto-badge--needs-attention',
  },
  failed: { label: 'Failed', icon: 'alert-circle', className: 'crypto-badge--failed' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return 'Unknown';
  }
}

function dollarsToCents(value: string): number {
  return toCents(Number.parseFloat(value));
}

const money = (cents: number): string => formatCurrency(cents, { currency: 'USD' });

const quantityLabel = (quantity: number): string =>
  quantity.toLocaleString(undefined, { maximumFractionDigits: 8 });

// ---------------------------------------------------------------------------
// Health badge
// ---------------------------------------------------------------------------

const HealthBadge: React.FC<{ health: CryptoConnectionHealth }> = ({ health }) => {
  const meta = HEALTH_META[health];
  return (
    <span className={`crypto-badge ${meta.className}`} role="status">
      <AppIcon name={meta.icon} />
      {meta.label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CryptoConnectionsPanelProps {
  /** Storage namespace override (test isolation). */
  storageNamespace?: string;
  /** Staleness window override (ms). */
  staleAfterMs?: number;
}

/** Crypto wallet & exchange connectivity panel. */
export const CryptoConnectionsPanel: React.FC<CryptoConnectionsPanelProps> = ({
  storageNamespace,
  staleAfterMs,
}) => {
  const baseId = useId();
  const {
    sources,
    holdings,
    dashboard,
    defiPositions,
    defiTotals,
    overallHealth,
    lastSyncAt,
    addExchange,
    addWallet,
    removeSource,
    addHolding,
    removeHolding,
    addDeFiPosition,
    removeDeFiPosition,
    reconcileTransfer,
    refresh,
  } = useCryptoConnections({ storageNamespace, staleAfterMs });

  // -- Connect form --------------------------------------------------------
  const [connectKind, setConnectKind] = useState<CryptoSourceKind>('exchange');
  const [exchangeId, setExchangeId] = useState<ManualExchange>('coinbase');
  const [exchangeLabel, setExchangeLabel] = useState('');
  const [readOnlyKey, setReadOnlyKey] = useState('');
  const [walletChain, setWalletChain] = useState('ethereum');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletLabel, setWalletLabel] = useState('');
  const [connectFeedback, setConnectFeedback] = useState<{ status: string; reason: string } | null>(
    null,
  );

  const handleConnect = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (connectKind === 'exchange') {
        const result = addExchange({
          exchange: exchangeId,
          label: exchangeLabel.trim() || `${exchangeId} (watch-only)`,
          readOnlyApiKey: readOnlyKey,
        });
        setConnectFeedback({ status: result.status, reason: result.reason });
        if (result.status === 'valid') {
          setExchangeLabel('');
          setReadOnlyKey('');
        }
      } else {
        const result = addWallet({
          chain: walletChain,
          address: walletAddress,
          label: walletLabel.trim() || `${walletChain} wallet`,
        });
        setConnectFeedback({ status: result.status, reason: result.reason });
        if (result.status === 'valid') {
          setWalletAddress('');
          setWalletLabel('');
        }
      }
    },
    [
      connectKind,
      addExchange,
      exchangeId,
      exchangeLabel,
      readOnlyKey,
      addWallet,
      walletChain,
      walletAddress,
      walletLabel,
    ],
  );

  // -- Holding form --------------------------------------------------------
  const [holdingSourceId, setHoldingSourceId] = useState('');
  const [holdingAsset, setHoldingAsset] = useState('');
  const [holdingQty, setHoldingQty] = useState('');
  const [holdingPrice, setHoldingPrice] = useState('');

  const effectiveHoldingSource = holdingSourceId || sources[0]?.id || '';

  const handleAddHolding = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const sourceId = effectiveHoldingSource;
      const quantity = Number.parseFloat(holdingQty);
      if (!sourceId || !holdingAsset.trim() || !Number.isFinite(quantity) || quantity <= 0) return;
      addHolding({
        sourceId,
        asset: holdingAsset,
        quantity,
        unitPriceCents: dollarsToCents(holdingPrice),
      });
      setHoldingAsset('');
      setHoldingQty('');
      setHoldingPrice('');
    },
    [effectiveHoldingSource, holdingQty, holdingAsset, holdingPrice, addHolding],
  );

  // -- DeFi form -----------------------------------------------------------
  const [defiProtocol, setDefiProtocol] = useState('');
  const [defiType, setDefiType] = useState<DeFiPositionType>('staking');
  const [defiLock, setDefiLock] = useState<LockStatus>('locked');
  const [defiValue, setDefiValue] = useState('');
  const [defiChain, setDefiChain] = useState('ethereum');

  const handleAddDeFi = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (!defiProtocol.trim()) return;
      const typeLabel = DEFI_TYPE_OPTIONS.find((option) => option.value === defiType)?.label ?? '';
      const position: DeFiPosition = {
        id:
          globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
            ? globalThis.crypto.randomUUID()
            : `defi-${Date.now().toString(36)}`,
        type: defiType,
        chain: defiChain,
        protocol: defiProtocol.trim(),
        label: `${defiProtocol.trim()} ${typeLabel}`.trim(),
        principalValueCents: dollarsToCents(defiValue),
        currency: 'USD',
        lockStatus: defiLock,
        rewardTokens: [],
        valuationAsOf: new Date().toISOString(),
      };
      addDeFiPosition(position);
      setDefiProtocol('');
      setDefiValue('');
    },
    [defiProtocol, defiType, defiChain, defiValue, defiLock, addDeFiPosition],
  );

  // -- Reconciliation ------------------------------------------------------
  const walletSources = useMemo(
    () =>
      sources.filter((source): source is ConnectedCryptoSource => source.sourceKind === 'wallet'),
    [sources],
  );
  const [rcAsset, setRcAsset] = useState('ETH');
  const [rcQty, setRcQty] = useState('');
  const [rcFrom, setRcFrom] = useState('');
  const [rcTo, setRcTo] = useState('');
  const [rcResult, setRcResult] = useState<readonly ProvenanceResolution[] | null>(null);

  const handleReconcile = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const from = rcFrom || walletSources[0]?.id || '';
      const to = rcTo || walletSources[1]?.id || '';
      const quantity = Number.parseFloat(rcQty);
      if (!from || !to || from === to || !Number.isFinite(quantity) || quantity <= 0) {
        setRcResult([]);
        return;
      }
      setRcResult(
        reconcileTransfer({ asset: rcAsset, quantity, fromSourceId: from, toSourceId: to }),
      );
    },
    [rcFrom, rcTo, rcQty, rcAsset, walletSources, reconcileTransfer],
  );

  // -----------------------------------------------------------------------
  const headingId = `${baseId}-heading`;

  return (
    <section className="crypto-panel" aria-labelledby={headingId}>
      <div className="crypto-panel__card">
        <header className="crypto-panel__header">
          <div>
            <h3 id={headingId} className="crypto-panel__title">
              <AppIcon name="wallet" /> Crypto Wallets &amp; Exchanges
            </h3>
            <p className="crypto-panel__subtitle">
              Connect watch-only wallets and custodial exchanges alongside your bank accounts.
              Balances merge without double-counting.
            </p>
          </div>
          <div className="crypto-panel__status" role="status" aria-live="polite">
            {sources.length > 0 ? (
              <>
                <HealthBadge health={overallHealth} />
                <span className="crypto-source__detail">
                  Last sync: {formatTimestamp(lastSyncAt)}
                </span>
              </>
            ) : (
              <span className="crypto-empty">No crypto sources connected yet.</span>
            )}
            <button type="button" className="crypto-btn" onClick={refresh}>
              <AppIcon name="refresh" /> Refresh
            </button>
          </div>
        </header>

        {overallHealth === 'stale' && sources.length > 0 && (
          <p className="crypto-warning" role="alert">
            <AppIcon name="alert-triangle" /> Some connections are stale. Refresh to re-capture
            balances and prices.
          </p>
        )}

        {/* Connect flow ---------------------------------------------------- */}
        <section className="crypto-section" aria-label="Connect a crypto source">
          <h4 className="crypto-section__title">Connect a source</h4>

          <div
            className="crypto-segmented"
            role="group"
            aria-label="Source type"
            style={{ marginBottom: 'var(--spacing-3, 12px)' }}
          >
            <button
              type="button"
              className="crypto-segmented__option"
              aria-pressed={connectKind === 'exchange'}
              onClick={() => setConnectKind('exchange')}
            >
              <AppIcon name="bank" /> Exchange
            </button>
            <button
              type="button"
              className="crypto-segmented__option"
              aria-pressed={connectKind === 'wallet'}
              onClick={() => setConnectKind('wallet')}
            >
              <AppIcon name="wallet" /> Wallet address
            </button>
          </div>

          <form className="crypto-form" onSubmit={handleConnect} noValidate>
            {connectKind === 'exchange' ? (
              <div className="crypto-form__row">
                <div className="crypto-field">
                  <label className="crypto-field__label" htmlFor={`${baseId}-exchange`}>
                    Exchange
                  </label>
                  <select
                    id={`${baseId}-exchange`}
                    className="crypto-field__select"
                    value={exchangeId}
                    onChange={(event) => setExchangeId(event.target.value as ManualExchange)}
                  >
                    {EXCHANGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="crypto-field">
                  <label className="crypto-field__label" htmlFor={`${baseId}-exchange-label`}>
                    Label
                  </label>
                  <input
                    id={`${baseId}-exchange-label`}
                    className="crypto-field__input"
                    type="text"
                    value={exchangeLabel}
                    placeholder="e.g. Coinbase main"
                    onChange={(event) => setExchangeLabel(event.target.value)}
                  />
                </div>
                <div className="crypto-field">
                  <label className="crypto-field__label" htmlFor={`${baseId}-exchange-key`}>
                    Read-only API key (optional)
                  </label>
                  <input
                    id={`${baseId}-exchange-key`}
                    className="crypto-field__input"
                    type="password"
                    autoComplete="off"
                    value={readOnlyKey}
                    onChange={(event) => setReadOnlyKey(event.target.value)}
                    aria-describedby={`${baseId}-key-hint`}
                  />
                  <span id={`${baseId}-key-hint`} className="crypto-field__hint">
                    Used only to mark the exchange as linked. The key value is never stored.
                  </span>
                </div>
              </div>
            ) : (
              <div className="crypto-form__row">
                <div className="crypto-field">
                  <label className="crypto-field__label" htmlFor={`${baseId}-chain`}>
                    Chain
                  </label>
                  <select
                    id={`${baseId}-chain`}
                    className="crypto-field__select"
                    value={walletChain}
                    onChange={(event) => setWalletChain(event.target.value)}
                  >
                    {CHAIN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="crypto-field">
                  <label className="crypto-field__label" htmlFor={`${baseId}-address`}>
                    Public address
                  </label>
                  <input
                    id={`${baseId}-address`}
                    className="crypto-field__input"
                    type="text"
                    value={walletAddress}
                    placeholder="0x… / bc1… / base58"
                    onChange={(event) => setWalletAddress(event.target.value)}
                  />
                </div>
                <div className="crypto-field">
                  <label className="crypto-field__label" htmlFor={`${baseId}-wallet-label`}>
                    Label
                  </label>
                  <input
                    id={`${baseId}-wallet-label`}
                    className="crypto-field__input"
                    type="text"
                    value={walletLabel}
                    placeholder="e.g. Ledger cold storage"
                    onChange={(event) => setWalletLabel(event.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <button type="submit" className="crypto-btn crypto-btn--primary">
                Connect {connectKind === 'exchange' ? 'exchange' : 'wallet'}
              </button>
            </div>

            <p
              className={`crypto-validation crypto-validation--${connectFeedback?.status ?? 'valid'}`}
              role="status"
              aria-live="polite"
            >
              {connectFeedback
                ? `${connectFeedback.status === 'valid' ? 'Connected' : 'Not added'}: ${connectFeedback.reason}`
                : ''}
            </p>
          </form>
        </section>

        {/* Connected sources ---------------------------------------------- */}
        <section className="crypto-section" aria-label="Connected sources">
          <h4 className="crypto-section__title">Connected sources ({sources.length})</h4>
          {sources.length === 0 ? (
            <p className="crypto-empty">Nothing connected yet. Add a wallet or exchange above.</p>
          ) : (
            <ul className="crypto-list">
              {sources.map((source) => (
                <li key={source.id} className="crypto-source">
                  <div className="crypto-source__meta">
                    <span className="crypto-source__label">
                      <AppIcon name={source.sourceKind === 'wallet' ? 'wallet' : 'bank'} />{' '}
                      {source.label}
                    </span>
                    <span className="crypto-source__detail">
                      {source.sourceKind === 'wallet'
                        ? `${source.chain} • ${source.address}`
                        : `${source.exchange} • ${source.hasReadOnlyKey ? 'read-only key linked' : 'manual intake'}`}
                    </span>
                    <span className="crypto-source__detail">
                      Last sync: {formatTimestamp(source.lastSyncAt)}
                    </span>
                  </div>
                  <div className="crypto-panel__status">
                    <HealthBadge health={source.health} />
                    <button
                      type="button"
                      className="crypto-btn crypto-btn--ghost"
                      onClick={() => removeSource(source.id)}
                      aria-label={`Disconnect ${source.label}`}
                    >
                      <AppIcon name="trash" /> Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Merged spot balances ------------------------------------------- */}
        <section className="crypto-section" aria-label="Merged spot balances">
          <h4 className="crypto-section__title">Spot balances (merged across sources)</h4>

          <form className="crypto-form__row" onSubmit={handleAddHolding} aria-label="Add a holding">
            <div className="crypto-field">
              <label className="crypto-field__label" htmlFor={`${baseId}-holding-source`}>
                Source
              </label>
              <select
                id={`${baseId}-holding-source`}
                className="crypto-field__select"
                value={effectiveHoldingSource}
                onChange={(event) => setHoldingSourceId(event.target.value)}
                disabled={sources.length === 0}
              >
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="crypto-field">
              <label className="crypto-field__label" htmlFor={`${baseId}-holding-asset`}>
                Asset
              </label>
              <input
                id={`${baseId}-holding-asset`}
                className="crypto-field__input"
                type="text"
                value={holdingAsset}
                placeholder="ETH"
                onChange={(event) => setHoldingAsset(event.target.value)}
                disabled={sources.length === 0}
              />
            </div>
            <div className="crypto-field">
              <label className="crypto-field__label" htmlFor={`${baseId}-holding-qty`}>
                Quantity
              </label>
              <input
                id={`${baseId}-holding-qty`}
                className="crypto-field__input"
                type="number"
                step="any"
                min="0"
                value={holdingQty}
                onChange={(event) => setHoldingQty(event.target.value)}
                disabled={sources.length === 0}
              />
            </div>
            <div className="crypto-field">
              <label className="crypto-field__label" htmlFor={`${baseId}-holding-price`}>
                Unit price ($)
              </label>
              <input
                id={`${baseId}-holding-price`}
                className="crypto-field__input"
                type="number"
                step="any"
                min="0"
                value={holdingPrice}
                onChange={(event) => setHoldingPrice(event.target.value)}
                disabled={sources.length === 0}
              />
            </div>
            <div className="crypto-field" style={{ flex: '0 0 auto', minWidth: 'auto' }}>
              <button
                type="submit"
                className="crypto-btn crypto-btn--primary"
                disabled={sources.length === 0}
              >
                Add holding
              </button>
            </div>
          </form>

          {dashboard.rows.length === 0 ? (
            <p className="crypto-empty">No balances yet.</p>
          ) : (
            <>
              <p className="crypto-totals" aria-live="polite">
                <span className="crypto-total">
                  <span className="crypto-total__label">Total spot value</span>
                  <span className="crypto-total__value">{money(dashboard.totalValueCents)}</span>
                </span>
              </p>
              <table className="crypto-table" aria-label="Merged spot balances by asset">
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    <th scope="col" data-numeric="true">
                      Quantity
                    </th>
                    <th scope="col" data-numeric="true">
                      Value
                    </th>
                    <th scope="col">Sources</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.rows.map((row) => (
                    <tr key={row.asset}>
                      <th scope="row">{row.asset}</th>
                      <td data-numeric="true">{quantityLabel(row.quantity)}</td>
                      <td data-numeric="true">{money(row.valueCents)}</td>
                      <td>
                        <span className="crypto-chips">
                          {Object.entries(row.sourceBreakdown).map(([sourceId, qty]) => {
                            const source = sources.find((item) => item.id === sourceId);
                            return (
                              <span key={sourceId} className="crypto-chip">
                                {source?.label ?? sourceId}: {quantityLabel(qty)}
                              </span>
                            );
                          })}
                        </span>
                      </td>
                      <td>
                        {row.warnings.length > 0 ? (
                          <span className="crypto-warning">
                            <AppIcon name="alert-triangle" /> {row.warnings.join(', ')}
                          </span>
                        ) : (
                          <span className="crypto-badge crypto-badge--healthy">
                            <AppIcon name="check" /> OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="crypto-note">
                Each source contributes once. The merge groups identical assets and shows the
                per-source breakdown so nothing is double-counted.
              </p>
            </>
          )}

          {dashboard.warnings.length > 0 && (
            <ul className="crypto-list" aria-label="Data source warnings">
              {dashboard.warnings.map((warning) => (
                <li key={warning} className="crypto-warning">
                  <AppIcon name="alert-triangle" /> {warning}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Holdings detail (for removal) ---------------------------------- */}

        {/* DeFi positions (separate from spot) ---------------------------- */}
        <section className="crypto-section" aria-label="DeFi positions">
          <h4 className="crypto-section__title">DeFi positions (tracked separately from spot)</h4>

          <div className="crypto-totals" aria-live="polite">
            <span className="crypto-total">
              <span className="crypto-total__label">Total</span>
              <span className="crypto-total__value">{money(defiTotals.totalValueCents)}</span>
            </span>
            <span className="crypto-total">
              <span className="crypto-total__label">Available</span>
              <span className="crypto-total__value">{money(defiTotals.availableValueCents)}</span>
            </span>
            <span className="crypto-total">
              <span className="crypto-total__label">Locked / unbonding</span>
              <span className="crypto-total__value">{money(defiTotals.lockedValueCents)}</span>
            </span>
            <span className="crypto-total">
              <span className="crypto-total__label">Rewards</span>
              <span className="crypto-total__value">{money(defiTotals.rewardsValueCents)}</span>
            </span>
          </div>

          <form
            className="crypto-form__row"
            onSubmit={handleAddDeFi}
            aria-label="Add a DeFi position"
            style={{ marginTop: 'var(--spacing-3, 12px)' }}
          >
            <div className="crypto-field">
              <label className="crypto-field__label" htmlFor={`${baseId}-defi-protocol`}>
                Protocol
              </label>
              <input
                id={`${baseId}-defi-protocol`}
                className="crypto-field__input"
                type="text"
                value={defiProtocol}
                placeholder="Lido"
                onChange={(event) => setDefiProtocol(event.target.value)}
              />
            </div>
            <div className="crypto-field">
              <label className="crypto-field__label" htmlFor={`${baseId}-defi-chain`}>
                Chain
              </label>
              <select
                id={`${baseId}-defi-chain`}
                className="crypto-field__select"
                value={defiChain}
                onChange={(event) => setDefiChain(event.target.value)}
              >
                {CHAIN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="crypto-field">
              <label className="crypto-field__label" htmlFor={`${baseId}-defi-type`}>
                Type
              </label>
              <select
                id={`${baseId}-defi-type`}
                className="crypto-field__select"
                value={defiType}
                onChange={(event) => setDefiType(event.target.value as DeFiPositionType)}
              >
                {DEFI_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="crypto-field">
              <label className="crypto-field__label" htmlFor={`${baseId}-defi-lock`}>
                Lock status
              </label>
              <select
                id={`${baseId}-defi-lock`}
                className="crypto-field__select"
                value={defiLock}
                onChange={(event) => setDefiLock(event.target.value as LockStatus)}
              >
                {LOCK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="crypto-field">
              <label className="crypto-field__label" htmlFor={`${baseId}-defi-value`}>
                Principal value ($)
              </label>
              <input
                id={`${baseId}-defi-value`}
                className="crypto-field__input"
                type="number"
                step="any"
                min="0"
                value={defiValue}
                onChange={(event) => setDefiValue(event.target.value)}
              />
            </div>
            <div className="crypto-field" style={{ flex: '0 0 auto', minWidth: 'auto' }}>
              <button type="submit" className="crypto-btn crypto-btn--primary">
                Add position
              </button>
            </div>
          </form>

          {defiPositions.length === 0 ? (
            <p className="crypto-empty">No DeFi positions yet.</p>
          ) : (
            <ul className="crypto-list">
              {defiPositions.map((position) => (
                <li key={position.id} className="crypto-source">
                  <div className="crypto-source__meta">
                    <span className="crypto-source__label">{position.label}</span>
                    <span className="crypto-source__detail">
                      {position.protocol} • {position.chain} • {position.lockStatus} •{' '}
                      {money(position.principalValueCents)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="crypto-btn crypto-btn--ghost"
                    onClick={() => removeDeFiPosition(position.id)}
                    aria-label={`Remove ${position.label}`}
                  >
                    <AppIcon name="trash" /> Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Transfer reconciliation ---------------------------------------- */}
        {walletSources.length >= 2 && (
          <section className="crypto-section" aria-label="Transfer reconciliation">
            <h4 className="crypto-section__title">Reconcile a wallet transfer</h4>
            <p className="crypto-note" style={{ marginTop: 0 }}>
              Check whether a movement between your wallets is a non-taxable self-transfer, wrap, or
              bridge, so it is not counted twice or taxed as a swap.
            </p>
            <form className="crypto-form__row" onSubmit={handleReconcile}>
              <div className="crypto-field">
                <label className="crypto-field__label" htmlFor={`${baseId}-rc-asset`}>
                  Asset
                </label>
                <input
                  id={`${baseId}-rc-asset`}
                  className="crypto-field__input"
                  type="text"
                  value={rcAsset}
                  onChange={(event) => setRcAsset(event.target.value)}
                />
              </div>
              <div className="crypto-field">
                <label className="crypto-field__label" htmlFor={`${baseId}-rc-qty`}>
                  Quantity
                </label>
                <input
                  id={`${baseId}-rc-qty`}
                  className="crypto-field__input"
                  type="number"
                  step="any"
                  min="0"
                  value={rcQty}
                  onChange={(event) => setRcQty(event.target.value)}
                />
              </div>
              <div className="crypto-field">
                <label className="crypto-field__label" htmlFor={`${baseId}-rc-from`}>
                  From wallet
                </label>
                <select
                  id={`${baseId}-rc-from`}
                  className="crypto-field__select"
                  value={rcFrom || walletSources[0]?.id}
                  onChange={(event) => setRcFrom(event.target.value)}
                >
                  {walletSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="crypto-field">
                <label className="crypto-field__label" htmlFor={`${baseId}-rc-to`}>
                  To wallet
                </label>
                <select
                  id={`${baseId}-rc-to`}
                  className="crypto-field__select"
                  value={rcTo || walletSources[1]?.id}
                  onChange={(event) => setRcTo(event.target.value)}
                >
                  {walletSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="crypto-field" style={{ flex: '0 0 auto', minWidth: 'auto' }}>
                <button type="submit" className="crypto-btn crypto-btn--primary">
                  Reconcile
                </button>
              </div>
            </form>

            <div role="status" aria-live="polite">
              {rcResult &&
                (rcResult.length === 0 ? (
                  <p className="crypto-warning">
                    <AppIcon name="alert-triangle" /> Choose two different wallets and a positive
                    quantity.
                  </p>
                ) : (
                  <ul className="crypto-list" aria-label="Reconciliation result">
                    {rcResult.map((resolution) => (
                      <li key={resolution.movementIds.join('-')} className="crypto-source__detail">
                        <strong>{resolution.classification}</strong>:{' '}
                        {resolution.taxable ? 'taxable' : 'not taxable'} (confidence{' '}
                        {Math.round(resolution.confidence * 100)}%). {resolution.explanation}
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </section>
        )}

        {/* Individual holdings management --------------------------------- */}
        {holdings.length > 0 && (
          <details className="crypto-section">
            <summary className="crypto-section__title">Manage individual holdings</summary>
            <ul className="crypto-list" aria-label="Individual holdings">
              {holdings.map((holding) => {
                const source = sources.find((item) => item.id === holding.sourceId);
                return (
                  <li key={holding.id} className="crypto-source">
                    <span className="crypto-source__detail">
                      {source?.label ?? 'Unknown source'}: {quantityLabel(holding.quantity)}{' '}
                      {holding.asset} @ {money(holding.unitPriceCents)}
                    </span>
                    <button
                      type="button"
                      className="crypto-btn crypto-btn--ghost"
                      onClick={() => removeHolding(holding.id)}
                      aria-label={`Remove ${quantityLabel(holding.quantity)} ${holding.asset} from ${source?.label ?? 'source'}`}
                    >
                      <AppIcon name="trash" /> Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
};

export default CryptoConnectionsPanel;
