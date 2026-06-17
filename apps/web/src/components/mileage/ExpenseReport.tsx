// SPDX-License-Identifier: BUSL-1.1

import { formatCurrency } from '../../lib/currency';
import type { TaxReadyExpenseReport, TripEntry as MileageTripRecord } from '../../lib/mileage';
import './mileage.css';

function formatPurpose(purpose: string): string {
  return purpose.charAt(0).toUpperCase() + purpose.slice(1);
}

export interface ExpenseReportProps {
  report: TaxReadyExpenseReport;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onEditTrip?: (trip: MileageTripRecord) => void;
  onDeleteTrip?: (tripId: string) => void;
  isLoading?: boolean;
}

export function ExpenseReport({
  report,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onEditTrip,
  onDeleteTrip,
  isLoading = false,
}: ExpenseReportProps) {
  return (
    <section className="mileage-card" aria-labelledby="expense-report-title">
      <div className="mileage-card__header">
        <div>
          <h3 id="expense-report-title" className="mileage-card__title">
            Tax-ready expense report
          </h3>
          <p className="mileage-card__description">
            Filter the reporting window and review deductible trips plus tagged transactions.
          </p>
        </div>
      </div>

      <div className="mileage-report__filters">
        <div className="form-group">
          <label className="form-group__label" htmlFor="expense-report-start">
            Start date
          </label>
          <input
            id="expense-report-start"
            className="form-input"
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-group__label" htmlFor="expense-report-end">
            End date
          </label>
          <input
            id="expense-report-end"
            className="form-input"
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
          />
        </div>
      </div>

      <p className="mileage-report__period">Reporting period: {report.period.label}</p>

      <div className="mileage-report__totals">
        <article className="mileage-stat">
          <span className="mileage-stat__label">Mileage deduction</span>
          <p className="mileage-stat__value">{formatCurrency(report.totalMileageDeductionCents)}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Tagged expenses</span>
          <p className="mileage-stat__value">{formatCurrency(report.totalExpenseDeductionCents)}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Combined total</span>
          <p className="mileage-stat__value">{formatCurrency(report.grandTotalDeductionCents)}</p>
        </article>
      </div>

      {isLoading ? <p className="mileage-card__hint">Refreshing report…</p> : null}

      <div className="mileage-report__table-wrapper">
        <table className="mileage-report__table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Payee / Route</th>
              <th scope="col">Category</th>
              <th scope="col">Deduction</th>
            </tr>
          </thead>
          <tbody>
            {report.expenseEntries.map((entry) => (
              <tr key={entry.transactionId}>
                <td>{entry.date}</td>
                <td>{entry.payee}</td>
                <td>{entry.categoryLabel}</td>
                <td>{formatCurrency(entry.deductibleAmountCents)}</td>
              </tr>
            ))}
            {report.expenseEntries.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <p className="mileage-report__empty">
                    No tagged business expenses in this period.
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mileage-report__trip-list" role="list" aria-label="Logged trips">
        {report.tripEntries.map((trip) => {
          const deduction =
            report.mileageEntries.find((entry) => entry.id === trip.id)?.deductionCents ?? 0;

          return (
            <div key={trip.id} className="mileage-report__trip-item" role="listitem">
              <div className="mileage-report__trip-meta">
                <span className="mileage-report__trip-route">
                  {trip.startLocation} → {trip.endLocation}
                </span>
                <span className="mileage-report__trip-caption">
                  {trip.date} · {formatPurpose(trip.purpose)} · {trip.miles.toFixed(1)} miles
                </span>
              </div>
              <div className="mileage-report__trip-actions">
                <strong>{deduction > 0 ? formatCurrency(deduction) : 'Not deductible'}</strong>
                {onEditTrip ? (
                  <button type="button" className="icon-button" onClick={() => onEditTrip(trip)}>
                    Edit
                  </button>
                ) : null}
                {onDeleteTrip ? (
                  <button
                    type="button"
                    className="icon-button transaction-item__action--delete"
                    onClick={() => onDeleteTrip(trip.id)}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        {report.tripEntries.length === 0 ? (
          <p className="mileage-report__empty">No trips logged for this period.</p>
        ) : null}
      </div>
    </section>
  );
}
