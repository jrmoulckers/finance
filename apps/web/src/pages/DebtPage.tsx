// SPDX-License-Identifier: BUSL-1.1

/**
 * Debt management hub page.
 *
 * Provides tabbed navigation to all debt management features:
 * - Payoff Planner (avalanche/snowball strategies)
 * - BNPL Dashboard (aggregation and collision alerts)
 * - Student Loans (IDR/PSLF optimizer)
 * - Credit Cards (payment reservation)
 *
 * References: issues #1662, #1685, #1690, #1681, #1761, #1569
 */

import React, { useState, useCallback } from 'react';
import { CurrencyDisplay, EmptyState, ExplainThis } from '../components/common';
import './DebtPage.css';
import type {
  Debt,
  StrategyComparison,
  BnplObligation,
  StudentLoan,
  IdrInput,
  CreditCard,
} from '../lib/debt-types';
import { compareStrategies } from '../lib/debt-payoff-engine';
import {
  calculateBnplSummary,
  detectPaymentCollisions,
  calculateBnplRiskScore,
} from '../lib/debt-bnpl-engine';
import { compareRepaymentPlans } from '../lib/debt-student-loan-engine';
import { calculateReservationSummary } from '../lib/debt-credit-card-engine';

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type DebtTab = 'payoff' | 'bnpl' | 'student-loans' | 'credit-cards';

