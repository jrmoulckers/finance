// SPDX-License-Identifier: BUSL-1.1

/**
 * GigPlatformEarningsSection — surfaces gig-platform payouts (Uber, DoorDash,
 * Instacart, Lyft, Grubhub, ...) inside the Cash Flow page.
 *
 * Features:
 *   - period segmented control (today / this week / this month) as accessible tabs,
 *   - combined cross-platform total with an aria-live announcement,
 *   - by-platform breakdown (the by-platform "Income Sources" view) with text
 *     amounts + percentages (no colour-only signalling),
 *   - expected-vs-received reconciliation in a real data table,
 *   - a platform filter, and
 *   - a disclosure to manage the mapping rules.
 *
 * Data access goes exclusively through the {@link useGigPlatformEarnings} hook;
 * aggregation lives in the pure platform-earnings engine.
 *
 * Imported DIRECTLY by CashFlowPage (not via a shared barrel) so it stays in
 * the code-split Cash Flow chunk and does not inflate other route bundles.
 *
 * References: issue #2133
 */

import React, { useId, useMemo, useState } from 'react';

import { CHART_COLORS } from '../charts/chart-palette';
import { CurrencyDisplay } from '../common/CurrencyDisplay';
import { Checkbox } from '../common/Checkbox';
import { useGigPlatformEarnings } from '../../hooks/useGigPlatformEarnings';
import { formatCentsDisplay, parseAmountInput } from '../../hooks/useAmountInput';
import { platformPercent, reconcilePlatformPayouts } from '../../lib/gig/platform-earnings';
import type {
  GigMatchField,
  GigPeriodKey,
  PlatformEarnings,
  PlatformEarningsResult,
  PlatformReconciliation,
} from '../../lib/gig/platform-types';
import './gig-platform.css';

const ALL_PLATFORMS = '__all__';

const PERIODS: { key: GigPeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
];

const MATCH_FIELDS: { value: GigMatchField; label: string }[] = [
  { value: 'any', label: 'Any field' },
  { value: 'payee', label: 'Payee' },
  { value: 'description', label: 'Description' },
  { value: 'account', label: 'Account' },
];

// ---------------------------------------------------------------------------
// Period tabs
// ---------------------------------------------------------------------------

interface PeriodTabsProps {
  value: GigPeriodKey;
  onChange: (period: GigPeriodKey) => void;
  baseId: string;
}

