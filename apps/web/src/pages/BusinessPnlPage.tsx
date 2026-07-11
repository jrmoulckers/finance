// SPDX-License-Identifier: BUSL-1.1

/**
 * Business Profit & Loss page.
 *
 * Renders a weekly or monthly P&L statement for a small-business owner from
 * their categorized transactions: revenue − COGS = gross profit, less labor
 * and other operating expenses = net profit, with gross and net margins.
 *
 * Data is read exclusively through the `useTransactions` hook; all P&L maths
 * happen in the pure {@link buildProfitAndLoss} engine. References: issue #2184.
 */

import { useCallback, useMemo, useState } from 'react';

import { DateInput, ErrorBanner, LoadingSpinner } from '../components/common';
import { useTransactions } from '../hooks/useTransactions';
import type { Transaction } from '../kmp/bridge';
import { formatCurrency } from '../lib/currency';
import { buildDatedExportFileName } from '../lib/export/simple-export';
import {
  buildProfitAndLoss,
  exportBusinessPnlCsv,
  formatMarginPercent,
  type PnlGranularity,
  type PnlTotals,
} from '../lib/business/profit-and-loss';
import {
  buildScheduleCReport,
  SCHEDULE_C_DISCLAIMER,
  summarizeTaxCategories,
  type ScheduleCReportRow,
  type TaxTaggableTransaction,
} from '../lib/tax';

import './BusinessPnlPage.css';

