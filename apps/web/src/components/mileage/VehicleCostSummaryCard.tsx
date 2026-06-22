// SPDX-License-Identifier: BUSL-1.1

import { formatCurrency } from '../../lib/currency';
import type { MaintenanceReminder, VehicleCostSummary } from '../../lib/vehicle-cost-per-mile';
import './mileage.css';

function formatPerUnit(cents: number | null): string {
  return cents === null ? '—' : formatCurrency(cents);
}

const BEHAVIOR_LABELS: Record<'fixed' | 'variable', string> = {
  fixed: 'Fixed',
  variable: 'Variable',
};

const STATUS_LABELS: Record<MaintenanceReminder['status'], string> = {
  ok: 'On track',
  due_soon: 'Due soon',
  overdue: 'Overdue',
};

export interface VehicleCostSummaryCardProps {
  summary: VehicleCostSummary;
  reminders?: MaintenanceReminder[];
}

/**
 * Presentational card showing vehicle operating cost-per-mile, cost-per-shift,
 * the fixed/variable split, and odometer-based maintenance reminders.
 *
 * Status is conveyed with text (not color alone) to meet WCAG 2.2 AA.
 */
export function VehicleCostSummaryCard({ summary, reminders }: VehicleCostSummaryCardProps) {
  return (
    <section className="mileage-card" aria-labelledby="vehicle-cost-summary-title">
      <div className="mileage-card__header">
        <div>
          <h3 id="vehicle-cost-summary-title" className="mileage-card__title">
            Vehicle cost per mile
          </h3>
          <p className="mileage-card__description">
            Operating costs across {summary.milesDriven.toFixed(1)} business miles
            {summary.activeShifts > 0 ? ` and ${summary.activeShifts} active shift(s)` : ''}.
          </p>
        </div>
      </div>

      <div className="mileage-stats">
        <article className="mileage-stat">
          <span className="mileage-stat__label">Cost per mile</span>
          <p className="mileage-stat__value">{formatPerUnit(summary.costPerMileCents)}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Cost per shift</span>
          <p className="mileage-stat__value">{formatPerUnit(summary.costPerShiftCents)}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Variable / mile</span>
          <p className="mileage-stat__value">{formatPerUnit(summary.variableCostPerMileCents)}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Total operating cost</span>
          <p className="mileage-stat__value">{formatCurrency(summary.totalCostCents)}</p>
        </article>
      </div>

      <div className="mileage-stats">
        <article className="mileage-stat">
          <span className="mileage-stat__label">Fixed costs</span>
          <p className="mileage-stat__value">{formatCurrency(summary.fixedCostCents)}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Variable costs</span>
          <p className="mileage-stat__value">{formatCurrency(summary.variableCostCents)}</p>
        </article>
      </div>

      {summary.byCategory.length > 0 ? (
        <div className="deduction-summary__list" role="list" aria-label="Vehicle cost by category">
          {summary.byCategory.map((entry) => (
            <div key={entry.category} className="deduction-summary__item" role="listitem">
              <div className="deduction-summary__meta">
                <span className="deduction-summary__label">{entry.label}</span>
                <span className="deduction-summary__caption">
                  {BEHAVIOR_LABELS[entry.behavior]} · {formatPerUnit(entry.costPerMileCents)}/mi ·{' '}
                  {entry.transactionCount} entr{entry.transactionCount === 1 ? 'y' : 'ies'}
                </span>
              </div>
              <strong>{formatCurrency(entry.amountCents)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="mileage-card__hint">
          No vehicle expenses logged for this period. Tag transactions with “vehicle-expense” to
          track operating costs.
        </p>
      )}

      {reminders && reminders.length > 0 ? (
        <div
          className="deduction-summary__list"
          role="list"
          aria-label="Maintenance reminders by odometer milestone"
        >
          {reminders.map((reminder) => (
            <div key={reminder.id} className="deduction-summary__item" role="listitem">
              <div className="deduction-summary__meta">
                <span className="deduction-summary__label">{reminder.label}</span>
                <span className="deduction-summary__caption">
                  Next service at {reminder.nextServiceOdometer.toLocaleString()} mi ·{' '}
                  {reminder.status === 'overdue'
                    ? `${reminder.milesOverdue.toLocaleString()} mi overdue`
                    : `${reminder.milesRemaining.toLocaleString()} mi remaining`}
                </span>
              </div>
              <span
                className={`mileage-status mileage-status--${reminder.status}`}
                data-status={reminder.status}
              >
                {STATUS_LABELS[reminder.status]}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
