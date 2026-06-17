// SPDX-License-Identifier: BUSL-1.1

/**
 * PlanningPage — Financial planning tools hub.
 *
 * Combines four planning features into a tabbed interface:
 * 1. What-If Scenario Modeler (#1743, #1735)
 * 2. Retirement Readiness & Monte Carlo (#1721, #1679)
 * 3. Linked Savings Goals (#1644)
 * 4. Sweep Automation Rules (#1635)
 *
 * Accessibility:
 * - Tab navigation with proper ARIA roles (tablist, tab, tabpanel)
 * - Progress bars with aria-valuenow/min/max
 * - Live regions for dynamic updates
 * - Keyboard-accessible sliders and controls
 * - Reduced motion support
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBanner, LoadingSpinner } from '../components/common';
import { useScenarioModeler } from '../hooks/useScenarioModeler';
import { useRetirementPlanner } from '../hooks/useRetirementPlanner';
import { useRmdTracking } from '../hooks/useRmdTracking';
import { useLinkedGoals } from '../hooks/useLinkedGoals';
import { useSweepRules } from '../hooks/useSweepRules';
import { useGoals } from '../hooks/useGoals';
import { useBudgets } from '../hooks/useBudgets';
import { formatCurrency } from '../lib/currency';
import { RMD_START_AGE, type RmdAccountStatus } from '../lib/rmd';
import type {
  RetirementReadiness,
  RetirementFactor,
  RetirementParams,
  ScenarioProjection,
  LinkedGoal,
  SweepEvaluation,
  SweepLogEntry,
} from '../lib/planning';
import { projectRetirementHealthcareCosts } from '../lib/planning';
import './PlanningPage.css';
import { AppIcon, type IconName } from '../components/icons';
import { TrendLineChart } from '../components/charts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlanningTab = 'scenarios' | 'life-events' | 'retirement' | 'goals' | 'sweep';

const TAB_CONFIG: { id: PlanningTab; label: string; icon: IconName }[] = [
  { id: 'scenarios', label: 'What-If Modeler', icon: 'sparkles' },
  { id: 'life-events', label: 'Life Events', icon: 'calendar' },
  { id: 'retirement', label: 'Retirement', icon: 'leaf' },
  { id: 'goals', label: 'Savings Goals', icon: 'target' },
  { id: 'sweep', label: 'Automations', icon: 'lightning' },
];

const LIFE_EVENTS_STORAGE_KEY = 'finance:life-events-timeline';

export interface LifeEvent {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly monthlyCostChangeCents: number;
}

export interface LifeEventProjection extends LifeEvent {
  readonly monthlyFreeCashFlowDeltaCents: number;
  readonly cumulativeMonthlyFreeCashFlowCents: number;
  readonly projectedMonthlyFreeCashFlowCents: number;
  readonly monthOffset: number;
}

export interface ReallocationGuidanceItem {
  readonly label: string;
  readonly amountCents: number;
}

interface NamedPlanningItem {
  readonly name: string;
}

interface BudgetCashFlowSnapshot {
  readonly period?: string;
  readonly amount?: { readonly amount: number };
  readonly spentAmount?: { readonly amount: number };
  readonly remainingAmount?: { readonly amount: number };
}

function parseLifeEventMonthValue(date: string): number {
  const [yearText, monthText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return year * 12 + month;
}

function monthOffsetFromNow(date: string, now = new Date()): number {
  const [yearText, monthText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return 0;
  }

  return Math.max(0, (year - now.getFullYear()) * 12 + (month - (now.getMonth() + 1)));
}

function formatLifeEventMonth(date: string): string {
  const [yearText, monthText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return date;
  }

  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

function defaultLifeEventDate(monthsFromNow: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsFromNow);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function loadLifeEvents(): LifeEvent[] {
  try {
    const raw = localStorage.getItem(LIFE_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LifeEvent[];
    return parsed.filter(
      (event) =>
        event &&
        typeof event.id === 'string' &&
        typeof event.name === 'string' &&
        typeof event.date === 'string' &&
        Number.isFinite(event.monthlyCostChangeCents),
    );
  } catch {
    return [];
  }
}

function saveLifeEvents(events: readonly LifeEvent[]): void {
  try {
    localStorage.setItem(LIFE_EVENTS_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Local storage can be unavailable or full; keep the in-memory timeline usable.
  }
}

export function sortLifeEvents(events: readonly LifeEvent[]): LifeEvent[] {
  return [...events].sort((a, b) => {
    const dateDiff = parseLifeEventMonthValue(a.date) - parseLifeEventMonthValue(b.date);
    if (dateDiff !== 0) return dateDiff;
    return a.name.localeCompare(b.name);
  });
}

export function computeLifeEventProjections(
  events: readonly LifeEvent[],
  baseMonthlyFreeCashFlowCents = 0,
): LifeEventProjection[] {
  let cumulativeMonthlyFreeCashFlowCents = 0;

  return sortLifeEvents(events).map((event) => {
    const monthlyFreeCashFlowDeltaCents = -event.monthlyCostChangeCents;
    cumulativeMonthlyFreeCashFlowCents += monthlyFreeCashFlowDeltaCents;

    return {
      ...event,
      monthlyFreeCashFlowDeltaCents,
      cumulativeMonthlyFreeCashFlowCents,
      projectedMonthlyFreeCashFlowCents:
        baseMonthlyFreeCashFlowCents + cumulativeMonthlyFreeCashFlowCents,
      monthOffset: monthOffsetFromNow(event.date),
    };
  });
}

export function computeBudgetMonthlyFreeCashFlowCents(
  budgets: readonly BudgetCashFlowSnapshot[],
): number {
  const periodMultipliers: Record<string, number> = {
    WEEKLY: 52 / 12,
    BIWEEKLY: 26 / 12,
    MONTHLY: 1,
    QUARTERLY: 1 / 3,
    YEARLY: 1 / 12,
  };

  return budgets.reduce((sum, budget) => {
    const remainingCents =
      budget.remainingAmount?.amount ??
      Math.max(0, (budget.amount?.amount ?? 0) - (budget.spentAmount?.amount ?? 0));
    const multiplier = periodMultipliers[String(budget.period ?? 'MONTHLY')] ?? 1;
    return sum + Math.round(remainingCents * multiplier);
  }, 0);
}

export function buildReallocationGuidance(
  freedCents: number,
  goals: readonly NamedPlanningItem[] = [],
  budgets: readonly NamedPlanningItem[] = [],
): ReallocationGuidanceItem[] {
  if (freedCents <= 0) {
    return [];
  }

  const findByName = (pattern: RegExp) => goals.find((goal) => pattern.test(goal.name));
  const educationGoal = findByName(/college|education|school|tuition|529/i);
  const retirementGoal = findByName(/retire|401|ira/i);
  const emergencyGoal = findByName(/emergency|safety|reserve|savings/i);
  const hasDebtBudget = budgets.some((budget) => /debt|loan|mortgage|card/i.test(budget.name));

  const labels = [
    educationGoal ? `Boost ${educationGoal.name}` : 'Boost a college fund',
    retirementGoal ? `Increase ${retirementGoal.name}` : 'Increase retirement contributions',
    hasDebtBudget ? 'Accelerate debt payoff' : 'Pay down debt',
    emergencyGoal ? `Top up ${emergencyGoal.name}` : 'Build emergency savings',
  ];
  const weights = [0.45, 0.3, 0.15, 0.1];
  const amounts = weights.map((weight) => Math.floor(freedCents * weight));
  amounts[0] += freedCents - amounts.reduce((sum, amount) => sum + amount, 0);

  return labels.map((label, index) => ({ label, amountCents: amounts[index] ?? 0 }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Score circle visualization for retirement readiness. */
