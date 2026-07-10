// SPDX-License-Identifier: BUSL-1.1

/**
 * DeFiPositionsCard — surfaces DeFi / locked positions separately from spot
 * holdings on the Investments page (#2172).
 *
 * A yield farmer can record staked assets, liquidity-pool positions, lending
 * positions, and pending protocol rewards, then see:
 *   - a "liquid vs locked" split of the whole portfolio (spot holdings are
 *     liquid; assets locked in contracts are reported separately);
 *   - per-position protocol, chain, lock / unbonding state, APY, and reward
 *     exposure;
 *   - exposure rolled up by protocol and by chain;
 *   - pending reward value flagged for income / tax classification.
 *
 * Positions are entered manually and persisted to `localStorage` (the same
 * local-only pattern used by the Investing Beta toolkit). No network calls and
 * no fabricated market data — every value is supplied by the user. All money is
 * integer cents; pure calculations live in `lib/assets/defi-positions`.
 *
 * Accessibility (WCAG 2.2 AA):
 *   - Every control has an associated `<label>`; the add form is keyboard
 *     operable and submits with a real `<button>`.
 *   - Tables carry a `<caption>` and scoped headers; the liquidity split is a
 *     real table, and the decorative bar is `aria-hidden`.
 *   - Lock state and liquidity are conveyed with text + icon, never colour
 *     alone.
 *   - A polite live region announces totals and add / remove actions.
 */

import React, { useCallback, useId, useMemo, useState } from 'react';
import { CurrencyDisplay, EmptyState } from '../common';
import { AppIcon, type IconName } from '../icons';
import { dollarsToCents as toCents, formatCurrency } from '../../lib/currency';
import {
  combinePortfolioLiquidity,
  DEFI_KIND_LABELS,
  DEFI_LOCK_STATE_LABELS,
  summarizeDefiPortfolio,
} from '../../lib/assets/defi-positions';
import type {
  DefiLockState,
  DefiPositionEntry,
  DefiPositionKind,
} from '../../lib/assets/defi-positions-types';

export interface DeFiPositionsCardProps {
  /** Market value of freely spendable spot holdings, in integer cents. */
  readonly spotLiquidValueCents: number;
  /** Currency code for formatting (defaults to USD). */
  readonly currency?: string;
  /** localStorage key for persisting positions (override for test isolation). */
  readonly storageKey?: string;
  /** Seed positions used when nothing is persisted yet (tests / SSR). */
  readonly initialPositions?: readonly DefiPositionEntry[];
}

const STORAGE_PREFIX = 'finance.investments';
const DEFAULT_STORAGE_KEY = `${STORAGE_PREFIX}.defiPositions.v1`;

const KIND_OPTIONS: readonly DefiPositionKind[] = [
  'STAKING',
  'LIQUIDITY_POOL',
  'LENDING',
  'BORROW',
  'VAULT',
  'FARM',
];

const LOCK_OPTIONS: readonly DefiLockState[] = [
  'LIQUID',
  'LOCKED',
  'UNBONDING',
  'WITHDRAWAL_PENDING',
];

/** Icon for a lock state — paired with a text label, never used alone. */
function lockIcon(state: DefiLockState): IconName {
  return state === 'LIQUID' ? 'unlock' : 'lock';
}

/** Parse a dollar string into integer cents, guarding against bad input. */
function dollarsToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return toCents(parsed);
}

/** Read persisted positions, falling back to a default on any failure. */
function readStored(key: string, fallback: readonly DefiPositionEntry[]): DefiPositionEntry[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as DefiPositionEntry[]) : [...fallback];
  } catch {
    return [...fallback];
  }
}