const PeriodTabs: React.FC<PeriodTabsProps> = ({ value, onChange, baseId }) => (
  <div className="analytics-period-selector" role="tablist" aria-label="Earnings period">
    {PERIODS.map((period) => {
      const selected = value === period.key;
      return (
        <button
          key={period.key}
          type="button"
          role="tab"
          id={`${baseId}-tab-${period.key}`}
          aria-selected={selected}
          aria-controls={`${baseId}-panel`}
          tabIndex={selected ? 0 : -1}
          className={`analytics-period-selector__btn ${
            selected ? 'analytics-period-selector__btn--active' : ''
          }`}
          onClick={() => onChange(period.key)}
        >
          {period.label}
        </button>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Breakdown list
// ---------------------------------------------------------------------------

interface PlatformBreakdownProps {
  platforms: PlatformEarnings[];
  result: PlatformEarningsResult;
  period: GigPeriodKey;
}

const PlatformBreakdown: React.FC<PlatformBreakdownProps> = ({ platforms, result, period }) => {
  if (platforms.length === 0) {
    return (
      <p className="gig-empty">
        No gig-platform earnings for this period. Map payees, descriptions, or accounts to a
        platform below to start tracking payouts.
      </p>
    );
  }

  return (
    <div className="analytics-breakdown" role="list" aria-label="Earnings by gig platform">
      {platforms.map((platform, idx) => {
        const amount = platform.amounts[period];
        const count = platform.counts[period];
        const percent = platformPercent(platform, result, period);
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        return (
          <div key={platform.platform} className="analytics-breakdown__item" role="listitem">
            <div className="analytics-breakdown__bar-wrapper">
              <div className="analytics-breakdown__header">
                <span className="analytics-breakdown__name">
                  {platform.platform}
                  <span className="analytics-breakdown__amount">
                    {' '}
                    · {count} {count === 1 ? 'payout' : 'payouts'}
                  </span>
                </span>
                <span className="analytics-breakdown__amount">
                  <CurrencyDisplay amount={amount} context={`${platform.platform} earnings`} />
                </span>
              </div>
              <div
                className="analytics-breakdown__track"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${platform.platform}: ${percent}% of gig earnings`}
              >
                <div
                  className="analytics-breakdown__fill"
                  style={{ width: `${percent}%`, backgroundColor: color }}
                />
              </div>
            </div>
            <span className="analytics-breakdown__percent">{percent}%</span>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

const STATUS_META: Record<
  PlatformReconciliation['status'],
  { label: string; symbol: string; className: string }
> = {
  matched: { label: 'On track', symbol: '✓', className: 'gig-status--matched' },
  over: { label: 'Over expected', symbol: '▲', className: 'gig-status--over' },
  under: { label: 'Short', symbol: '▼', className: 'gig-status--under' },
  pending: { label: 'Awaiting deposit', symbol: '…', className: 'gig-status--pending' },
};

interface ReconciliationRowProps {
  row: PlatformReconciliation;
  onCommit: (platform: string, cents: number) => void;
}

const ReconciliationRow: React.FC<ReconciliationRowProps> = ({ row, onCommit }) => {
  const initial = row.expectedCents > 0 ? formatCentsDisplay(row.expectedCents, '$') : '';
  const [draft, setDraft] = useState(initial);
  const status = STATUS_META[row.status];

  const commit = () => {
    const trimmed = draft.trim();
    const cents = trimmed === '' ? 0 : parseAmountInput(trimmed, 2, false);
    onCommit(row.platform, cents);
  };

  return (
    <tr>
      <th scope="row">{row.platform}</th>
      <td className="gig-num">
        <input
          className="gig-input"
          type="text"
          inputMode="decimal"
          aria-label={`Expected payout for ${row.platform}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
      </td>
      <td className="gig-num">
        <CurrencyDisplay amount={row.receivedCents} context={`${row.platform} received`} />
      </td>
      <td className="gig-num">
        <CurrencyDisplay amount={row.varianceCents} showSign context={`${row.platform} variance`} />
      </td>
      <td>
        <span className={`gig-status ${status.className}`}>
          <span className="gig-status__symbol" aria-hidden="true">
            {status.symbol}
          </span>
          {status.label}
        </span>
      </td>
    </tr>
  );
};

interface ReconciliationTableProps {
  rows: PlatformReconciliation[];
  period: GigPeriodKey;
  onCommit: (platform: string, cents: number) => void;
}

const PERIOD_NOUN: Record<GigPeriodKey, string> = {
  today: 'today',
  week: 'this week',
  month: 'this month',
};

const ReconciliationTable: React.FC<ReconciliationTableProps> = ({ rows, period, onCommit }) => {
  if (rows.length === 0) {
    return (
      <p className="gig-empty">
        Enter an expected payout for a platform to reconcile it against the deposits received{' '}
        {PERIOD_NOUN[period]}.
      </p>
    );
  }
  return (
    <div className="gig-table-wrapper">
      <table className="gig-table">
        <caption>Expected payout vs. deposit received ({PERIOD_NOUN[period]})</caption>
        <thead>
          <tr>
            <th scope="col">Platform</th>
            <th scope="col" className="gig-num">
              Expected
            </th>
            <th scope="col" className="gig-num">
              Received
            </th>
            <th scope="col" className="gig-num">
              Variance
            </th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ReconciliationRow key={row.platform} row={row} onCommit={onCommit} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Rule manager
// ---------------------------------------------------------------------------

interface RuleManagerProps {
  rules: ReturnType<typeof useGigPlatformEarnings>['rules'];
  onAdd: ReturnType<typeof useGigPlatformEarnings>['addRule'];
  onToggle: (id: string) => void;
  onRemove: (id: string) => boolean;
  baseId: string;
}

const RuleManager: React.FC<RuleManagerProps> = ({ rules, onAdd, onToggle, onRemove, baseId }) => {
  const [platform, setPlatform] = useState('');
  const [field, setField] = useState<GigMatchField>('any');
  const [keywords, setKeywords] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const keywordList = keywords
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    if (!platform.trim()) {
      setFormError('Enter a platform name.');
      return;
    }
    if (keywordList.length === 0) {
      setFormError('Enter at least one keyword.');
      return;
    }
    const created = onAdd({ platform: platform.trim(), matchField: field, keywords: keywordList });
    if (created) {
      setPlatform('');
      setKeywords('');
      setField('any');
      setFormError(null);
    } else {
      setFormError('Could not create the rule.');
    }
  };

  return (
    <details className="gig-rules">
      <summary className="gig-rules__summary">Manage platform mapping rules</summary>

      <ul className="gig-rule-list" aria-label="Platform mapping rules">
        {rules.map((rule) => {
          const toggleId = `${baseId}-rule-${rule.id}`;
          return (
            <li key={rule.id} className="gig-rule-item">
              <span className="gig-rule-item__name">{rule.platform}</span>
              <span className="gig-rule-item__meta">
                {rule.matchField} contains {rule.keywords.join(', ')}
                {rule.isBuiltIn ? ' (built-in)' : ''}
              </span>
              <Checkbox
                id={toggleId}
                className="gig-toggle"
                label="Enabled"
                checked={rule.enabled}
                onChange={() => onToggle(rule.id)}
              />
              <button
                type="button"
                className="gig-btn"
                onClick={() => onRemove(rule.id)}
                aria-label={`Remove ${rule.platform} rule`}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <form className="gig-rule-form" onSubmit={submit} aria-label="Add a platform mapping rule">
        <div className="gig-field">
          <label className="gig-field__label" htmlFor={`${baseId}-new-platform`}>
            Platform name
          </label>
          <input
            id={`${baseId}-new-platform`}
            className="gig-input"
            style={{ width: '12rem', textAlign: 'left' }}
            type="text"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            placeholder="e.g. Shipt"
          />
        </div>
        <div className="gig-field">
          <label className="gig-field__label" htmlFor={`${baseId}-new-field`}>
            Match field
          </label>
          <select
            id={`${baseId}-new-field`}
            className="gig-select"
            value={field}
            onChange={(e) => setField(e.target.value as GigMatchField)}
          >
            {MATCH_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="gig-field">
          <label className="gig-field__label" htmlFor={`${baseId}-new-keywords`}>
            Keywords (comma separated)
          </label>
          <input
            id={`${baseId}-new-keywords`}
            className="gig-input"
            style={{ width: '16rem', textAlign: 'left' }}
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="e.g. shipt, shopt llc"
            aria-describedby={formError ? `${baseId}-form-error` : undefined}
          />
        </div>
        <button type="submit" className="gig-btn gig-btn--primary">
          Add rule
        </button>
        {formError ? (
          <p id={`${baseId}-form-error`} className="gig-empty" role="alert">
            {formError}
          </p>
        ) : null}
      </form>
    </details>
  );
};

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export const GigPlatformEarningsSection: React.FC = () => {
  const {
    earnings,
    rules,
    expectedPayouts,
    knownPlatforms,
    loading,
    error,
    addRule,
    toggleRule,
    removeRule,
    setExpectedPayout,
  } = useGigPlatformEarnings();

  const [period, setPeriod] = useState<GigPeriodKey>('today');
  const [filter, setFilter] = useState<string>(ALL_PLATFORMS);
  const baseId = useId();

  const visiblePlatforms = useMemo(() => {
    if (filter === ALL_PLATFORMS) return [...earnings.platforms];
    return earnings.platforms.filter((p) => p.platform === filter);
  }, [earnings.platforms, filter]);

  const reconciliation = useMemo(() => {
    const expected = Object.entries(expectedPayouts).map(([platform, expectedCents]) => ({
      platform,
      expectedCents,
    }));
    const rows = reconcilePlatformPayouts(expected, earnings, { period });
    if (filter === ALL_PLATFORMS) return rows;
    return rows.filter((r) => r.platform === filter);
  }, [expectedPayouts, earnings, period, filter]);

  const combinedTotal = earnings.combined[period];
  const combinedCount = earnings.combinedCounts[period];
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? '';

  if (loading) {
    return (
      <section className="analytics-section" aria-label="Gig platform earnings">
        <h3 className="analytics-section__title">Gig Platform Earnings</h3>
        <p className="gig-empty" role="status">
          Loading gig-platform earnings…
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="analytics-section" aria-label="Gig platform earnings">
        <h3 className="analytics-section__title">Gig Platform Earnings</h3>
        <p className="gig-empty" role="alert">
          {error}
        </p>
      </section>
    );
  }

  return (
    <section className="analytics-section" aria-label="Gig platform earnings">
      <h3 className="analytics-section__title">Gig Platform Earnings</h3>

      <div className="gig-controls">
        <PeriodTabs value={period} onChange={setPeriod} baseId={baseId} />
        <div className="gig-field">
          <label className="gig-field__label" htmlFor={`${baseId}-filter`}>
            Filter by platform
          </label>
          <select
            id={`${baseId}-filter`}
            className="gig-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value={ALL_PLATFORMS}>All platforms</option>
            {knownPlatforms.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="gig-combined" aria-live="polite">
        <span className="gig-combined__label">Combined {periodLabel.toLowerCase()} earnings:</span>
        <span className="gig-combined__value">
          <CurrencyDisplay amount={combinedTotal} context="combined gig earnings" />
        </span>
        <span className="gig-combined__meta">
          across {earnings.platforms.length}{' '}
          {earnings.platforms.length === 1 ? 'platform' : 'platforms'} · {combinedCount}{' '}
          {combinedCount === 1 ? 'payout' : 'payouts'}
        </span>
      </p>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${period}`}>
        <PlatformBreakdown platforms={visiblePlatforms} result={earnings} period={period} />
      </div>

      <h4 className="analytics-section__title" style={{ marginTop: 'var(--spacing-5)' }}>
        Payout reconciliation
      </h4>
      <ReconciliationTable rows={reconciliation} period={period} onCommit={setExpectedPayout} />

      <RuleManager
        rules={rules}
        onAdd={addRule}
        onToggle={toggleRule}
        onRemove={removeRule}
        baseId={baseId}
      />
    </section>
  );
};

export default GigPlatformEarningsSection;
