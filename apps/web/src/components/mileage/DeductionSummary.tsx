// SPDX-License-Identifier: BUSL-1.1

import { formatCurrency } from '../../lib/currency';
import type { TaxReadyExpenseReport } from '../../lib/mileage';
import './mileage.css';

export interface DeductionSummaryProps {
  report: TaxReadyExpenseReport;
}

export function DeductionSummary({ report }: DeductionSummaryProps) {
  return (
    <section className="mileage-card" aria-labelledby="deduction-summary-title">
      <div className="mileage-card__header">
        <div>
          <h3 id="deduction-summary-title" className="mileage-card__title">
            Deduction summary
          </h3>
          <p className="mileage-card__description">
            Totals by deductible category for the selected period.
          </p>
        </div>
      </div>

      <div className="deduction-summary__list" role="list">
        <div className="deduction-summary__item" role="listitem">
          <div className="deduction-summary__meta">
            <span className="deduction-summary__label">Mileage</span>
            <span className="deduction-summary__caption">IRS standard rate method</span>
          </div>
          <strong>{formatCurrency(report.totalMileageDeductionCents)}</strong>
        </div>
        {report.expenseByCategory.map((entry) => (
          <div key={entry.category} className="deduction-summary__item" role="listitem">
            <div className="deduction-summary__meta">
              <span className="deduction-summary__label">{entry.categoryLabel}</span>
              <span className="deduction-summary__caption">
                {entry.transactionCount} tagged transaction(s)
              </span>
            </div>
            <strong>{formatCurrency(entry.deductibleAmountCents)}</strong>
          </div>
        ))}
      </div>

      <div className="trip-entry__preview">
        <strong>Total deductible:</strong> {formatCurrency(report.grandTotalDeductionCents)}
      </div>
    </section>
  );
}
