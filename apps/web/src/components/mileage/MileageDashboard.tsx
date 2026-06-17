// SPDX-License-Identifier: BUSL-1.1

import { formatCurrency } from '../../lib/currency';
import type { TaxReadyExpenseReport } from '../../lib/mileage';
import './mileage.css';

function formatPurposeLabel(purpose: string): string {
  return purpose.charAt(0).toUpperCase() + purpose.slice(1);
}

export interface MileageDashboardProps {
  report: TaxReadyExpenseReport;
}

export function MileageDashboard({ report }: MileageDashboardProps) {
  const businessSummary = report.mileageByPurpose.find((entry) => entry.purpose === 'business');

  return (
    <section className="mileage-card" aria-labelledby="mileage-dashboard-title">
      <div className="mileage-card__header">
        <div>
          <h3 id="mileage-dashboard-title" className="mileage-card__title">
            Mileage dashboard
          </h3>
          <p className="mileage-card__description">
            IRS standard mileage deductions using 2024 rates.
          </p>
        </div>
      </div>

      <div className="mileage-stats">
        <article className="mileage-stat">
          <span className="mileage-stat__label">Trips in period</span>
          <p className="mileage-stat__value">{report.tripEntries.length}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Business miles</span>
          <p className="mileage-stat__value">{(businessSummary?.miles ?? 0).toFixed(1)}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Mileage deduction</span>
          <p className="mileage-stat__value">{formatCurrency(report.totalMileageDeductionCents)}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Total deductible</span>
          <p className="mileage-stat__value">{formatCurrency(report.grandTotalDeductionCents)}</p>
        </article>
      </div>

      {report.mileageByPurpose.length > 0 ? (
        <div className="mileage-list" role="list" aria-label="Mileage by purpose">
          {report.mileageByPurpose.map((entry) => (
            <div key={entry.purpose} className="mileage-list__item" role="listitem">
              <div className="mileage-list__meta">
                <span className="mileage-list__label">{formatPurposeLabel(entry.purpose)}</span>
                <span className="mileage-list__caption">{entry.tripCount} trip(s)</span>
              </div>
              <div className="mileage-list__meta" style={{ textAlign: 'right' }}>
                <span className="mileage-list__label">{entry.miles.toFixed(1)} mi</span>
                <span className="mileage-list__caption">
                  {formatCurrency(entry.deductionCents)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mileage-card__hint">No mileage logged for this period yet.</p>
      )}
    </section>
  );
}