const GRANULARITY_OPTIONS: ReadonlyArray<{ value: PnlGranularity; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

type NetStatus = 'profit' | 'loss' | 'breakeven';

function netStatusOf(netProfitCents: number): NetStatus {
  if (netProfitCents > 0) return 'profit';
  if (netProfitCents < 0) return 'loss';
  return 'breakeven';
}

const NET_STATUS_LABEL: Record<NetStatus, string> = {
  profit: 'Profit',
  loss: 'Loss',
  breakeven: 'Break-even',
};

function amountClass(cents: number): string {
  if (cents > 0) return ' business-pnl__amount--positive';
  if (cents < 0) return ' business-pnl__amount--negative';
  return '';
}

/** Adapt an app transaction to the tax-tagging engine's input shape. */
function toTaxTaggable(transaction: Transaction): TaxTaggableTransaction {
  return {
    id: transaction.id,
    date: transaction.date,
    type: transaction.type,
    amountCents: transaction.amount.amount,
    payee: transaction.payee ?? undefined,
    memo: transaction.note ?? undefined,
    customFields: transaction.customFields ?? undefined,
  };
}

/** Pick the tax year to report: the end-date year, else the latest data year, else now. */
function deriveTaxYear(transactions: readonly Transaction[], endDate: string): number {
  const fromEnd = Number.parseInt(endDate.slice(0, 4), 10);
  if (Number.isInteger(fromEnd)) return fromEnd;

  let latest = 0;
  for (const transaction of transactions) {
    const year = Number.parseInt(transaction.date.slice(0, 4), 10);
    if (Number.isInteger(year) && year > latest) latest = year;
  }
  return latest > 0 ? latest : new Date().getFullYear();
}

export function BusinessPnlPage() {
  const [granularity, setGranularity] = useState<PnlGranularity>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const transactionFilters = useMemo(
    () => ({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [endDate, startDate],
  );

  const { transactions, loading, error, refresh } = useTransactions(transactionFilters);

  const statement = useMemo(
    () =>
      buildProfitAndLoss(transactions, {
        granularity,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    [endDate, granularity, startDate, transactions],
  );

  const handleExportCsv = useCallback(() => {
    const csv = exportBusinessPnlCsv(statement);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildDatedExportFileName('business-pnl', 'csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [statement]);

  const taxYear = useMemo(() => deriveTaxYear(transactions, endDate), [endDate, transactions]);

  const scheduleC = useMemo(
    () => buildScheduleCReport(summarizeTaxCategories(transactions.map(toTaxTaggable), taxYear)),
    [taxYear, transactions],
  );

  const hasScheduleCData =
    scheduleC.incomeRows.length > 0 ||
    scheduleC.expenseRows.length > 0 ||
    scheduleC.unmappedRows.length > 0;

  if (loading) {
    return <LoadingSpinner label="Loading profit and loss statement" />;
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  const totals = statement.totals;
  const netStatus = netStatusOf(totals.netProfitCents);
  const periodNoun = granularity === 'weekly' ? 'week' : 'month';

  return (
    <main className="business-pnl" aria-labelledby="business-pnl-title">
      <header className="business-pnl__header">
        <p className="business-pnl__eyebrow">Small-business reporting</p>
        <h1 id="business-pnl-title" className="business-pnl__title">
          Profit &amp; Loss
        </h1>
        <p className="business-pnl__description">
          See whether your business is actually profitable each {periodNoun}. Tag transactions with{' '}
          <code>cogs</code>, <code>labor</code> or <code>overhead</code> to break out cost of goods
          sold, labor and other operating expenses; untagged income counts as revenue and untagged
          expenses as overhead.
        </p>
        <button
          type="button"
          className="business-pnl__export-btn"
          onClick={handleExportCsv}
          disabled={statement.periods.length === 0}
          aria-label="Download profit and loss statement as CSV"
        >
          Download CSV
        </button>
      </header>

      <section className="business-pnl__card" aria-labelledby="business-pnl-controls-title">
        <h2 id="business-pnl-controls-title" className="business-pnl__card-title">
          Period &amp; date range
        </h2>
        <div className="business-pnl__controls">
          <fieldset className="business-pnl__toggle">
            <legend className="business-pnl__toggle-legend">Reporting period</legend>
            <div className="business-pnl__toggle-options">
              {GRANULARITY_OPTIONS.map((option) => {
                const selected = granularity === option.value;
                return (
                  <label
                    key={option.value}
                    className={`business-pnl__toggle-option${
                      selected ? ' business-pnl__toggle-option--active' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="business-pnl-granularity"
                      className="business-pnl__toggle-input"
                      value={option.value}
                      checked={selected}
                      onChange={() => setGranularity(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="business-pnl__filters">
            <div className="business-pnl__filter">
              <label className="business-pnl__label" htmlFor="business-pnl-start-date">
                Start date
              </label>
              <DateInput
                id="business-pnl-start-date"
                className="business-pnl__input"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="business-pnl__filter">
              <label className="business-pnl__label" htmlFor="business-pnl-end-date">
                End date
              </label>
              <DateInput
                id="business-pnl-end-date"
                className="business-pnl__input"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="business-pnl__card" aria-labelledby="business-pnl-summary-title">
        <h2 id="business-pnl-summary-title" className="business-pnl__card-title">
          Summary
        </h2>
        <div
          className="business-pnl__summary-grid"
          role="group"
          aria-label="Profit and loss summary"
        >
          <div className="business-pnl__metric">
            <span className="business-pnl__metric-label">Revenue</span>
            <span className="business-pnl__metric-value">
              {formatCurrency(totals.revenueCents)}
            </span>
          </div>
          <div className="business-pnl__metric">
            <span className="business-pnl__metric-label">Gross profit</span>
            <span className={`business-pnl__metric-value${amountClass(totals.grossProfitCents)}`}>
              {formatCurrency(totals.grossProfitCents)}
            </span>
            <span className="business-pnl__metric-sub">
              {formatMarginPercent(totals.grossMarginBps)} margin
            </span>
          </div>
          <div className="business-pnl__metric">
            <span className="business-pnl__metric-label">Operating expenses</span>
            <span className="business-pnl__metric-value">
              {formatCurrency(totals.operatingExpensesCents)}
            </span>
            <span className="business-pnl__metric-sub">Labor + overhead</span>
          </div>
          <div className="business-pnl__metric">
            <span className="business-pnl__metric-label">Net profit</span>
            <span className={`business-pnl__metric-value${amountClass(totals.netProfitCents)}`}>
              {formatCurrency(totals.netProfitCents)}
            </span>
            <span className={`business-pnl__status business-pnl__status--${netStatus}`}>
              {NET_STATUS_LABEL[netStatus]} · {formatMarginPercent(totals.netMarginBps)} margin
            </span>
          </div>
        </div>
      </section>

      {totals.untaggedExpenseCount > 0 ? (
        <section
          className="business-pnl__card business-pnl__card--hint"
          aria-labelledby="business-pnl-cogs-hint-title"
        >
          <h2 id="business-pnl-cogs-hint-title" className="business-pnl__card-title">
            COGS may be understated
          </h2>
          <p className="business-pnl__hint-text">
            {formatCurrency(totals.untaggedExpenseCents)} across {totals.untaggedExpenseCount}{' '}
            {totals.untaggedExpenseCount === 1 ? 'expense' : 'expenses'} fell into{' '}
            <strong>overhead</strong> only because it carried no P&amp;L tag and matched no
            cost-of-goods supplier rule. If any of these are inventory or materials, tag them{' '}
            <code>cogs</code> (or designate the supplier as a cost of goods) so gross margin
            isn&apos;t overstated.
          </p>
        </section>
      ) : null}

      <section className="business-pnl__card" aria-labelledby="business-pnl-statement-title">
        <h2 id="business-pnl-statement-title" className="business-pnl__card-title">
          Statement
        </h2>
        <div className="business-pnl__table-wrapper" tabIndex={0}>
          <table className="business-pnl__table business-pnl__table--statement">
            <caption className="business-pnl__caption">
              Profit and loss line items across the selected range.
            </caption>
            <thead>
              <tr>
                <th scope="col">Line item</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              <StatementRow label="Revenue" cents={totals.revenueCents} />
              <StatementRow label="Cost of goods sold" cents={totals.cogsCents} kind="cost" />
              <StatementRow
                label="Gross profit"
                cents={totals.grossProfitCents}
                emphasis
                marginBps={totals.grossMarginBps}
                marginLabel="Gross margin"
              />
              <StatementRow label="Labor" cents={totals.laborCents} kind="cost" />
              <StatementRow
                label="Other operating expenses"
                cents={totals.overheadCents}
                kind="cost"
              />
              <StatementRow
                label="Net profit"
                cents={totals.netProfitCents}
                emphasis
                marginBps={totals.netMarginBps}
                marginLabel="Net margin"
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="business-pnl__card" aria-labelledby="business-pnl-periods-title">
        <h2 id="business-pnl-periods-title" className="business-pnl__card-title">
          {granularity === 'weekly' ? 'Weekly' : 'Monthly'} breakdown
        </h2>
        {statement.periods.length > 0 ? (
          <div
            className="business-pnl__table-wrapper"
            role="region"
            aria-label="Profit and loss by period"
            tabIndex={0}
          >
            <table className="business-pnl__table">
              <caption className="business-pnl__caption business-pnl__sr-only">
                Revenue, costs, profit and margins for each {periodNoun}.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">COGS</th>
                  <th scope="col">Gross profit</th>
                  <th scope="col">Gross margin</th>
                  <th scope="col">Operating expenses</th>
                  <th scope="col">Net profit</th>
                  <th scope="col">Net margin</th>
                </tr>
              </thead>
              <tbody>
                {statement.periods.map((period) => (
                  <tr key={period.key}>
                    <th scope="row">{period.label}</th>
                    <td>{formatCurrency(period.revenueCents)}</td>
                    <td>{formatCurrency(period.cogsCents)}</td>
                    <td className={amountClass(period.grossProfitCents).trim()}>
                      {formatCurrency(period.grossProfitCents)}
                    </td>
                    <td>{formatMarginPercent(period.grossMarginBps)}</td>
                    <td>{formatCurrency(period.operatingExpensesCents)}</td>
                    <td className={amountClass(period.netProfitCents).trim()}>
                      {formatCurrency(period.netProfitCents)}
                    </td>
                    <td>{formatMarginPercent(period.netMarginBps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="business-pnl__empty">
            No revenue or expense transactions in this range yet. Add transactions (and tag costs as{' '}
            <code>cogs</code>, <code>labor</code> or <code>overhead</code>) to build your statement.
          </p>
        )}
      </section>

      <section className="business-pnl__card" aria-labelledby="business-pnl-schedule-c-title">
        <h2 id="business-pnl-schedule-c-title" className="business-pnl__card-title">
          Schedule C view · tax year {taxYear}
        </h2>
        <p className="business-pnl__schedule-c-note" role="note">
          {SCHEDULE_C_DISCLAIMER}
        </p>
        {hasScheduleCData ? (
          <>
            <div className="business-pnl__table-wrapper" tabIndex={0}>
              <table className="business-pnl__table business-pnl__table--statement">
                <caption className="business-pnl__caption business-pnl__sr-only">
                  Estimated Schedule C income and expense lines for tax year {taxYear}.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    <th scope="col">Category</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="business-pnl__row business-pnl__row--emphasis">
                    <th scope="row" colSpan={2}>
                      Part I · Income
                    </th>
                    <td className={amountClass(scheduleC.totalIncomeCents).trim()}>
                      {formatCurrency(scheduleC.totalIncomeCents)}
                    </td>
                  </tr>
                  {scheduleC.incomeRows.map((row) => (
                    <ScheduleCRow key={row.line.id} row={row} />
                  ))}
                  <tr className="business-pnl__row business-pnl__row--emphasis">
                    <th scope="row" colSpan={2}>
                      Part II · Expenses
                    </th>
                    <td>{formatCurrency(scheduleC.totalExpenseCents)}</td>
                  </tr>
                  {scheduleC.expenseRows.length > 0 ? (
                    scheduleC.expenseRows.map((row) => <ScheduleCRow key={row.line.id} row={row} />)
                  ) : (
                    <tr className="business-pnl__row">
                      <td colSpan={3}>No deductible business expenses mapped yet.</td>
                    </tr>
                  )}
                  <tr className="business-pnl__row business-pnl__row--emphasis">
                    <th scope="row" colSpan={2}>
                      Net profit (Line 31)
                    </th>
                    <td className={amountClass(scheduleC.netProfitCents).trim()}>
                      {formatCurrency(scheduleC.netProfitCents)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {scheduleC.unmappedRows.length > 0 && (
              <details className="business-pnl__schedule-c-unmapped">
                <summary>
                  Not on Schedule C ({scheduleC.unmappedRows.length}
                  {scheduleC.unmappedRows.length === 1 ? ' category' : ' categories'})
                </summary>
                <ul className="business-pnl__schedule-c-unmapped-list">
                  {scheduleC.unmappedRows.map((row) => (
                    <li key={row.category}>
                      <span className="business-pnl__schedule-c-unmapped-amount">
                        {formatCurrency(row.amountCents)}
                      </span>{' '}
                      {row.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {(scheduleC.reviewNeededCount > 0 || scheduleC.missingReceiptCount > 0) && (
              <p className="business-pnl__schedule-c-flags">
                {scheduleC.reviewNeededCount > 0 &&
                  `${scheduleC.reviewNeededCount} transaction${
                    scheduleC.reviewNeededCount === 1 ? '' : 's'
                  } need review. `}
                {scheduleC.missingReceiptCount > 0 &&
                  `${scheduleC.missingReceiptCount} missing a receipt.`}
              </p>
            )}
          </>
        ) : (
          <p className="business-pnl__empty">
            No categorized business income or expenses for {taxYear} yet. Tag transactions as
            business/deductible so they map onto Schedule C lines.
          </p>
        )}
      </section>
    </main>
  );
}

interface ScheduleCRowProps {
  row: ScheduleCReportRow;
}

function ScheduleCRow({ row }: ScheduleCRowProps) {
  return (
    <tr className="business-pnl__row">
      <th scope="row">{row.line.lineNumber}</th>
      <td>{row.line.label}</td>
      <td>{formatCurrency(row.amountCents)}</td>
    </tr>
  );
}

interface StatementRowProps {
  label: string;
  cents: number;
  /** `cost` rows are subtracted from revenue, shown with a leading minus. */
  kind?: 'amount' | 'cost';
  /** Emphasized subtotal rows (gross profit / net profit). */
  emphasis?: boolean;
  marginBps?: PnlTotals['grossMarginBps'];
  marginLabel?: string;
}

function StatementRow({
  label,
  cents,
  kind = 'amount',
  emphasis = false,
  marginBps,
  marginLabel,
}: StatementRowProps) {
  const rowClass = emphasis ? ' business-pnl__row--emphasis' : '';
  const valueClass = emphasis ? amountClass(cents) : '';
  const display = kind === 'cost' ? `(${formatCurrency(cents)})` : formatCurrency(cents);

  return (
    <tr className={`business-pnl__row${rowClass}`}>
      <th scope="row">
        {label}
        {marginLabel ? (
          <span className="business-pnl__row-margin">
            {marginLabel}: {formatMarginPercent(marginBps ?? null)}
          </span>
        ) : null}
      </th>
      <td className={valueClass.trim()}>{display}</td>
    </tr>
  );
}

export default BusinessPnlPage;