const TAB_LABELS: Record<DebtTab, string> = {
  payoff: 'Payoff Planner',
  bnpl: 'BNPL Dashboard',
  'student-loans': 'Student Loans',
  'credit-cards': 'Credit Cards',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Debt management page — the central hub for all debt tracking features.
 *
 * This is a client-side-only page that uses the calculation engines
 * from `lib/debt-*` for all financial math. Data is loaded via hooks
 * when integrated with the database layer.
 */
export function DebtPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<DebtTab>('payoff');

  return (
    <section className="debt-page" aria-label="Debt Management">
      <header className="debt-page__header">
        <h1>Debt Management</h1>
        <p className="debt-page__subtitle">Track, plan, and optimize your debt payoff strategy.</p>
      </header>

      {/* Tab navigation */}
      <nav className="debt-page__tabs" aria-label="Debt management sections">
        <ul role="tablist" className="debt-page__tab-list">
          {(Object.keys(TAB_LABELS) as DebtTab[]).map((tab) => (
            <li key={tab} role="presentation">
              <button
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`debt-panel-${tab}`}
                id={`debt-tab-${tab}`}
                className={`debt-page__tab ${activeTab === tab ? 'debt-page__tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Tab panels */}
      <div
        id={`debt-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`debt-tab-${activeTab}`}
        className="debt-page__panel"
      >
        {activeTab === 'payoff' && <PayoffPlannerPanel />}
        {activeTab === 'bnpl' && <BnplDashboardPanel />}
        {activeTab === 'student-loans' && <StudentLoanPanel />}
        {activeTab === 'credit-cards' && <CreditCardPanel />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Payoff Planner panel (#1662)
// ---------------------------------------------------------------------------

/**
 * Payoff planner with avalanche/snowball strategy comparison.
 *
 * Displays debt listing, strategy results side-by-side,
 * and a payoff timeline visualization.
 */
function PayoffPlannerPanel(): React.ReactElement {
  // TODO: Replace with useDebts() hook when database layer is ready
  const [debts] = useState<Debt[]>([]);
  const [extraPaymentCents, setExtraPaymentCents] = useState(0);
  const [comparison, setComparison] = useState<StrategyComparison | null>(null);

  const handleCalculate = useCallback(() => {
    if (debts.length === 0) return;
    const result = compareStrategies(debts, extraPaymentCents);
    setComparison(result);
  }, [debts, extraPaymentCents]);

  if (debts.length === 0) {
    return (
      <EmptyState
        title="No debts added"
        description="Add your debts to compare payoff strategies and see how extra payments can save you money."
        action={<button>Add Debt</button>}
      />
    );
  }

  return (
    <div className="payoff-planner">
      {/* Debt listing */}
      <section aria-label="Your debts">
        <h2>Your Debts</h2>
        <ul role="list" className="debt-list">
          {debts.map((debt) => (
            <li key={debt.id} role="listitem" className="debt-list__item">
              <div className="debt-list__name">{debt.name}</div>
              <div className="debt-list__details">
                <CurrencyDisplay amount={debt.balanceCents} context="balance" />
                <span
                  className="debt-list__rate"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-2)' }}
                >
                  {(debt.annualRateBps / 100).toFixed(2)}% APR
                  <ExplainThis tipKey="aprVsApy" buttonLabel="Explain APR versus APY" />
                </span>
                <CurrencyDisplay amount={debt.minimumPaymentCents} context="minimum payment" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Extra payment input */}
      <section aria-label="Extra payment simulator">
        <h2>Extra Monthly Payment</h2>
        <label htmlFor="extra-payment">Additional payment beyond minimums ($/month):</label>
        <input
          id="extra-payment"
          type="number"
          min="0"
          step="1"
          value={extraPaymentCents / 100}
          onChange={(e) =>
            setExtraPaymentCents(Math.round(parseFloat(e.target.value || '0') * 100))
          }
          aria-describedby="extra-payment-help"
        />
        <p id="extra-payment-help" className="form-help">
          This amount will be applied to the target debt each month.
        </p>
        <button onClick={handleCalculate}>Calculate Payoff</button>
      </section>

      {/* Strategy comparison */}
      {comparison && (
        <section aria-label="Strategy comparison">
          <h2>Strategy Comparison</h2>
          <div className="strategy-comparison">
            <StrategyCard
              title="Avalanche (Highest Rate First)"
              result={comparison.avalanche}
              recommended={comparison.interestSavingsCents > 0}
            />
            <StrategyCard
              title="Snowball (Smallest Balance First)"
              result={comparison.snowball}
              recommended={comparison.interestSavingsCents < 0}
            />
          </div>
          {comparison.interestSavingsCents > 0 && (
            <p className="strategy-savings" aria-live="polite">
              Avalanche saves{' '}
              <CurrencyDisplay
                amount={comparison.interestSavingsCents}
                context="interest savings"
              />{' '}
              in interest and {comparison.timeSavingsMonths} month(s) vs. snowball.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strategy card sub-component
// ---------------------------------------------------------------------------

interface StrategyCardProps {
  title: string;
  result: StrategyComparison['avalanche'];
  recommended: boolean;
}

function StrategyCard({ title, result, recommended }: StrategyCardProps): React.ReactElement {
  return (
    <article
      className={`strategy-card ${recommended ? 'strategy-card--recommended' : ''}`}
      aria-label={title}
    >
      <h3>
        {title}
        {recommended && (
          <span className="strategy-card__badge" aria-label="Recommended">
            ★ Recommended
          </span>
        )}
      </h3>
      <dl className="strategy-card__stats">
        <dt>Total Interest</dt>
        <dd>
          <CurrencyDisplay amount={result.totalInterestCents} context="total interest" />
        </dd>
        <dt>Total Paid</dt>
        <dd>
          <CurrencyDisplay amount={result.totalPaidCents} context="total paid" />
        </dd>
        <dt>Payoff Timeline</dt>
        <dd>
          {result.totalMonths} month{result.totalMonths !== 1 ? 's' : ''} (
          {(result.totalMonths / 12).toFixed(1)} years)
        </dd>
        <dt>Payoff Order</dt>
        <dd>
          <ol>
            {result.schedules.map((s) => (
              <li key={s.debtId}>
                {s.debtName} — {s.monthsToPayoff} months
              </li>
            ))}
          </ol>
        </dd>
      </dl>
    </article>
  );
}

// ---------------------------------------------------------------------------
// BNPL Dashboard panel (#1685, #1690)
// ---------------------------------------------------------------------------

/**
 * BNPL aggregation dashboard with collision alerts and risk scoring.
 */
function BnplDashboardPanel(): React.ReactElement {
  // TODO: Replace with useBnpl() hook when database layer is ready
  const [obligations] = useState<BnplObligation[]>([]);
  const monthlyIncomeCents = 500_000; // TODO: get from user profile

  if (obligations.length === 0) {
    return (
      <EmptyState
        title="No BNPL obligations"
        description="Track your Buy Now Pay Later purchases to see total exposure and detect payment conflicts."
        action={<button>Add BNPL Purchase</button>}
      />
    );
  }

  const summary = calculateBnplSummary(obligations);
  const alerts = detectPaymentCollisions(obligations);
  const riskScore = calculateBnplRiskScore(obligations, monthlyIncomeCents);

  return (
    <div className="bnpl-dashboard">
      {/* Risk score banner */}
      <section aria-label="BNPL risk assessment">
        <div
          className={`risk-badge risk-badge--${riskScore.category}`}
          role="status"
          aria-live="polite"
        >
          <span className="risk-badge__score">{riskScore.score}</span>
          <span className="risk-badge__label">
            BNPL Risk: {riskScore.category.charAt(0).toUpperCase() + riskScore.category.slice(1)}
          </span>
        </div>
        {riskScore.factors.length > 0 && (
          <ul className="risk-factors" role="list" aria-label="Risk factors">
            {riskScore.factors.map((f, i) => (
              <li key={i} role="listitem">
                {f}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Alerts */}
      {alerts.length > 0 && (
        <section aria-label="BNPL alerts">
          <h2>Alerts</h2>
          <ul role="list" className="bnpl-alerts">
            {alerts.map((alert, i) => (
              <li key={i} role="listitem" className={`bnpl-alert bnpl-alert--${alert.level}`}>
                <span role="alert">{alert.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Summary stats */}
      <section aria-label="BNPL summary">
        <h2>Overview</h2>
        <dl className="bnpl-summary">
          <dt>Active Obligations</dt>
          <dd>{summary.activeCount}</dd>
          <dt>Total Outstanding</dt>
          <dd>
            <CurrencyDisplay amount={summary.totalOutstandingCents} context="total outstanding" />
          </dd>
          <dt>Monthly Commitment</dt>
          <dd>
            <CurrencyDisplay amount={summary.monthlyCommitmentCents} context="monthly commitment" />
          </dd>
          <dt>Total Fees Paid</dt>
          <dd>
            <CurrencyDisplay amount={summary.totalFeesCents} context="total fees" />
          </dd>
          <dt>Extra Cost vs. Upfront</dt>
          <dd>
            <CurrencyDisplay amount={summary.costVsUpfrontCents} context="cost vs paying upfront" />
          </dd>
        </dl>
      </section>

      {/* Obligation list */}
      <section aria-label="BNPL obligations">
        <h2>Obligations</h2>
        <ul role="list" className="bnpl-list">
          {obligations.map((obl) => (
            <li key={obl.id} role="listitem" className="bnpl-list__item">
              <div className="bnpl-list__merchant">{obl.merchantName}</div>
              <div className="bnpl-list__details">
                <CurrencyDisplay
                  amount={obl.remainingBalanceCents}
                  context={`${obl.merchantName} remaining`}
                />
                <span>
                  {obl.paidInstallments}/{obl.totalInstallments} payments
                </span>
                {obl.upcomingDueDates[0] && <span>Next due: {obl.upcomingDueDates[0]}</span>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Student Loan panel (#1681, #1761)
// ---------------------------------------------------------------------------

/**
 * Student loan optimizer with IDR plan comparison and PSLF calculator.
 */
function StudentLoanPanel(): React.ReactElement {
  // TODO: Replace with useStudentLoans() hook when database layer is ready
  const [loans] = useState<StudentLoan[]>([]);

  if (loans.length === 0) {
    return (
      <EmptyState
        title="No student loans"
        description="Add your student loans to compare repayment plans, track PSLF progress, and estimate forgiveness."
        action={<button>Add Student Loan</button>}
      />
    );
  }

  // TODO: Get from user profile/settings
  const idrInput: IdrInput = {
    annualIncomeCents: 5_000_000,
    familySize: 1,
    state: 'CA',
    filingStatus: 'single',
  };

  const today = new Date().toISOString().slice(0, 10);
  const comparison = compareRepaymentPlans(loans, idrInput, today);

  return (
    <div className="student-loan-optimizer">
      {/* Recommendation banner */}
      <section aria-label="Recommended repayment plan">
        <div className="recommendation-banner" role="status" aria-live="polite">
          <h2>Recommended Plan: {comparison.recommendedPlan}</h2>
          {comparison.savingsVsStandardCents > 0 && (
            <p>
              Save{' '}
              <CurrencyDisplay
                amount={comparison.savingsVsStandardCents}
                context="savings vs standard"
              />{' '}
              compared to standard repayment.
            </p>
          )}
        </div>
      </section>

      {/* Plan comparison table */}
      <section aria-label="Repayment plan comparison">
        <h2>Plan Comparison</h2>
        <div className="plan-comparison" role="table" aria-label="Repayment plan details">
          <div role="rowgroup">
            <div role="row" className="plan-comparison__header">
              <span role="columnheader">Plan</span>
              <span role="columnheader">Monthly Payment</span>
              <span role="columnheader">Total Paid</span>
              <span role="columnheader">Total Interest</span>
              <span role="columnheader">Forgiven</span>
              <span role="columnheader">Tax on Forgiveness</span>
            </div>
          </div>
          <div role="rowgroup">
            {/* Standard */}
            <div role="row" className="plan-comparison__row">
              <span role="cell">Standard (10-year)</span>
              <span role="cell">
                <CurrencyDisplay amount={comparison.standard.monthlyPaymentCents} />
              </span>
              <span role="cell">
                <CurrencyDisplay amount={comparison.standard.totalPaidCents} />
              </span>
              <span role="cell">
                <CurrencyDisplay amount={comparison.standard.totalInterestCents} />
              </span>
              <span role="cell">
                <CurrencyDisplay amount={comparison.standard.forgivenAmountCents} />
              </span>
              <span role="cell">
                <CurrencyDisplay amount={comparison.standard.estimatedTaxOnForgivenessCents} />
              </span>
            </div>
            {/* IDR plans */}
            {comparison.idrPlans.map((plan) => (
              <div
                key={plan.planType}
                role="row"
                className={`plan-comparison__row ${
                  plan.planType === comparison.recommendedPlan
                    ? 'plan-comparison__row--recommended'
                    : ''
                }`}
              >
                <span role="cell">
                  {plan.planType}
                  {plan.planType === comparison.recommendedPlan && ' ★'}
                </span>
                <span role="cell">
                  <CurrencyDisplay amount={plan.monthlyPaymentCents} />
                </span>
                <span role="cell">
                  <CurrencyDisplay amount={plan.totalPaidCents} />
                </span>
                <span role="cell">
                  <CurrencyDisplay amount={plan.totalInterestCents} />
                </span>
                <span role="cell">
                  <CurrencyDisplay amount={plan.forgivenAmountCents} />
                </span>
                <span role="cell">
                  <CurrencyDisplay amount={plan.estimatedTaxOnForgivenessCents} />
                  {plan.isForgivenessTaxable && <span className="tax-warning"> (taxable)</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PSLF tracker */}
      {comparison.pslf && (
        <section aria-label="PSLF progress">
          <h2>Public Service Loan Forgiveness</h2>
          <div className="pslf-tracker">
            <div
              className="pslf-progress"
              role="progressbar"
              aria-valuenow={comparison.pslf.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`PSLF progress: ${comparison.pslf.progressPercent}%`}
            >
              <div
                className="pslf-progress__bar"
                style={{ width: `${comparison.pslf.progressPercent}%` }}
              />
            </div>
            <dl className="pslf-details">
              <dt>Qualifying Payments</dt>
              <dd>
                {comparison.pslf.qualifyingPayments} / {120}
              </dd>
              <dt>Payments Remaining</dt>
              <dd>{comparison.pslf.paymentsRemaining}</dd>
              <dt>Estimated Forgiveness Date</dt>
              <dd>{comparison.pslf.estimatedForgivenessDate}</dd>
              <dt>Projected Forgiven Amount</dt>
              <dd>
                <CurrencyDisplay
                  amount={comparison.pslf.projectedForgivenAmountCents}
                  context="projected forgiveness"
                />
              </dd>
              <dt>Tax Treatment</dt>
              <dd>{comparison.pslf.isTaxFree ? 'Tax-free ✓' : 'Taxable'}</dd>
            </dl>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Credit Card panel (#1569)
// ---------------------------------------------------------------------------

/**
 * Credit card payment reservation dashboard.
 */
function CreditCardPanel(): React.ReactElement {
  // TODO: Replace with useCreditCards() hook when database layer is ready
  const [cards] = useState<CreditCard[]>([]);
  const checkingBalanceCents = 0; // TODO: get from accounts hook

  if (cards.length === 0) {
    return (
      <EmptyState
        title="No credit cards"
        description="Add your credit cards to track balances, reserve funds for payments, and get due date reminders."
        action={<button>Add Credit Card</button>}
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const summary = calculateReservationSummary(checkingBalanceCents, cards, today);

  return (
    <div className="credit-card-dashboard">
      {/* Available balance */}
      <section aria-label="Balance after reservations">
        <h2>Available Balance</h2>
        <dl className="balance-summary">
          <dt>Checking Balance</dt>
          <dd>
            <CurrencyDisplay amount={summary.checkingBalanceCents} context="checking balance" />
          </dd>
          <dt>Reserved for Payments</dt>
          <dd>
            <CurrencyDisplay
              amount={summary.totalReservedCents}
              context="total reserved"
              colorize
            />
          </dd>
          <dt>Available After Reservations</dt>
          <dd>
            <CurrencyDisplay
              amount={summary.availableAfterReservationsCents}
              context="available after reservations"
              colorize
            />
          </dd>
        </dl>
      </section>

      {/* Payment alerts */}
      {summary.alerts.length > 0 && (
        <section aria-label="Payment alerts">
          <h2>Payment Reminders</h2>
          <ul role="list" className="payment-alerts">
            {summary.alerts.map((alert, i) => (
              <li key={i} role="listitem" className={`payment-alert payment-alert--${alert.type}`}>
                <span role="alert">{alert.message}</span>
                <CurrencyDisplay amount={alert.amountDueCents} context="amount due" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Reservations list */}
      <section aria-label="Payment reservations">
        <h2>Payment Reservations</h2>
        <ul role="list" className="reservation-list">
          {summary.reservations.map((res) => (
            <li key={res.cardId} role="listitem" className="reservation-list__item">
              <div className="reservation-list__card">{res.cardName}</div>
              <div className="reservation-list__details">
                <CurrencyDisplay
                  amount={res.reservedAmountCents}
                  context={`${res.cardName} reserved`}
                />
                <span>Due: {res.dueDate}</span>
                <span className="reservation-list__type">
                  {res.isAutoCalculated ? 'Auto (full balance)' : 'Manual'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default DebtPage;
