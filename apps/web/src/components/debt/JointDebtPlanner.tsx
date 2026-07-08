// SPDX-License-Identifier: BUSL-1.1

/**
 * JointDebtPlanner — a joint debt payoff planner for engaged/married couples
 * (#2153).
 *
 * Surfaces the partner-ownership dimension that the solo payoff planner lacks:
 *  - mark each debt as personal / shared / jointly-funded and assign a partner;
 *  - compare avalanche vs. snowball across BOTH partners' debts;
 *  - see how an extra debt payment delays other couple goals (wedding fund,
 *    home down payment, ...);
 *  - flip on a simpler "recommendation mode" decision aid.
 *
 * All financial maths lives in the pure engines (`shared-payoff-rules.ts` for
 * payoff and `joint-debt-planner.ts` for the couple/ownership layer). This
 * component is presentational and accessible; debts arrive via props (never a
 * direct repository import).
 *
 * Accessibility:
 *  - comparison/impact tables use <caption> and scoped <th> headers;
 *  - ownership state is conveyed with text + icon, never colour alone;
 *  - the recommendation announces via an aria-live region;
 *  - every control is labelled and keyboard reachable;
 *  - motion is disabled under prefers-reduced-motion (see CSS).
 */

import React, { useCallback, useId, useMemo, useState } from 'react';
import { EmptyState } from '../common';
import { Checkbox } from '../common/Checkbox';
import type { Debt } from '../../lib/debt-types';
import { formatUsdCents } from '../../lib/debt/payoff';
import {
  compareJointStrategies,
  ownershipLabel,
  projectGoalImpacts,
  recommendForCouple,
  selectStrategyResult,
  summarizeOwnership,
  type CoupleGoal,
  type CoupleStrategy,
  type DebtOwnership,
  type JointDebtInput,
  type PartnerId,
} from '../../lib/debt/joint-debt-planner';
import { dollarsToCents } from '../../lib/currency';
import './JointDebtPlanner.css';

export interface JointDebtPlannerProps {
  /** Both partners' debts to plan across. */
  readonly debts: readonly Debt[];
  /** Anchor date (YYYY-MM-DD) for projections. Defaults to today. */
  readonly todayIso?: string;
}

interface OwnershipAssignment {
  readonly owner: PartnerId;
  readonly ownership: DebtOwnership;
}

interface GoalFormState {
  readonly id: string;
  readonly name: string;
  readonly target: string;
  readonly saved: string;
  readonly monthly: string;
}

const OWNERSHIP_OPTIONS: readonly DebtOwnership[] = ['personal', 'shared', 'jointly-funded'];

/** Text + icon, never colour alone (WCAG 1.4.1). */
const OWNERSHIP_ICONS: Record<DebtOwnership, string> = {
  personal: '●',
  shared: '◑',
  'jointly-funded': '◇',
};

const DEFAULT_GOALS: readonly GoalFormState[] = [
  { id: 'wedding', name: 'Wedding fund', target: '20000', saved: '2000', monthly: '300' },
  { id: 'home', name: 'Home down payment', target: '40000', saved: '5000', monthly: '400' },
];

function parseCurrencyToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? dollarsToCents(parsed) : 0;
}

function parseExtraCents(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? dollarsToCents(parsed) : 0;
}

