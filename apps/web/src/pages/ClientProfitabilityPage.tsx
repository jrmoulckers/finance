// SPDX-License-Identifier: BUSL-1.1

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { DateInput, ErrorBanner, LoadingSpinner } from '../components/common';
import { CHART_COLORS, formatChartCurrency } from '../components/charts/chart-palette';
import { useTransactions } from '../hooks/useTransactions';
import { formatCurrency } from '../lib/currency';
import {
  DEFAULT_CLIENT_TAG_PREFIXES,
  buildClientProfitabilityReport,
  type ClientProfitabilityRow,
} from '../lib/reports/client-profitability';

import './ClientProfitabilityPage.css';

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }

  return `${value.toFixed(1)}%`;
}

function signedMetricClass(value: number): string {
  if (value > 0) return ' client-profitability__metric-value--positive';
  if (value < 0) return ' client-profitability__metric-value--negative';
  return '';
}

function rowDescription(row: ClientProfitabilityRow): string {
  return `${row.client}: ${formatCurrency(row.revenue)} billed, ${formatCurrency(
    row.expenses,
  )} cost, ${formatCurrency(row.netProfit)} net profit.`;
}

export function ClientProfitabilityPage() {
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

  const report = useMemo(
    () =>
      buildClientProfitabilityReport(transactions, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    [endDate, startDate, transactions],
  );

  const chartData = useMemo(
    () =>
      report.rows.map((row) => ({
        client: row.client,
        Revenue: row.revenue / 100,
        Cost: row.expenses / 100,
      })),
    [report.rows],
  );

  if (loading) {
    return <LoadingSpinner label="Loading client profitability report" />;
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  const mostProfitable = report.mostProfitable;
  const leastProfitable = report.leastProfitable;
  const tagExamples = DEFAULT_CLIENT_TAG_PREFIXES.map((prefix) => `${prefix}Acme`).join(' or ');

  return (
    <main className="client-profitability" aria-labelledby="client-profitability-title">
      <header className="client-profitability__header">
        <p className="client-profitability__eyebrow">Freelance reporting</p>
        <h1 id="client-profitability-title" className="client-profitability__title">
          Client / Project Profitability
        </h1>
        <p className="client-profitability__description">
          Tag transactions with {tagExamples} to allocate real income and costs to client or project
          profit-and-loss reporting.
        </p>
      </header>

      <section className="client-profitability__card" aria-labelledby="client-filters-title">
        <h2 id="client-filters-title" className="client-profitability__card-title">
          Date range
        </h2>
        <div className="client-profitability__filters">
          <div className="client-profitability__filter">
            <label className="client-profitability__label" htmlFor="client-report-start-date">
              Start date
            </label>
            <DateInput
              id="client-report-start-date"
              className="client-profitability__input"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="client-profitability__filter">
            <label className="client-profitability__label" htmlFor="client-report-end-date">
              End date
            </label>
            <DateInput
              id="client-report-end-date"
              className="client-profitability__input"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="client-profitability__card" aria-labelledby="client-summary-title">
        <h2 id="client-summary-title" className="client-profitability__card-title">
          Summary
        </h2>
        <div
          className="client-profitability__summary-grid"
          role="group"
          aria-label="Profitability summary"
        >
          <div className="client-profitability__metric">
            <span className="client-profitability__metric-label">Total billed</span>
            <span className="client-profitability__metric-value">
              {formatCurrency(report.totalRevenue)}
            </span>
          </div>
          <div className="client-profitability__metric">
            <span className="client-profitability__metric-label">Total cost</span>
            <span className="client-profitability__metric-value">
              {formatCurrency(report.totalExpenses)}
            </span>
          </div>
          <div className="client-profitability__metric">
            <span className="client-profitability__metric-label">Net profit</span>
            <span
              className={`client-profitability__metric-value${signedMetricClass(report.netProfit)}`}
            >
              {formatCurrency(report.netProfit)}
            </span>
          </div>
          <div className="client-profitability__metric">
            <span className="client-profitability__metric-label">Profit margin</span>
            <span className="client-profitability__metric-value">
              {formatPercent(report.profitMargin)}
            </span>
          </div>
          <div className="client-profitability__metric">
            <span className="client-profitability__metric-label">Most profitable</span>
            <span className="client-profitability__metric-value">
              {mostProfitable ? mostProfitable.client : '—'}
            </span>
          </div>
          <div className="client-profitability__metric">
            <span className="client-profitability__metric-label">Least profitable</span>
            <span className="client-profitability__metric-value">
              {leastProfitable ? leastProfitable.client : '—'}
            </span>
          </div>
        </div>
      </section>

      <section className="client-profitability__card" aria-labelledby="client-chart-title">
        <h2 id="client-chart-title" className="client-profitability__card-title">
          Revenue vs cost by client
        </h2>
        {chartData.length > 0 ? (
          <>
            <div
              className="client-profitability__chart"
              role="img"
              aria-label={`Bar chart comparing revenue and cost for ${report.clientCount} clients.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--semantic-border-default, #E5E7EB)"
                  />
                  <XAxis dataKey="client" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(value: number) => formatChartCurrency(value)} width={80} />
                  <Tooltip formatter={(value) => formatChartCurrency(Number(value ?? 0))} />
                  <Legend />
                  <Bar dataKey="Revenue" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Cost" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="client-profitability__chart-caption">
              {report.rows.map(rowDescription).join(' ')}
            </p>
          </>
        ) : (
          <p className="client-profitability__empty">
            No client/project tagged income or expenses in this date range.
          </p>
        )}
      </section>

      <section className="client-profitability__card" aria-labelledby="client-table-title">
        <h2 id="client-table-title" className="client-profitability__card-title">
          Profitability detail
        </h2>
        {report.rows.length > 0 ? (
          <div
            className="client-profitability__table-wrapper"
            role="region"
            aria-label="Client profitability table"
            tabIndex={0}
          >
            <table className="client-profitability__table">
              <thead>
                <tr>
                  <th scope="col">Client / project</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">Cost</th>
                  <th scope="col">Net profit</th>
                  <th scope="col">Margin</th>
                  <th scope="col">Transactions</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.client}>
                    <th scope="row">{row.client}</th>
                    <td>{formatCurrency(row.revenue)}</td>
                    <td>{formatCurrency(row.expenses)}</td>
                    <td>{formatCurrency(row.netProfit)}</td>
                    <td>{formatPercent(row.profitMargin)}</td>
                    <td>{row.transactionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="client-profitability__empty">
            Add tags like {tagExamples} to transactions to populate this report.
          </p>
        )}
      </section>
    </main>
  );
}

export default ClientProfitabilityPage;