const ReadinessScoreCircle: React.FC<{
  score: number;
  rating: RetirementReadiness['rating'];
}> = ({ score, rating }) => {
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div
      className="readiness-score__circle"
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Retirement readiness score: ${score} out of 100, rated ${rating}`}
    >
      <svg
        className="readiness-score__svg"
        width="120"
        height="120"
        viewBox="0 0 120 120"
        aria-hidden="true"
        focusable="false"
      >
        <circle className="readiness-score__bg" cx="60" cy="60" r="45" />
        <circle
          className={`readiness-score__fill readiness-score__fill--${rating}`}
          cx="60"
          cy="60"
          r="45"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="readiness-score__number" aria-hidden="true">
        {score}
      </span>
    </div>
  );
};

/** Single retirement factor display. */
const FactorItem: React.FC<{ factor: RetirementFactor }> = ({ factor }) => {
  const icon: IconName =
    factor.impact === 'positive'
      ? 'check'
      : factor.impact === 'negative'
        ? 'alert-triangle'
        : 'info';
  return (
    <li className="factor-item" role="listitem">
      <span className="factor-icon" aria-hidden="true">
        <AppIcon name={icon} />
      </span>
      <div>
        <span className="factor-item__label">{factor.label}</span>
        <p className="factor-item__desc">{factor.description}</p>
      </div>
    </li>
  );
};

const RmdStatusCard: React.FC<{ status: RmdAccountStatus }> = ({ status }) => {
  const statusLabel = status.isSatisfied
    ? 'Satisfied'
    : status.urgency === 'overdue'
      ? 'Overdue'
      : status.urgency === 'due-soon'
        ? 'Due soon'
        : 'Upcoming';

  return (
    <article
      className={`rmd-account rmd-account--${status.urgency}`}
      aria-label={`RMD for ${status.accountName}`}
    >
      <div className="rmd-account__header">
        <h4 className="rmd-account__name">{status.accountName}</h4>
        <span className={`rmd-account__badge rmd-account__badge--${status.urgency}`}>
          {statusLabel}
        </span>
      </div>
      <dl className="rmd-account__metrics">
        <div>
          <dt>Required RMD</dt>
          <dd>{formatCurrency(status.requiredCents)}</dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>{new Date(`${status.deadline}T00:00:00`).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt>Withdrawn so far</dt>
          <dd>{formatCurrency(status.withdrawnCents)}</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd>{formatCurrency(status.remainingCents)}</dd>
        </div>
      </dl>
      <p className="rmd-account__detail">
        Based on {formatCurrency(status.priorYearEndBalanceCents)} prior-year-end balance ÷{' '}
        {status.distributionPeriod} distribution period.
      </p>
      {status.isFirstYear && (
        <p className="rmd-account__detail">
          First RMD year: the initial withdrawal can be completed by Apr 1 of the following year.
        </p>
      )}
    </article>
  );
};

/** Slider control with label and value display. */
const PlanningSlider: React.FC<{
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}> = ({ id, label, value, min, max, step, displayValue, onChange }) => (
  <div className="planning-slider">
    <div className="planning-slider__header">
      <label className="planning-slider__label" htmlFor={id}>
        {label}
      </label>
      <span className="planning-slider__value" aria-live="polite">
        {displayValue}
      </span>
    </div>
    <input
      id={id}
      className="planning-slider__input"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={displayValue}
    />
  </div>
);

/** SVG line chart for projection data. */
const ProjectionChart: React.FC<{
  projections: ScenarioProjection[];
  months: number;
}> = ({ projections, months }) => {
  const width = 800;
  const height = 250;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };

  const chartData = useMemo(() => {
    const allValues = projections.flatMap((p) => p.points.map((pt) => pt.netWorthCents));
    const minVal = Math.min(...allValues, 0);
    const maxVal = Math.max(...allValues, 1);
    const range = maxVal - minVal || 1;

    const xScale = (month: number) =>
      padding.left + ((width - padding.left - padding.right) * month) / months;
    const yScale = (cents: number) =>
      height -
      padding.bottom -
      ((cents - minVal) / range) * (height - padding.top - padding.bottom);

    return { xScale, yScale, minVal, maxVal };
  }, [projections, months]);

  const colors = [
    'var(--semantic-text-secondary)',
    'var(--semantic-interactive-default)',
    'var(--semantic-status-positive)',
    'var(--semantic-status-warning)',
  ];

  return (
    <div className="projection-chart" aria-label="Net worth projection chart" role="img">
      <svg
        className="projection-chart__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const val = chartData.minVal + (chartData.maxVal - chartData.minVal) * pct;
          const y = chartData.yScale(val);
          return (
            <text
              key={pct}
              className="projection-chart__axis-label"
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
            >
              {formatCurrency(val)}
            </text>
          );
        })}

        {/* X-axis labels */}
        {[
          0,
          Math.floor(months / 4),
          Math.floor(months / 2),
          Math.floor((months * 3) / 4),
          months,
        ].map((m) => (
          <text
            key={m}
            className="projection-chart__axis-label"
            x={chartData.xScale(m)}
            y={height - 8}
            textAnchor="middle"
          >
            {m === 0 ? 'Now' : `${m}mo`}
          </text>
        ))}

        {/* Projection lines */}
        {projections.map((proj, idx) => {
          const pathData = proj.points
            .map(
              (pt, i) =>
                `${i === 0 ? 'M' : 'L'} ${chartData.xScale(pt.month)} ${chartData.yScale(pt.netWorthCents)}`,
            )
            .join(' ');

          return (
            <path
              key={proj.scenarioId}
              className={`projection-chart__line ${idx === 0 ? 'projection-chart__line--baseline' : 'projection-chart__line--scenario'}`}
              d={pathData}
              stroke={colors[idx % colors.length]}
            />
          );
        })}
      </svg>
    </div>
  );
};

/** Goal progress bar with milestones. */
const GoalProgressCard: React.FC<{ goal: LinkedGoal }> = ({ goal }) => (
  <div className="goal-progress" aria-label={`Goal: ${goal.name}`}>
    <div className="goal-progress__header">
      <span className="goal-progress__name">{goal.name}</span>
      <span className="goal-progress__percent">{goal.progressPercent}%</span>
    </div>
    <div
      className="goal-progress__bar"
      role="progressbar"
      aria-valuenow={goal.progressPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${goal.name}: ${goal.progressPercent}% complete`}
    >
      <div
        className={`goal-progress__fill ${goal.progressPercent >= 100 ? 'goal-progress__fill--complete' : ''}`}
        style={{ width: `${Math.min(100, goal.progressPercent)}%` }}
      />
    </div>
    <div className="goal-progress__meta">
      <span>
        {formatCurrency(goal.currentCents)} / {formatCurrency(goal.targetCents)}
      </span>
      {goal.accountName && <span>Linked: {goal.accountName}</span>}
    </div>
    {goal.projectedCompletionDate && (
      <p className="goal-progress__meta" aria-live="polite">
        Projected completion: {new Date(goal.projectedCompletionDate).toLocaleDateString()}
      </p>
    )}
    <div className="milestone-list" role="list" aria-label="Milestones">
      {goal.milestones.map((m) => (
        <div
          key={m.percent}
          className="milestone"
          role="listitem"
          aria-label={`${m.percent}% milestone: ${m.reached ? 'reached' : 'not reached'}`}
        >
          <span
            className={`milestone__icon ${m.reached ? 'milestone__icon--reached' : ''}`}
            aria-hidden="true"
          >
            {m.reached ? <AppIcon name="check" /> : m.percent}
          </span>
          <span className="milestone__label">{m.percent}%</span>
        </div>
      ))}
    </div>
  </div>
);