function formatMonths(months: number): string {
  if (months > 600) return 'beyond 50 years';
  if (months <= 0) return 'now';
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years === 1 ? '' : 's'}`);
  if (remaining > 0) parts.push(`${remaining} mo${remaining === 1 ? '' : 's'}`);
  return parts.join(' ') || '0 mos';
}

function createGoalId(): string {
  return `goal-${Math.random().toString(36).slice(2, 10)}`;
}

export function JointDebtPlanner({ debts, todayIso }: JointDebtPlannerProps): React.ReactElement {
  const baseId = useId();
  const [partnerAName, setPartnerAName] = useState('Partner A');
  const [partnerBName, setPartnerBName] = useState('Partner B');
  const [assignments, setAssignments] = useState<Record<string, OwnershipAssignment>>({});
  const [extraPayment, setExtraPayment] = useState('150');
  const [activeStrategy, setActiveStrategy] = useState<CoupleStrategy>('avalanche');
  const [simpleMode, setSimpleMode] = useState(false);
  const [goals, setGoals] = useState<readonly GoalFormState[]>(DEFAULT_GOALS);

  const planDebts = useMemo(() => debts.filter((debt) => debt.balanceCents > 0), [debts]);

  const assignmentFor = useCallback(
    (debt: Debt): OwnershipAssignment =>
      assignments[debt.id] ?? { owner: 'partner-a', ownership: 'shared' },
    [assignments],
  );

  const jointDebts = useMemo<JointDebtInput[]>(
    () =>
      planDebts.map((debt) => {
        const assignment = assignmentFor(debt);
        return {
          id: debt.id,
          name: debt.name,
          balanceCents: debt.balanceCents,
          annualRateBps: debt.annualRateBps,
          minimumPaymentCents: debt.minimumPaymentCents,
          owner: assignment.owner,
          ownership: assignment.ownership,
        };
      }),
    [planDebts, assignmentFor],
  );

  const extraCents = parseExtraCents(extraPayment);

  const ownershipSummary = useMemo(() => summarizeOwnership(jointDebts), [jointDebts]);
  const comparison = useMemo(
    () => (jointDebts.length > 0 ? compareJointStrategies(jointDebts, extraCents) : null),
    [jointDebts, extraCents],
  );

  const coupleGoals = useMemo<CoupleGoal[]>(
    () =>
      goals.map((goal) => ({
        id: goal.id,
        name: goal.name.trim() || 'Goal',
        targetCents: parseCurrencyToCents(goal.target),
        savedCents: parseCurrencyToCents(goal.saved),
        monthlyContributionCents: parseCurrencyToCents(goal.monthly),
      })),
    [goals],
  );

  const activeResult = comparison ? selectStrategyResult(comparison, activeStrategy) : null;
  const goalImpacts = useMemo(
    () => (activeResult ? projectGoalImpacts(activeResult, coupleGoals, extraCents) : []),
    [activeResult, coupleGoals, extraCents],
  );

  const recommendation = useMemo(
    () => (comparison ? recommendForCouple(comparison, goalImpacts) : null),
    [comparison, goalImpacts],
  );

  const handleAssignmentChange = useCallback((debt: Debt, patch: Partial<OwnershipAssignment>) => {
    setAssignments((current) => {
      const existing = current[debt.id] ?? { owner: 'partner-a', ownership: 'shared' };
      return { ...current, [debt.id]: { ...existing, ...patch } };
    });
  }, []);

  const handleGoalChange = useCallback(
    (id: string, field: keyof Omit<GoalFormState, 'id'>, value: string) => {
      setGoals((current) =>
        current.map((goal) => (goal.id === id ? { ...goal, [field]: value } : goal)),
      );
    },
    [],
  );

  const handleAddGoal = useCallback(() => {
    setGoals((current) => [
      ...current,
      { id: createGoalId(), name: 'New goal', target: '10000', saved: '0', monthly: '200' },
    ]);
  }, []);

  const handleRemoveGoal = useCallback((id: string) => {
    setGoals((current) => current.filter((goal) => goal.id !== id));
  }, []);

  const titleId = `${baseId}-title`;
  const extraId = `${baseId}-extra`;
  const recId = `${baseId}-recommendation`;

  if (planDebts.length === 0) {
    return (
      <EmptyState
        title="No debts to plan together"
        description="Add both partners' debts or connect debt accounts to compare avalanche vs. snowball across your household and see how extra payments affect your shared goals."
      />
    );
  }

  return (
    <section className="joint-debt" aria-labelledby={titleId}>
      <header className="joint-debt__header">
        <h2 id={titleId}>Joint Debt Payoff</h2>
        <p className="joint-debt__subtitle">
          Plan payoff across both partners&rsquo; debts, label who owns what, and see how extra
          payments trade off against your shared goals.
        </p>
      </header>

      <fieldset className="joint-debt__partners">
        <legend>Partner names</legend>
        <div className="joint-debt__field">
          <label htmlFor={`${baseId}-partner-a`}>Partner A name</label>
          <input
            id={`${baseId}-partner-a`}
            type="text"
            value={partnerAName}
            onChange={(event) => setPartnerAName(event.target.value)}
          />
        </div>
        <div className="joint-debt__field">
          <label htmlFor={`${baseId}-partner-b`}>Partner B name</label>
          <input
            id={`${baseId}-partner-b`}
            type="text"
            value={partnerBName}
            onChange={(event) => setPartnerBName(event.target.value)}
          />
        </div>
      </fieldset>

      <div className="joint-debt__controls">
        <div className="joint-debt__field">
          <label htmlFor={extraId}>Extra payment each month ($)</label>
          <input
            id={extraId}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={extraPayment}
            onChange={(event) => setExtraPayment(event.target.value)}
          />
        </div>
        <div className="joint-debt__field joint-debt__mode">
          <Checkbox
            id={`${baseId}-mode`}
            label="Recommendation mode (just tell us what to do)"
            checked={simpleMode}
            onChange={(event) => setSimpleMode(event.target.checked)}
          />
        </div>
      </div>

      {recommendation && (
        <section
          className={`joint-debt__recommendation joint-debt__recommendation--${recommendation.focus}`}
          aria-labelledby={`${recId}-title`}
        >
          <h3 id={`${recId}-title`}>Our recommendation for you</h3>
          <div id={recId} role="status" aria-live="polite" className="joint-debt__rec-body">
            <p className="joint-debt__rec-headline">{recommendation.headline}</p>
            <ul className="joint-debt__rec-list">
              {recommendation.rationale.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {!simpleMode && (
        <>
          <section className="joint-debt__section" aria-labelledby={`${baseId}-ownership-title`}>
            <h3 id={`${baseId}-ownership-title`}>Whose debt is whose?</h3>
            <table className="joint-debt__table">
              <caption className="joint-debt__caption">
                Assign each debt to a partner and mark how the couple treats it.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Debt</th>
                  <th scope="col">Balance</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Treatment</th>
                </tr>
              </thead>
              <tbody>
                {planDebts.map((debt) => {
                  const assignment = assignmentFor(debt);
                  return (
                    <tr key={debt.id}>
                      <th scope="row">{debt.name}</th>
                      <td>{formatUsdCents(debt.balanceCents)}</td>
                      <td>
                        <label
                          className="joint-debt__visually-hidden"
                          htmlFor={`${baseId}-owner-${debt.id}`}
                        >
                          Owner of {debt.name}
                        </label>
                        <select
                          id={`${baseId}-owner-${debt.id}`}
                          value={assignment.owner}
                          onChange={(event) =>
                            handleAssignmentChange(debt, {
                              owner: event.target.value as PartnerId,
                            })
                          }
                        >
                          <option value="partner-a">{partnerAName}</option>
                          <option value="partner-b">{partnerBName}</option>
                        </select>
                      </td>
                      <td>
                        <label
                          className="joint-debt__visually-hidden"
                          htmlFor={`${baseId}-ownership-${debt.id}`}
                        >
                          Treatment of {debt.name}
                        </label>
                        <span className="joint-debt__ownership">
                          <span aria-hidden="true" className="joint-debt__ownership-icon">
                            {OWNERSHIP_ICONS[assignment.ownership]}
                          </span>
                          <select
                            id={`${baseId}-ownership-${debt.id}`}
                            value={assignment.ownership}
                            onChange={(event) =>
                              handleAssignmentChange(debt, {
                                ownership: event.target.value as DebtOwnership,
                              })
                            }
                          >
                            {OWNERSHIP_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {ownershipLabel(option)}
                              </option>
                            ))}
                          </select>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <dl className="joint-debt__summary">
              <div>
                <dt>
                  <span aria-hidden="true">{OWNERSHIP_ICONS.personal}</span> Personal
                </dt>
                <dd>{formatUsdCents(ownershipSummary.personalBalanceCents)}</dd>
              </div>
              <div>
                <dt>
                  <span aria-hidden="true">{OWNERSHIP_ICONS.shared}</span> Shared
                </dt>
                <dd>{formatUsdCents(ownershipSummary.sharedBalanceCents)}</dd>
              </div>
              <div>
                <dt>
                  <span aria-hidden="true">{OWNERSHIP_ICONS['jointly-funded']}</span> Jointly funded
                </dt>
                <dd>{formatUsdCents(ownershipSummary.jointlyFundedBalanceCents)}</dd>
              </div>
              <div>
                <dt>{partnerAName} total</dt>
                <dd>{formatUsdCents(ownershipSummary.partnerABalanceCents)}</dd>
              </div>
              <div>
                <dt>{partnerBName} total</dt>
                <dd>{formatUsdCents(ownershipSummary.partnerBBalanceCents)}</dd>
              </div>
            </dl>
          </section>

          {comparison && (
            <section className="joint-debt__section" aria-labelledby={`${baseId}-compare-title`}>
              <h3 id={`${baseId}-compare-title`}>Avalanche vs. snowball: your combined debts</h3>
              <table className="joint-debt__table">
                <caption className="joint-debt__caption">
                  Both strategies paid with an extra {formatUsdCents(extraCents)} per month across
                  both partners&rsquo; debts.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    <th scope="col">
                      Avalanche
                      {comparison.recommendedStrategy === 'avalanche' ? (
                        <span className="joint-debt__badge"> (recommended)</span>
                      ) : null}
                    </th>
                    <th scope="col">
                      Snowball
                      {comparison.recommendedStrategy === 'snowball' ? (
                        <span className="joint-debt__badge"> (recommended)</span>
                      ) : null}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Time to debt-free</th>
                    <td>{formatMonths(comparison.avalanche.monthsToPayoff)}</td>
                    <td>{formatMonths(comparison.snowball.monthsToPayoff)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Total interest paid</th>
                    <td>{formatUsdCents(comparison.avalanche.totalInterestCents)}</td>
                    <td>{formatUsdCents(comparison.snowball.totalInterestCents)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Cash flow freed at payoff</th>
                    <td>{formatUsdCents(comparison.avalanche.goalCashFlowFreedCents)}</td>
                    <td>{formatUsdCents(comparison.snowball.goalCashFlowFreedCents)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="joint-debt__hint">
                Avalanche saves about {formatUsdCents(comparison.interestDifferenceCents)} in
                interest versus snowball.
              </p>

              <fieldset className="joint-debt__strategy">
                <legend>Plan goal impact using</legend>
                <label>
                  <input
                    type="radio"
                    name={`${baseId}-strategy`}
                    value="avalanche"
                    checked={activeStrategy === 'avalanche'}
                    onChange={() => setActiveStrategy('avalanche')}
                  />
                  Avalanche
                </label>
                <label>
                  <input
                    type="radio"
                    name={`${baseId}-strategy`}
                    value="snowball"
                    checked={activeStrategy === 'snowball'}
                    onChange={() => setActiveStrategy('snowball')}
                  />
                  Snowball
                </label>
              </fieldset>
            </section>
          )}

          <section className="joint-debt__section" aria-labelledby={`${baseId}-goals-title`}>
            <h3 id={`${baseId}-goals-title`}>How extra payments affect your other goals</h3>
            <p className="joint-debt__hint">
              Compare funding each goal when the extra payment goes to debt first versus straight to
              the goal.
            </p>

            <table className="joint-debt__table">
              <caption className="joint-debt__caption">
                Months to fund each goal, by where the extra payment goes.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Goal</th>
                  <th scope="col">Remaining</th>
                  <th scope="col">Extra to debt first</th>
                  <th scope="col">Extra to goal first</th>
                  <th scope="col">Debt-first delay</th>
                </tr>
              </thead>
              <tbody>
                {goalImpacts.map((impact) => (
                  <tr key={impact.goalId}>
                    <th scope="row">{impact.name}</th>
                    <td>{formatUsdCents(impact.remainingCents)}</td>
                    <td>
                      {impact.reachable ? formatMonths(impact.monthsWithDebtFocus) : 'over 50 yrs'}
                    </td>
                    <td>
                      {impact.reachable ? formatMonths(impact.monthsWithGoalFocus) : 'over 50 yrs'}
                    </td>
                    <td>
                      {impact.monthsDelta > 0
                        ? `+${impact.monthsDelta} mo${impact.monthsDelta === 1 ? '' : 's'}`
                        : 'no delay'}
                    </td>
                  </tr>
                ))}
                {goalImpacts.length === 0 && (
                  <tr>
                    <td colSpan={5}>Add a goal below to see the trade-off.</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="joint-debt__goals-editor">
              <h4>Edit your goals</h4>
              <ul className="joint-debt__goal-list">
                {goals.map((goal) => (
                  <li key={goal.id} className="joint-debt__goal">
                    <div className="joint-debt__field">
                      <label htmlFor={`${baseId}-goal-name-${goal.id}`}>Goal name</label>
                      <input
                        id={`${baseId}-goal-name-${goal.id}`}
                        type="text"
                        value={goal.name}
                        onChange={(event) => handleGoalChange(goal.id, 'name', event.target.value)}
                      />
                    </div>
                    <div className="joint-debt__field">
                      <label htmlFor={`${baseId}-goal-target-${goal.id}`}>Target ($)</label>
                      <input
                        id={`${baseId}-goal-target-${goal.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={goal.target}
                        onChange={(event) =>
                          handleGoalChange(goal.id, 'target', event.target.value)
                        }
                      />
                    </div>
                    <div className="joint-debt__field">
                      <label htmlFor={`${baseId}-goal-saved-${goal.id}`}>Saved so far ($)</label>
                      <input
                        id={`${baseId}-goal-saved-${goal.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={goal.saved}
                        onChange={(event) => handleGoalChange(goal.id, 'saved', event.target.value)}
                      />
                    </div>
                    <div className="joint-debt__field">
                      <label htmlFor={`${baseId}-goal-monthly-${goal.id}`}>Monthly ($)</label>
                      <input
                        id={`${baseId}-goal-monthly-${goal.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={goal.monthly}
                        onChange={(event) =>
                          handleGoalChange(goal.id, 'monthly', event.target.value)
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="joint-debt__remove"
                      onClick={() => handleRemoveGoal(goal.id)}
                    >
                      Remove
                      <span className="joint-debt__visually-hidden"> {goal.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="joint-debt__add" onClick={handleAddGoal}>
                Add goal
              </button>
            </div>
          </section>
        </>
      )}

      <p className="joint-debt__footnote">
        Projections anchor on {todayIso ?? 'today'} and assume steady payments. Goal savings grow
        linearly; debt payoff and interest come from the shared payoff engine.
      </p>
    </section>
  );
}
