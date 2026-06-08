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

import React, { useCallback, useMemo, useState } from 'react';
import { ErrorBanner, LoadingSpinner } from '../components/common';
import { useScenarioModeler } from '../hooks/useScenarioModeler';
import { useRetirementPlanner } from '../hooks/useRetirementPlanner';
import { useLinkedGoals } from '../hooks/useLinkedGoals';
import { useSweepRules } from '../hooks/useSweepRules';
import { formatCurrency } from '../lib/currency';
import type {
  RetirementReadiness,
  RetirementFactor,
  ScenarioProjection,
  LinkedGoal,
  SweepEvaluation,
  SweepLogEntry,
} from '../lib/planning';
import './PlanningPage.css';
import { AppIcon, type IconName } from '../components/icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlanningTab = 'scenarios' | 'retirement' | 'goals' | 'sweep';

const TAB_CONFIG: { id: PlanningTab; label: string; icon: IconName }[] = [
  { id: 'scenarios', label: 'What-If Modeler', icon: 'sparkles' },
  { id: 'retirement', label: 'Retirement', icon: 'leaf' },
  { id: 'goals', label: 'Savings Goals', icon: 'target' },
  { id: 'sweep', label: 'Automations', icon: 'lightning' },
];

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

/** Retirement readiness tab. */
const RetirementPanel: React.FC = () => {
  const {
    params,
    readiness,
    setCurrentAge,
    setRetirementAge,
    setPlanningHorizonAge,
    setMonthlyContribution,
    setDesiredSpending,
    setAnnualReturn,
    setInflationRate,
  } = useRetirementPlanner();

  if (!readiness) {
    return (
      <div className="planning-page__loading" role="status">
        <LoadingSpinner />
      </div>
    );
  }

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
          min={Math.max(params.currentAge + 1, 40)}
          max={80}
          step={1}
          displayValue={`${params.retirementAge} years`}
          onChange={setRetirementAge}
        />
        <PlanningSlider
          id="horizon-age"
          label="Planning Horizon"
          value={params.planningHorizonAge}
          min={Math.max(params.retirementAge + 1, 70)}
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
        Model scenarios, plan retirement, track goals, and automate savings.
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
        {activeTab === 'retirement' && <RetirementPanel />}
        {activeTab === 'goals' && <GoalsPanel />}
        {activeTab === 'sweep' && <SweepPanel />}
      </div>
    </div>
  );
};

export default PlanningPage;