/** Sweep evaluation result card. */
const SweepEvalCard: React.FC<{ evaluation: SweepEvaluation }> = ({ evaluation }) => (
  <div
    className={`sweep-eval ${!evaluation.feasible ? 'sweep-eval--infeasible' : ''}`}
    aria-label={`${evaluation.ruleName}: ${evaluation.feasible ? 'feasible' : 'not feasible'}`}
  >
    <div className="sweep-eval__row">
      <span>{evaluation.ruleName}</span>
      <span className="sweep-eval__amount">
        {evaluation.feasible ? formatCurrency(evaluation.amountCents) : '—'}
      </span>
    </div>
    <div className="sweep-eval__row">
      <span>
        {evaluation.sourceAccountName} → {evaluation.destinationName}
      </span>
    </div>
    {evaluation.reason && (
      <p className="sweep-eval__reason" role="alert">
        {evaluation.reason}
      </p>
    )}
  </div>
);

/** Sweep log entry row. */
const LogEntryRow: React.FC<{ entry: SweepLogEntry }> = ({ entry }) => (
  <div className="sweep-log__entry">
    <span>{entry.ruleName}</span>
    <span>{formatCurrency(entry.amountCents)}</span>
    <span className={`sweep-log__mode sweep-log__mode--${entry.mode}`}>{entry.mode}</span>
    <span>{new Date(entry.timestamp).toLocaleDateString()}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Tab panels
// ---------------------------------------------------------------------------

/** What-if scenario modeler tab. */
const ScenariosPanel: React.FC = () => {
  const {
    scenarios,
    projections,
    selectedScenario,
    projectionMonths,
    loading,
    createScenario,
    selectScenario,
    deleteScenario,
    duplicate,
    addAdjustmentToSelected,
    removeAdjustmentFromSelected,
    setProjectionMonths,
  } = useScenarioModeler();

  const [newName, setNewName] = useState('');

  const handleCreate = useCallback(() => {
    if (newName.trim()) {
      createScenario(newName.trim());
      setNewName('');
    }
  }, [newName, createScenario]);

  if (loading) {
    return (
      <div className="planning-page__loading" role="status">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <div className="planning-actions">
        <input
          className="form-input"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New scenario name…"
          aria-label="New scenario name"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button
          className="planning-btn planning-btn--primary"
          onClick={handleCreate}
          disabled={!newName.trim()}
          aria-label="Create new scenario"
        >
          Create Scenario
        </button>
      </div>

      <PlanningSlider
        id="projection-months"
        label="Projection Period"
        value={projectionMonths}
        min={12}
        max={120}
        step={12}
        displayValue={`${projectionMonths / 12} years`}
        onChange={setProjectionMonths}
      />

      {scenarios.length === 0 ? (
        <div className="planning-empty">
          <div className="planning-empty__icon" aria-hidden="true">
            <AppIcon name="sparkles" />
          </div>
          <p className="planning-empty__text">
            Create a &quot;what if&quot; scenario to see how financial decisions impact your future.
          </p>
        </div>
      ) : (
        <>
          <ProjectionChart projections={projections} months={projectionMonths} />

          <div className="scenario-list" role="list" aria-label="Scenarios">
            {scenarios.map((scenario) => {
              const projection = projections.find((p) => p.scenarioId === scenario.id);
              const isSelected = selectedScenario?.id === scenario.id;
              return (
                <div
                  key={scenario.id}
                  className={`scenario-item ${isSelected ? 'scenario-item--selected' : ''}`}
                  role="listitem"
                  aria-label={scenario.name}
                  onClick={() => selectScenario(isSelected ? null : scenario.id)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && selectScenario(isSelected ? null : scenario.id)
                  }
                  tabIndex={0}
                >
                  <div className="scenario-item__name">{scenario.name}</div>
                  <div className="scenario-item__adjustments">
                    {scenario.adjustments.length} adjustment
                    {scenario.adjustments.length !== 1 ? 's' : ''}
                  </div>
                  {projection && (
                    <div
                      className={`scenario-item__delta ${
                        projection.netWorthDeltaCents >= 0
                          ? 'scenario-item__delta--positive'
                          : 'scenario-item__delta--negative'
                      }`}
                    >
                      {projection.netWorthDeltaCents >= 0 ? '+' : ''}
                      {formatCurrency(projection.netWorthDeltaCents)} net worth impact
                    </div>
                  )}
                  <div className="planning-actions">
                    <button
                      className="planning-btn planning-btn--small"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicate(scenario.id);
                      }}
                      aria-label={`Duplicate ${scenario.name}`}
                    >
                      Duplicate
                    </button>
                    <button
                      className="planning-btn planning-btn--small planning-btn--danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteScenario(scenario.id);
                      }}
                      aria-label={`Delete ${scenario.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedScenario && (
            <section className="planning-card" aria-label={`Edit ${selectedScenario.name}`}>
              <h3 className="planning-card__title">{selectedScenario.name} — Adjustments</h3>
              <ul role="list" aria-label="Adjustments">
                {selectedScenario.adjustments.map((adj) => (
                  <li key={adj.id} role="listitem" className="factor-item">
                    <span>
                      {adj.label}: {formatCurrency(adj.monthlyCents)}/mo ({adj.category})
                    </span>
                    <button
                      className="planning-btn planning-btn--small planning-btn--danger"
                      onClick={() => removeAdjustmentFromSelected(adj.id)}
                      aria-label={`Remove ${adj.label}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="planning-actions">
                <button
                  className="planning-btn planning-btn--small"
                  onClick={() => addAdjustmentToSelected('Salary raise', 'income', 100000)}
                  aria-label="Add income adjustment"
                >
                  + Income
                </button>
                <button
                  className="planning-btn planning-btn--small"
                  onClick={() => addAdjustmentToSelected('New expense', 'expense', 50000)}
                  aria-label="Add expense adjustment"
                >
                  + Expense
                </button>
                <button
                  className="planning-btn planning-btn--small"
                  onClick={() => addAdjustmentToSelected('Extra savings', 'savings', 25000)}
                  aria-label="Add savings adjustment"
                >
                  + Savings
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

/** Healthcare cost projection section for retirement planning. */
const HealthcareProjectionSection: React.FC<{ params: RetirementParams }> = ({ params }) => {
  const projection = useMemo(
    () =>
      projectRetirementHealthcareCosts({
        retirementAge: params.retirementAge,
        projectionEndAge: 90,
        desiredAnnualRetirementSpendingCents: params.desiredMonthlySpendingCents * 12,
        generalInflationRate: params.annualInflationRate,
        annualRetirementIncomeCents: params.desiredMonthlySpendingCents * 12,
      }),
    [params.annualInflationRate, params.desiredMonthlySpendingCents, params.retirementAge],
  );

  const firstMedicareYear = projection.years.find((year) => !year.isPreMedicareGap);
  const sampleAges = Array.from(new Set([params.retirementAge, 65, 75, 85, 90]))
    .filter((age) => age >= params.retirementAge && age <= 90)
    .sort((a, b) => a - b);
  const projectionRows = sampleAges
    .map((age) => projection.years.find((year) => year.age === age))
    .filter((year): year is NonNullable<typeof year> => Boolean(year));
  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <section
      className="planning-card healthcare-projection"
      aria-label="Healthcare cost projection"
    >
      <div className="planning-card__header">
        <div>
          <h3 className="planning-card__title">Healthcare Cost Projection</h3>
          <p className="healthcare-projection__subtitle">
            Medicare Part B, Part D, Medigap, out-of-pocket costs, IRMAA, and healthcare inflation
            through age 90.
          </p>
        </div>
      </div>

      <div className="planning-metrics" aria-label="Healthcare projection summary">
        <article className="planning-metric" aria-label="First year healthcare cost">
          <p className="planning-metric__label">First retirement year</p>
          <p className="planning-metric__value">
            {formatCurrency(projection.firstYearHealthcareCents)}
          </p>
        </article>
        <article className="planning-metric" aria-label="Age 90 healthcare cost">
          <p className="planning-metric__label">Age 90 annual cost</p>
          <p className="planning-metric__value">
            {formatCurrency(projection.finalYearHealthcareCents)}
          </p>
        </article>
        <article className="planning-metric" aria-label="Cumulative healthcare cost">
          <p className="planning-metric__label">Cumulative through 90</p>
          <p className="planning-metric__value">
            {formatCurrency(projection.cumulativeHealthcareCents)}
          </p>
        </article>
        <article className="planning-metric" aria-label="Healthcare share of spending">
          <p className="planning-metric__label">Share of spending</p>
          <p className="planning-metric__value">
            {formatPercent(projection.healthcareShareOfSpending)}
          </p>
        </article>
      </div>

      {projection.preMedicareGapYears > 0 && (
        <p className="healthcare-projection__gap" role="note">
          Retiring at {params.retirementAge} creates a {projection.preMedicareGapYears}-year pre-65
          coverage gap before Medicare eligibility; this projection uses higher ACA/private premium
          assumptions for those years.
        </p>
      )}

      {firstMedicareYear && (
        <div className="healthcare-projection__components">
          <h4 className="healthcare-projection__heading">
            Medicare-year annual cost at age {firstMedicareYear.age}
          </h4>
          <dl className="healthcare-projection__component-list">
            <div>
              <dt>Part B premium</dt>
              <dd>{formatCurrency(firstMedicareYear.partBAnnualCents)}</dd>
            </div>
            <div>
              <dt>Part D premium</dt>
              <dd>{formatCurrency(firstMedicareYear.partDAnnualCents)}</dd>
            </div>
            <div>
              <dt>Medigap/supplemental</dt>
              <dd>{formatCurrency(firstMedicareYear.medigapAnnualCents)}</dd>
            </div>
            <div>
              <dt>Out-of-pocket estimate</dt>
              <dd>{formatCurrency(firstMedicareYear.outOfPocketCents)}</dd>
            </div>
            {firstMedicareYear.irmaaSurchargeAnnualCents > 0 && (
              <div>
                <dt>IRMAA surcharge</dt>
                <dd>{formatCurrency(firstMedicareYear.irmaaSurchargeAnnualCents)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="healthcare-projection__table-wrapper">
        <table className="healthcare-projection__table">
          <caption>Inflation-adjusted healthcare projection checkpoints</caption>
          <thead>
            <tr>
              <th scope="col">Age</th>
              <th scope="col">Coverage</th>
              <th scope="col">Annual cost</th>
              <th scope="col">Spending share</th>
            </tr>
          </thead>
          <tbody>
            {projectionRows.map((year) => (
              <tr key={year.age}>
                <th scope="row">{year.age}</th>
                <td>{year.isPreMedicareGap ? 'ACA/private gap' : 'Medicare'}</td>
                <td>{formatCurrency(year.totalAnnualCents)}</td>
                <td>{formatPercent(year.healthcareShareOfSpending)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="healthcare-projection__footnote">
        Uses a {formatPercent(projection.healthcareInflationRate)} healthcare inflation assumption,
        typically above general inflation, so fixed-income plans include rising medical pressure.
      </p>
    </section>
  );
};

const LIFE_EVENT_TEMPLATES: readonly Omit<LifeEvent, 'id'>[] = [
  {
    name: 'Childcare ends',
    date: defaultLifeEventDate(24),
    monthlyCostChangeCents: -120000,
  },
  {
    name: 'Child starts kindergarten',
    date: defaultLifeEventDate(18),
    monthlyCostChangeCents: -80000,
  },
  {
    name: 'Mortgage paid off',
    date: defaultLifeEventDate(60),
    monthlyCostChangeCents: -150000,
  },
  {
    name: 'College starts',
    date: defaultLifeEventDate(96),
    monthlyCostChangeCents: 50000,
  },
];

const LifeEventTemplateButtons: React.FC<{
  onChoose: (template: Omit<LifeEvent, 'id'>) => void;
}> = ({ onChoose }) => (
  <div className="life-events-template-list" aria-label="Life event examples">
    {LIFE_EVENT_TEMPLATES.map((template) => (
      <button
        key={template.name}
        type="button"
        className="planning-btn planning-btn--small"
        onClick={() => onChoose(template)}
      >
        {template.name}
      </button>
    ))}
  </div>
);

/** Family life events timeline tab. */
const LifeEventsPanel: React.FC = () => {
  const { goals } = useGoals();
  const { budgets } = useBudgets();
  const [events, setEvents] = useState<LifeEvent[]>(loadLifeEvents);
  const [name, setName] = useState('');
  const [date, setDate] = useState(defaultLifeEventDate(12));
  const [monthlyChange, setMonthlyChange] = useState('');

  useEffect(() => {
    saveLifeEvents(events);
  }, [events]);

  const baseMonthlyFreeCashFlowCents = useMemo(
    () => computeBudgetMonthlyFreeCashFlowCents(budgets),
    [budgets],
  );
  const projections = useMemo(
    () => computeLifeEventProjections(events, baseMonthlyFreeCashFlowCents),
    [events, baseMonthlyFreeCashFlowCents],
  );
  const finalProjectedFreeCashFlowCents =
    projections.at(-1)?.projectedMonthlyFreeCashFlowCents ?? baseMonthlyFreeCashFlowCents;

  const handleTemplate = useCallback((template: Omit<LifeEvent, 'id'>) => {
    setName(template.name);
    setDate(template.date);
    setMonthlyChange(String(template.monthlyCostChangeCents / 100));
  }, []);

  const handleAdd = useCallback(() => {
    const trimmedName = name.trim();
    const monthlyCostChangeCents = Math.round(Number(monthlyChange) * 100);

    if (!trimmedName || !date || !Number.isFinite(monthlyCostChangeCents)) {
      return;
    }

    setEvents((prev) => [
      ...prev,
      {
        id: `life-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: trimmedName,
        date,
        monthlyCostChangeCents,
      },
    ]);
    setName('');
    setDate(defaultLifeEventDate(12));
    setMonthlyChange('');
  }, [date, monthlyChange, name]);

  const handleDelete = useCallback((id: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== id));
  }, []);

  return (
    <div>
      <section className="planning-card life-events-intro" aria-labelledby="life-events-title">
        <h3 id="life-events-title" className="planning-card__title">
          Life Events Timeline
        </h3>
        <p className="planning-card__description">
          Map when major family costs start or end, then decide where freed-up cash should go next.
          Enter expense reductions as negative amounts and new costs as positive amounts.
        </p>

        <div className="life-events-form" aria-label="Add future life event">
          <label className="life-events-field">
            Event name
            <input
              className="form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Childcare ends"
            />
          </label>
          <label className="life-events-field">
            Event month
            <input
              className="form-input"
              type="month"
              min={defaultLifeEventDate(0)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="life-events-field">
            Monthly cost change
            <input
              className="form-input"
              type="number"
              inputMode="decimal"
              value={monthlyChange}
              onChange={(e) => setMonthlyChange(e.target.value)}
              placeholder="-1200"
            />
          </label>
          <button
            className="planning-btn planning-btn--primary"
            type="button"
            onClick={handleAdd}
            disabled={!name.trim() || !date || !monthlyChange.trim()}
          >
            Add Event
          </button>
        </div>
        <LifeEventTemplateButtons onChoose={handleTemplate} />
      </section>

      <div className="planning-metrics" aria-label="Life events cash flow summary">
        <article className="planning-metric">
          <p className="planning-metric__label">Current monthly free cash flow</p>
          <p className="planning-metric__value">{formatCurrency(baseMonthlyFreeCashFlowCents)}</p>
        </article>
        <article className="planning-metric">
          <p className="planning-metric__label">After planned events</p>
          <p className="planning-metric__value">
            {formatCurrency(finalProjectedFreeCashFlowCents)}
          </p>
        </article>
        <article className="planning-metric">
          <p className="planning-metric__label">Events mapped</p>
          <p className="planning-metric__value">{events.length}</p>
        </article>
      </div>

      {projections.length === 0 ? (
        <div className="planning-empty">
          <div className="planning-empty__icon" aria-hidden="true">
            <AppIcon name="calendar" />
          </div>
          <p className="planning-empty__text">
            Add childcare, school, mortgage, college, or other family milestones to see the cash
            flow path.
          </p>
        </div>
      ) : (
        <>
          <section className="planning-card" aria-label="Life events timeline">
            <div className="life-events-timeline" role="list">
              {projections.map((event) => {
                const freedCents = event.monthlyFreeCashFlowDeltaCents;
                const isFreedMoney = freedCents > 0;
                const guidance = buildReallocationGuidance(freedCents, goals, budgets);

                return (
                  <article key={event.id} className="life-event" role="listitem">
                    <div
                      className={`life-event__marker ${isFreedMoney ? 'life-event__marker--positive' : 'life-event__marker--negative'}`}
                      aria-hidden="true"
                    />
                    <p className="life-event__date">{formatLifeEventMonth(event.date)}</p>
                    <h4 className="life-event__name">{event.name}</h4>
                    <p
                      className={`life-event__delta ${isFreedMoney ? 'life-event__delta--positive' : 'life-event__delta--negative'}`}
                    >
                      {isFreedMoney ? 'Frees' : 'Adds'} {formatCurrency(Math.abs(freedCents))}/mo
                    </p>
                    <p className="life-event__cash-flow">
                      Projected monthly free cash flow:{' '}
                      {formatCurrency(event.projectedMonthlyFreeCashFlowCents)}
                    </p>
                    {isFreedMoney ? (
                      <div className="life-event__guidance">
                        <p className="life-event__guidance-title">
                          Reallocate {formatCurrency(freedCents)}/mo:
                        </p>
                        <ul>
                          {guidance.map((item) => (
                            <li key={item.label}>
                              {item.label}: {formatCurrency(item.amountCents)}/mo
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="life-event__guidance-title">
                        Plan for {formatCurrency(Math.abs(freedCents))}/mo by trimming flexible
                        budgets, increasing income, or lowering another planned expense.
                      </p>
                    )}
                    <button
                      className="planning-btn planning-btn--small planning-btn--danger"
                      type="button"
                      onClick={() => handleDelete(event.id)}
                      aria-label={`Delete ${event.name}`}
                    >
                      Delete
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section
            className="planning-card"
            aria-label="Projected monthly free cash flow over time"
          >
            <h3 className="planning-card__title">Projected Monthly Free Cash Flow Over Time</h3>
            <ol className="life-events-cash-flow-list">
              <li>Today: {formatCurrency(baseMonthlyFreeCashFlowCents)}/mo</li>
              {projections.map((event) => (
                <li key={event.id}>
                  {formatLifeEventMonth(event.date)} — {event.name}:{' '}
                  {formatCurrency(event.projectedMonthlyFreeCashFlowCents)}/mo
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
};

/** Retirement readiness tab. */
const RetirementPanel: React.FC = () => {
  const {
    params,
    readiness,
    incomeProjection,
    setCurrentAge,
    setRetirementAge,
    setPlanningHorizonAge,
    setMonthlyContribution,
    setDesiredSpending,
    setRetirementIncome,
    setAnnualReturn,
    setInflationRate,
  } = useRetirementPlanner();
  const {
    statuses: rmdStatuses,
    reminders: rmdReminders,
    loading: rmdLoading,
    error: rmdError,
  } = useRmdTracking(params.currentAge);

  if (!readiness) {
    return (
      <div className="planning-page__loading" role="status">
        <LoadingSpinner />
      </div>
    );
  }

  const retirementChartData = incomeProjection.points.map((point) => ({
    label: point.depleted ? `Age ${point.age} (depleted)` : `Age ${point.age}`,
    balance: point.endingBalanceCents / 100,
  }));
  const projectionAnswer = incomeProjection.lastsThroughHorizon
    ? `Your savings lasts through age ${incomeProjection.horizonAge} with ${formatCurrency(
        incomeProjection.finalBalanceCents,
      )} remaining.`
    : `Your savings lasts until age ${incomeProjection.depletionAge}.`;

  return (
    <div>
      {/* Score display */}
      <div className="planning-card">
        <div className="readiness-score">
          <ReadinessScoreCircle score={readiness.score} rating={readiness.rating} />
          <div className="readiness-score__details">
            <p className="readiness-score__rating">{readiness.rating} readiness</p>
            <p className="readiness-score__gap">
              {readiness.monthlyGapCents > 0
                ? `Save ${formatCurrency(readiness.monthlyGapCents)} more/month to reach 80% success`
                : 'You are on track for your retirement goals'}
            </p>
            <p aria-live="polite">
              Success probability: {Math.round(readiness.monteCarlo.successRate * 100)}% (
              {readiness.monteCarlo.iterations} simulations)
            </p>
          </div>
        </div>
      </div>

      {/* Key metrics */}
      <div className="planning-metrics" aria-label="Retirement metrics">
        <article className="planning-metric" aria-label="Projected savings at retirement">
          <p className="planning-metric__label">Projected at retirement</p>
          <p className="planning-metric__value">
            {formatCurrency(readiness.projectedSavingsCents)}
          </p>
        </article>
        <article className="planning-metric" aria-label="Target nest egg">
          <p className="planning-metric__label">Target nest egg</p>
          <p className="planning-metric__value">{formatCurrency(readiness.targetNestEggCents)}</p>
        </article>
        <article className="planning-metric" aria-label="Median outcome">
          <p className="planning-metric__label">Median outcome</p>
          <p className="planning-metric__value">
            {formatCurrency(readiness.monteCarlo.medianFinalCents)}
          </p>
        </article>
      </div>

      <HealthcareProjectionSection params={params} />

      <section className="planning-card rmd-tracker" aria-label="Required Minimum Distributions">
        <h3 className="planning-card__title">Required Minimum Distributions</h3>
        {rmdLoading ? (
          <div className="planning-page__loading" role="status">
            <LoadingSpinner />
          </div>
        ) : rmdError ? (
          <ErrorBanner message={rmdError} />
        ) : params.currentAge < RMD_START_AGE ? (
          <p className="rmd-tracker__empty">
            RMD tracking starts at age {RMD_START_AGE}. Increase your current age to model required
            withdrawals for Traditional IRA and 401(k) accounts.
          </p>
        ) : rmdStatuses.length === 0 ? (
          <p className="rmd-tracker__empty">
            No Traditional IRA, 401(k), or other tax-deferred investment accounts were detected.
          </p>
        ) : (
          <>
            {rmdReminders.length > 0 && (
              <div className="rmd-alert" role="alert">
                <AppIcon name="alert-triangle" /> {rmdReminders.length} RMD{' '}
                {rmdReminders.length === 1 ? 'reminder needs' : 'reminders need'} attention before
                the deadline.
              </div>
            )}
            <div className="rmd-list">
              {rmdStatuses.map((status) => (
                <RmdStatusCard key={status.accountId} status={status} />
              ))}
            </div>
            <p className="rmd-tracker__note">
              Prior-year-end balances are reconstructed from the current balance and current-year
              transactions. Withdrawals are estimated from current-year expense and transfer
              transactions in each tax-deferred account.
            </p>
          </>
        )}
      </section>

      <section
        className={`planning-card retirement-income-answer ${
          incomeProjection.lastsThroughHorizon
            ? 'retirement-income-answer--success'
            : 'retirement-income-answer--warning'
        }`}
        aria-label="Retirement income projection"
        aria-live="polite"
      >
        <h3 className="planning-card__title">Retirement Income Projection</h3>
        <p className="retirement-income-answer__text">{projectionAnswer}</p>
        {!incomeProjection.lastsThroughHorizon && incomeProjection.depletionAge !== null && (
          <p className="retirement-income-answer__depletion">
            Depletion point: age {incomeProjection.depletionAge}. Try retiring later or reducing
            monthly spending to extend your savings.
          </p>
        )}
        <TrendLineChart
          title="Retirement balance over time"
          data={retirementChartData}
          series={[{ dataKey: 'balance', name: 'Projected balance' }]}
          height={280}
        />
      </section>

      {/* Factors */}
      <section className="planning-card" aria-label="Readiness factors">
        <h3 className="planning-card__title">Key Factors</h3>
        <ul className="factor-list" role="list">
          {readiness.factors.map((f, i) => (
            <FactorItem key={i} factor={f} />
          ))}
        </ul>
      </section>

      {/* Sliders */}
      <section className="planning-card" aria-label="Retirement parameters">
        <h3 className="planning-card__title">Adjust Parameters</h3>
        <PlanningSlider
          id="current-age"
          label="Current Age"
          value={params.currentAge}
          min={18}
          max={80}
          step={1}
          displayValue={`${params.currentAge} years`}
          onChange={setCurrentAge}
        />
        <PlanningSlider
          id="retirement-age"
          label="Retirement Age"
          value={params.retirementAge}
          min={40}
          max={Math.max(80, params.currentAge)}
          step={1}
          displayValue={`${params.retirementAge} years`}
          onChange={setRetirementAge}
        />
        <PlanningSlider
          id="horizon-age"
          label="Planning Horizon"
          value={params.planningHorizonAge}
          min={Math.max(params.currentAge + 1, params.retirementAge + 1, 70)}
          max={100}
          step={1}
          displayValue={`${params.planningHorizonAge} years`}
          onChange={setPlanningHorizonAge}
        />
        <PlanningSlider
          id="monthly-contribution"
          label="Monthly Contribution"
          value={params.monthlyContributionCents}
          min={0}
          max={1000000}
          step={5000}
          displayValue={formatCurrency(params.monthlyContributionCents)}
          onChange={setMonthlyContribution}
        />
        <PlanningSlider
          id="desired-spending"
          label="Desired Monthly Spending (Retirement)"
          value={params.desiredMonthlySpendingCents}
          min={100000}
          max={2000000}
          step={10000}
          displayValue={formatCurrency(params.desiredMonthlySpendingCents)}
          onChange={setDesiredSpending}
        />
        <PlanningSlider
          id="retirement-income"
          label="Social Security / Pension Income"
          value={params.monthlyRetirementIncomeCents}
          min={0}
          max={1000000}
          step={5000}
          displayValue={formatCurrency(params.monthlyRetirementIncomeCents)}
          onChange={setRetirementIncome}
        />
        <PlanningSlider
          id="annual-return"
          label="Expected Annual Return"
          value={Math.round(params.annualReturnRate * 100)}
          min={0}
          max={15}
          step={1}
          displayValue={`${Math.round(params.annualReturnRate * 100)}%`}
          onChange={(v) => setAnnualReturn(v / 100)}
        />
        <PlanningSlider
          id="inflation-rate"
          label="Expected Inflation"
          value={Math.round(params.annualInflationRate * 100)}
          min={0}
          max={10}
          step={1}
          displayValue={`${Math.round(params.annualInflationRate * 100)}%`}
          onChange={(v) => setInflationRate(v / 100)}
        />
      </section>
    </div>
  );
};

/** Linked savings goals tab. */
const GoalsPanel: React.FC = () => {
  const { linkedGoals, loading, error } = useLinkedGoals();

  if (loading) {
    return (
      <div className="planning-page__loading" role="status">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} />;
  }

  if (linkedGoals.length === 0) {
    return (
      <div className="planning-empty">
        <div className="planning-empty__icon" aria-hidden="true">
          <AppIcon name="target" />
        </div>
        <p className="planning-empty__text">
          No savings goals yet. Create a goal from the Goals page to track progress here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="planning-metrics" aria-label="Goals summary">
        <article className="planning-metric" aria-label="Total saved">
          <p className="planning-metric__label">Total Saved</p>
          <p className="planning-metric__value">
            {formatCurrency(linkedGoals.reduce((s, g) => s + g.currentCents, 0))}
          </p>
        </article>
        <article className="planning-metric" aria-label="Total target">
          <p className="planning-metric__label">Total Target</p>
          <p className="planning-metric__value">
            {formatCurrency(linkedGoals.reduce((s, g) => s + g.targetCents, 0))}
          </p>
        </article>
        <article className="planning-metric" aria-label="Goals on track">
          <p className="planning-metric__label">On Track</p>
          <p className="planning-metric__value">
            {linkedGoals.filter((g) => g.monthlyPaceCents > 0).length} / {linkedGoals.length}
          </p>
        </article>
      </div>

      <section aria-label="Savings goals list">
        {linkedGoals.map((goal) => (
          <div key={goal.goalId} className="planning-card">
            <GoalProgressCard goal={goal} />
          </div>
        ))}
      </section>
    </div>
  );
};

/** Sweep automations tab. */
const SweepPanel: React.FC = () => {
  const { rules, evaluations, log, loading, deleteRule, toggleRule, simulate, clearLog } =
    useSweepRules();

  if (loading) {
    return (
      <div className="planning-page__loading" role="status">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <div className="planning-actions">
        <button
          className="planning-btn planning-btn--primary"
          onClick={simulate}
          disabled={rules.length === 0}
          aria-label="Simulate all sweep rules"
        >
          <AppIcon name="refresh" /> Simulate All Rules
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="planning-empty">
          <div className="planning-empty__icon" aria-hidden="true">
            <AppIcon name="lightning" />
          </div>
          <p className="planning-empty__text">
            No sweep rules configured. Rules automate savings transfers like round-ups,
            percent-of-income, and balance thresholds.
          </p>
        </div>
      ) : (
        <>
          {/* Rules list */}
          <section className="planning-section" aria-label="Sweep rules">
            <h3 className="planning-section__title">Active Rules</h3>
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`sweep-rule ${!rule.enabled ? 'sweep-rule--disabled' : ''}`}
              >
                <input
                  className="sweep-rule__toggle"
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={() => toggleRule(rule.id)}
                  aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}
                />
                <div className="sweep-rule__info">
                  <div className="sweep-rule__name">{rule.name}</div>
                  <div className="sweep-rule__type">{rule.type.replace(/-/g, ' ')}</div>
                </div>
                <div className="sweep-rule__actions">
                  <button
                    className="planning-btn planning-btn--small planning-btn--danger"
                    onClick={() => deleteRule(rule.id)}
                    aria-label={`Delete ${rule.name}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* Simulation results */}
          {evaluations.length > 0 && (
            <section className="planning-section" aria-label="Simulation results">
              <h3 className="planning-section__title">Simulation Results</h3>
              {evaluations.map((evalResult) => (
                <SweepEvalCard key={evalResult.ruleId} evaluation={evalResult} />
              ))}
              <p className="planning-metric__label" aria-live="polite">
                Total sweep:{' '}
                {formatCurrency(
                  evaluations.filter((e) => e.feasible).reduce((s, e) => s + e.amountCents, 0),
                )}
              </p>
            </section>
          )}

          {/* Execution log */}
          {log.length > 0 && (
            <section className="planning-section" aria-label="Sweep execution log">
              <div className="planning-card__header">
                <h3 className="planning-section__title">Execution Log</h3>
                <button
                  className="planning-btn planning-btn--small"
                  onClick={clearLog}
                  aria-label="Clear execution log"
                >
                  Clear
                </button>
              </div>
              <div className="sweep-log" role="log">
                {log
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <LogEntryRow key={entry.id} entry={entry} />
                  ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export const PlanningPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PlanningTab>('scenarios');

  return (
    <div className="planning-page">
      <h1 className="planning-page__title">Financial Planning</h1>
      <p className="planning-page__subtitle">
        Model scenarios, map life events, plan retirement, track goals, and automate savings.
      </p>

      {/* Tab navigation */}
      <div className="planning-tabs" role="tablist" aria-label="Planning tools">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.id}
            className={`planning-tab ${activeTab === tab.id ? 'planning-tab--active' : ''}`}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <AppIcon name={tab.icon} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === 'scenarios' && <ScenariosPanel />}
        {activeTab === 'life-events' && <LifeEventsPanel />}
        {activeTab === 'retirement' && <RetirementPanel />}
        {activeTab === 'goals' && <GoalsPanel />}
        {activeTab === 'sweep' && <SweepPanel />}
      </div>
    </div>
  );
};

export default PlanningPage;