/** Generate a reasonably unique id without external dependencies. */
function makeId(): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `defi-${cryptoObj.randomUUID()}`;
  }
  return `defi-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

interface FormState {
  protocol: string;
  chain: string;
  kind: DefiPositionKind;
  label: string;
  lockState: DefiLockState;
  principalDollars: string;
  apyPercent: string;
  rewardToken: string;
  rewardDollars: string;
  unlockDate: string;
}

const EMPTY_FORM: FormState = {
  protocol: '',
  chain: '',
  kind: 'STAKING',
  label: '',
  lockState: 'LOCKED',
  principalDollars: '',
  apyPercent: '',
  rewardToken: '',
  rewardDollars: '',
  unlockDate: '',
};

const cardStyle: React.CSSProperties = { marginBottom: 'var(--spacing-6)' };

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--spacing-2) var(--spacing-3)',
  border: '1px solid var(--semantic-border-default, #e5e7eb)',
  borderRadius: 'var(--radius-md, 0.375rem)',
  background: 'var(--semantic-background-primary, #fff)',
  color: 'var(--semantic-text-primary, #111)',
  font: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 'var(--font-weight-medium)',
  marginBottom: 'var(--spacing-1)',
};

const cellStyle: React.CSSProperties = {
  padding: 'var(--spacing-3)',
  borderBottom: '1px solid var(--semantic-border-default, #e5e7eb)',
  textAlign: 'left',
};

const numericCellStyle: React.CSSProperties = { ...cellStyle, textAlign: 'right' };

const headerCellStyle: React.CSSProperties = {
  padding: 'var(--spacing-3)',
  borderBottom: '2px solid var(--semantic-border-default, #e5e7eb)',
  textAlign: 'left',
};

const numericHeaderStyle: React.CSSProperties = { ...headerCellStyle, textAlign: 'right' };

export const DeFiPositionsCard: React.FC<DeFiPositionsCardProps> = ({
  spotLiquidValueCents,
  currency = 'USD',
  storageKey = DEFAULT_STORAGE_KEY,
  initialPositions = [],
}) => {
  const fieldId = useId();
  const [positions, setPositions] = useState<DefiPositionEntry[]>(() =>
    readStored(storageKey, initialPositions),
  );
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [status, setStatus] = useState('');

  const persist = useCallback(
    (next: DefiPositionEntry[]) => {
      setPositions(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // In-memory state still works when storage is unavailable.
      }
    },
    [storageKey],
  );

  const summary = useMemo(() => summarizeDefiPortfolio(positions), [positions]);
  const split = useMemo(
    () => combinePortfolioLiquidity(spotLiquidValueCents, summary.breakdown),
    [spotLiquidValueCents, summary.breakdown],
  );

  const money = useCallback((cents: number) => formatCurrency(cents, { currency }), [currency]);

  const handleField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const protocol = form.protocol.trim();
      const chain = form.chain.trim() || 'ethereum';
      if (!protocol) {
        setStatus('Enter a protocol name to add a position.');
        return;
      }

      const rewardToken = form.rewardToken.trim();
      const rewardValueCents = dollarsToCents(form.rewardDollars);
      const apyParsed = Number.parseFloat(form.apyPercent);

      const entry: DefiPositionEntry = {
        id: makeId(),
        protocol,
        chain,
        kind: form.kind,
        label: form.label.trim() || `${protocol} ${DEFI_KIND_LABELS[form.kind]}`,
        principalValueCents: dollarsToCents(form.principalDollars),
        lockState: form.lockState,
        apyPercent: Number.isFinite(apyParsed) ? apyParsed : undefined,
        unlockDate: form.unlockDate || undefined,
        rewards: rewardToken
          ? [{ token: rewardToken, quantity: 0, valueCents: rewardValueCents }]
          : [],
        valuationAsOf: new Date().toISOString().slice(0, 10),
      };

      persist([...positions, entry]);
      setForm(EMPTY_FORM);
      setStatus(`Added ${entry.label} on ${entry.protocol}.`);
    },
    [form, persist, positions],
  );

  const handleRemove = useCallback(
    (entry: DefiPositionEntry) => {
      persist(positions.filter((p) => p.id !== entry.id));
      setStatus(`Removed ${entry.label} on ${entry.protocol}.`);
    },
    [persist, positions],
  );

  const liquiditySummaryText = `Portfolio is ${split.liquidPercent}% liquid (${money(
    split.liquidValueCents,
  )}) and ${split.lockedPercent}% locked in contracts (${money(split.lockedValueCents)}). ${money(
    split.pendingRewardValueCents,
  )} of protocol rewards are pending.`;

  return (
    <section className="page-section" aria-labelledby={`${fieldId}-heading`}>
      <div className="card" style={cardStyle}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)',
            marginBottom: 'var(--spacing-2)',
          }}
        >
          <h3
            id={`${fieldId}-heading`}
            style={{ fontWeight: 'var(--font-weight-semibold)', margin: 0 }}
          >
            <AppIcon name="lock" /> DeFi &amp; Locked Positions
          </h3>
        </div>
        <p style={{ color: 'var(--semantic-text-secondary)', marginTop: 0 }}>
          Track staked assets, liquidity-pool, lending, and vault positions apart from spot
          holdings. Spot holdings are treated as liquid; assets locked in smart contracts are
          reported separately so portfolio totals show a true liquid-vs-locked picture. Pending
          rewards are surfaced for income and tax classification.
        </p>

        {/* Live region announces totals and actions for screen readers. */}
        <p className="sr-only" role="status" aria-live="polite">
          {status || liquiditySummaryText}
        </p>

        {/* Liquid vs locked split of the whole portfolio */}
        <table
          style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 'var(--spacing-4)' }}
        >
          <caption className="sr-only">
            Liquid versus locked breakdown of portfolio totals, blending spot holdings with DeFi
            positions
          </caption>
          <thead>
            <tr>
              <th scope="col" style={headerCellStyle}>
                Bucket
              </th>
              <th scope="col" style={numericHeaderStyle}>
                Value
              </th>
              <th scope="col" style={numericHeaderStyle}>
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" style={cellStyle}>
                <AppIcon name="wallet" /> Liquid (spot + liquid DeFi)
              </th>
              <td style={numericCellStyle}>
                <CurrencyDisplay amount={split.liquidValueCents} currency={currency} />
              </td>
              <td style={numericCellStyle}>{split.liquidPercent}%</td>
            </tr>
            <tr>
              <th scope="row" style={cellStyle}>
                <AppIcon name="lock" /> Locked in contracts
              </th>
              <td style={numericCellStyle}>
                <CurrencyDisplay amount={split.lockedValueCents} currency={currency} />
              </td>
              <td style={numericCellStyle}>{split.lockedPercent}%</td>
            </tr>
            <tr>
              <th scope="row" style={cellStyle}>
                <AppIcon name="gift" /> Pending rewards
              </th>
              <td style={numericCellStyle}>
                <CurrencyDisplay amount={split.pendingRewardValueCents} currency={currency} />
              </td>
              <td style={numericCellStyle}>—</td>
            </tr>
          </tbody>
        </table>

        {/* Decorative proportion bar — meaning carried by the table above. */}
        {split.totalValueCents > 0 && (
          <div
            aria-hidden="true"
            style={{
              display: 'flex',
              height: 'var(--spacing-2, 8px)',
              borderRadius: 'var(--radius-sm, 0.25rem)',
              overflow: 'hidden',
              marginBottom: 'var(--spacing-4)',
              border: '1px solid var(--semantic-border-default, #e5e7eb)',
            }}
          >
            <span
              style={{
                width: `${split.liquidPercent}%`,
                background: 'var(--semantic-positive, #059669)',
              }}
            />
            <span
              style={{
                width: `${split.lockedPercent}%`,
                background: 'var(--semantic-warning, #d97706)',
              }}
            />
          </div>
        )}

        {/* Positions table or empty state */}
        {positions.length === 0 ? (
          <EmptyState
            title="No DeFi positions yet"
            description="Add a staked, lending, liquidity-pool, or vault position below to separate locked assets from your spot holdings."
          />
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: 'var(--spacing-4)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <caption className="sr-only">
                DeFi positions with protocol, chain, type, lock state, APY, principal, and pending
                reward value
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={headerCellStyle}>
                    Position
                  </th>
                  <th scope="col" style={headerCellStyle}>
                    Chain
                  </th>
                  <th scope="col" style={headerCellStyle}>
                    Type
                  </th>
                  <th scope="col" style={headerCellStyle}>
                    Lock state
                  </th>
                  <th scope="col" style={numericHeaderStyle}>
                    APY
                  </th>
                  <th scope="col" style={numericHeaderStyle}>
                    Principal
                  </th>
                  <th scope="col" style={numericHeaderStyle}>
                    Pending rewards
                  </th>
                  <th scope="col" style={headerCellStyle}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.positions.map((view) => (
                  <tr key={view.id}>
                    <th scope="row" style={cellStyle}>
                      <strong>{view.label}</strong>
                      <br />
                      <span
                        style={{
                          fontSize: 'var(--type-scale-caption-font-size)',
                          color: 'var(--semantic-text-secondary)',
                        }}
                      >
                        {view.protocol}
                      </span>
                    </th>
                    <td style={cellStyle}>{view.chain}</td>
                    <td style={cellStyle}>{view.kindLabel}</td>
                    <td style={cellStyle}>
                      <AppIcon name={lockIcon(view.lockState)} /> {view.lockStateLabel}
                      {view.unlockDate ? (
                        <>
                          <br />
                          <span
                            style={{
                              fontSize: 'var(--type-scale-caption-font-size)',
                              color: 'var(--semantic-text-secondary)',
                            }}
                          >
                            Unlocks {view.unlockDate}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td style={numericCellStyle}>
                      {view.apyPercent === undefined ? '—' : `${view.apyPercent}%`}
                    </td>
                    <td style={numericCellStyle}>
                      <CurrencyDisplay amount={view.principalValueCents} currency={currency} />
                    </td>
                    <td style={numericCellStyle}>
                      <CurrencyDisplay amount={view.rewardValueCents} currency={currency} />
                      {view.rewards.length > 0 ? (
                        <>
                          <br />
                          <span
                            style={{
                              fontSize: 'var(--type-scale-caption-font-size)',
                              color: 'var(--semantic-text-secondary)',
                            }}
                          >
                            {view.rewards.map((r) => r.token).join(', ')}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td style={cellStyle}>
                      <button
                        type="button"
                        onClick={() => handleRemove(view)}
                        aria-label={`Remove ${view.label} on ${view.protocol}`}
                        style={{
                          background: 'none',
                          border: '1px solid var(--semantic-border-default, #e5e7eb)',
                          borderRadius: 'var(--radius-md, 0.375rem)',
                          cursor: 'pointer',
                          font: 'inherit',
                          color: 'inherit',
                          padding: 'var(--spacing-1) var(--spacing-2)',
                        }}
                      >
                        <AppIcon name="trash" /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Exposure by protocol and chain */}
        {summary.positionCount > 0 && (
          <div
            style={{
              display: 'grid',
              gap: 'var(--spacing-4)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              marginBottom: 'var(--spacing-4)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <caption
                style={{
                  textAlign: 'left',
                  fontWeight: 'var(--font-weight-semibold)',
                  marginBottom: 'var(--spacing-2)',
                }}
              >
                Exposure by protocol
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={headerCellStyle}>
                    Protocol
                  </th>
                  <th scope="col" style={numericHeaderStyle}>
                    Total
                  </th>
                  <th scope="col" style={numericHeaderStyle}>
                    Locked
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.byProtocol.map((row) => (
                  <tr key={row.protocol}>
                    <th scope="row" style={cellStyle}>
                      {row.protocol}
                      <br />
                      <span
                        style={{
                          fontSize: 'var(--type-scale-caption-font-size)',
                          color: 'var(--semantic-text-secondary)',
                        }}
                      >
                        {row.chains.join(', ')}
                      </span>
                    </th>
                    <td style={numericCellStyle}>
                      <CurrencyDisplay amount={row.totalValueCents} currency={currency} />
                    </td>
                    <td style={numericCellStyle}>
                      <CurrencyDisplay amount={row.lockedValueCents} currency={currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <caption
                style={{
                  textAlign: 'left',
                  fontWeight: 'var(--font-weight-semibold)',
                  marginBottom: 'var(--spacing-2)',
                }}
              >
                Exposure by chain
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={headerCellStyle}>
                    Chain
                  </th>
                  <th scope="col" style={numericHeaderStyle}>
                    Total
                  </th>
                  <th scope="col" style={numericHeaderStyle}>
                    Locked
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.byChain.map((row) => (
                  <tr key={row.chain}>
                    <th scope="row" style={cellStyle}>
                      {row.chain}
                    </th>
                    <td style={numericCellStyle}>
                      <CurrencyDisplay amount={row.totalValueCents} currency={currency} />
                    </td>
                    <td style={numericCellStyle}>
                      <CurrencyDisplay amount={row.lockedValueCents} currency={currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Reward income for tax / income classification */}
        {summary.rewardIncome.length > 0 && (
          <p
            style={{
              padding: 'var(--spacing-3)',
              background: 'var(--semantic-background-secondary, #f9fafb)',
              borderRadius: 'var(--radius-md, 0.375rem)',
              marginBottom: 'var(--spacing-4)',
            }}
          >
            <AppIcon name="info" />{' '}
            <strong>{money(summary.breakdown.pendingRewardValueCents)}</strong> of pending rewards
            across {summary.rewardIncome.length} reward balance
            {summary.rewardIncome.length === 1 ? '' : 's'} is flagged for income / tax
            classification. Staking and DeFi rewards are generally ordinary income at fair-market
            value when received.
          </p>
        )}

        {/* Manual entry form */}
        <form onSubmit={handleSubmit} aria-label="Add DeFi position">
          <h4
            style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--spacing-3)' }}
          >
            Add a position
          </h4>
          <div
            style={{
              display: 'grid',
              gap: 'var(--spacing-3)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            }}
          >
            <div>
              <label htmlFor={`${fieldId}-protocol`} style={labelStyle}>
                Protocol
              </label>
              <input
                id={`${fieldId}-protocol`}
                type="text"
                value={form.protocol}
                onChange={(e) => handleField('protocol', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-chain`} style={labelStyle}>
                Chain
              </label>
              <input
                id={`${fieldId}-chain`}
                type="text"
                value={form.chain}
                onChange={(e) => handleField('chain', e.target.value)}
                placeholder="ethereum"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-label`} style={labelStyle}>
                Label
              </label>
              <input
                id={`${fieldId}-label`}
                type="text"
                value={form.label}
                onChange={(e) => handleField('label', e.target.value)}
                placeholder="stETH staking"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-kind`} style={labelStyle}>
                Type
              </label>
              <select
                id={`${fieldId}-kind`}
                value={form.kind}
                onChange={(e) => handleField('kind', e.target.value as DefiPositionKind)}
                style={inputStyle}
              >
                {KIND_OPTIONS.map((kind) => (
                  <option key={kind} value={kind}>
                    {DEFI_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${fieldId}-lock`} style={labelStyle}>
                Lock state
              </label>
              <select
                id={`${fieldId}-lock`}
                value={form.lockState}
                onChange={(e) => handleField('lockState', e.target.value as DefiLockState)}
                style={inputStyle}
              >
                {LOCK_OPTIONS.map((state) => (
                  <option key={state} value={state}>
                    {DEFI_LOCK_STATE_LABELS[state]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${fieldId}-principal`} style={labelStyle}>
                Principal value ($)
              </label>
              <input
                id={`${fieldId}-principal`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.principalDollars}
                onChange={(e) => handleField('principalDollars', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-apy`} style={labelStyle}>
                APY (%)
              </label>
              <input
                id={`${fieldId}-apy`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={form.apyPercent}
                onChange={(e) => handleField('apyPercent', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-reward-token`} style={labelStyle}>
                Reward token
              </label>
              <input
                id={`${fieldId}-reward-token`}
                type="text"
                value={form.rewardToken}
                onChange={(e) => handleField('rewardToken', e.target.value)}
                placeholder="CRV"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-reward-value`} style={labelStyle}>
                Pending reward value ($)
              </label>
              <input
                id={`${fieldId}-reward-value`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.rewardDollars}
                onChange={(e) => handleField('rewardDollars', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-unlock`} style={labelStyle}>
                Unlock date
              </label>
              <input
                id={`${fieldId}-unlock`}
                type="date"
                value={form.unlockDate}
                onChange={(e) => handleField('unlockDate', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <button
            type="submit"
            style={{
              marginTop: 'var(--spacing-4)',
              padding: 'var(--spacing-2) var(--spacing-4)',
              border: 'none',
              borderRadius: 'var(--radius-md, 0.375rem)',
              background: 'var(--semantic-interactive-default, #2563eb)',
              color: 'var(--semantic-text-on-action, #fff)',
              font: 'inherit',
              fontWeight: 'var(--font-weight-medium)',
              cursor: 'pointer',
            }}
          >
            Add position
          </button>
        </form>
      </div>
    </section>
  );
};

export default DeFiPositionsCard;
