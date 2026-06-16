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

import React, { useState, useCallback, useMemo } from 'react';
import { CurrencyDisplay, EmptyState } from '../components/common';
import { useAccounts } from '../hooks/useAccounts';
import './DebtPage.css';
import type {
  Debt,
  PayoffStrategy,
  StrategyComparison,
  BnplObligation,
  StudentLoan,
  StudentLoanScenarioConfig,
  StudentLoanStatus,
  CreditCard,
  IdrPlanType,
} from '../lib/debt-types';
import {
  calculateDebtMilestoneSummary,
  calculateDebtToIncomeTrend,
  calculateInterestSavedCents,
  calculateStrategyResult,
  compareStrategies,
} from '../lib/debt-payoff-engine';
import {
  calculateBnplSummary,
  detectPaymentCollisions,
  calculateBnplRiskScore,
} from '../lib/debt-bnpl-engine';
import {
  calculateStudentLoanDashboardSummary,
  calculateStudentLoanScenarioComparisons,
  calculateStudentLoanWhatIfScenario,
} from '../lib/debt-student-loan-engine';
import { calculateReservationSummary } from '../lib/debt-credit-card-engine';
import type { Account } from '../kmp/bridge';

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

type DebtFormState = {
  name: string;
  balance: string;
  originalBalance: string;
  rate: string;
  minimumPayment: string;
  type: Debt['type'];
};

type StudentLoanFormState = {
  name: string;
  servicer: string;
  balance: string;
  originalBalance: string;
  rate: string;
  minimumPayment: string;
  status: StudentLoanStatus;
  isFederal: boolean;
  isPslfEligible: boolean;
  pslfPaymentsMade: string;
};

type StudentLoanScenarioFormState = {
  annualIncome: string;
  familySize: string;
  filingStatus: 'single' | 'married_filing_jointly' | 'married_filing_separately';
  idrPlan: IdrPlanType;
  pslfPaymentsMade: string;
  refinanceRate: string;
  refinanceTermMonths: string;
  salaryRaise: string;
  salaryRaisePlan: IdrPlanType;
};

const DEFAULT_DEBT_FORM: DebtFormState = {
  name: '',
  balance: '',
  originalBalance: '',
  rate: '',
  minimumPayment: '',
  type: 'credit_card',
};

const DEFAULT_STUDENT_LOAN_FORM: StudentLoanFormState = {
  name: '',
  servicer: '',
  balance: '',
  originalBalance: '',
  rate: '',
  minimumPayment: '',
  status: 'in_repayment',
  isFederal: true,
  isPslfEligible: false,
  pslfPaymentsMade: '0',
};

const DEFAULT_STUDENT_SCENARIOS: StudentLoanScenarioFormState = {
  annualIncome: '50000',
  familySize: '1',
  filingStatus: 'single',
  idrPlan: 'PAYE',
  pslfPaymentsMade: '0',
  refinanceRate: '4.5',
  refinanceTermMonths: '120',
  salaryRaise: '5000',
  salaryRaisePlan: 'PAYE',
};

const STUDENT_LOAN_STATUS_LABELS: Record<StudentLoanStatus, string> = {
  in_repayment: 'In Repayment',
  in_grace: 'In Grace',
  deferred: 'Deferred',
  forbearance: 'Forbearance',
};

const IDR_PLAN_LABELS: Record<IdrPlanType, string> = {
  IBR: 'IBR',
  PAYE: 'PAYE',
  REPAYE: 'REPAYE',
  ICR: 'ICR',
};

function parseCurrencyInput(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
}

function parseRateInput(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
}

function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}

function bpsToInputValue(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.00$/, '');
}

function formatRateBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function formatMonthYear(dateIso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateIso}T00:00:00.000Z`));
}

function addMonthsToIsoDate(todayIso: string, months: number): string {
  const [year, month, day] = todayIso.split('-').map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), day));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function formatCountdown(months: number): string {
  if (months <= 0) return 'Debt-free today';
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (remainingMonths > 0)
    parts.push(`${remainingMonths} month${remainingMonths === 1 ? '' : 's'}`);
  return `${parts.join(', ')} to debt-free`;
}

function buildStudentLoanFormState(loan: StudentLoan): StudentLoanFormState {
  return {
    name: loan.name,
    servicer: loan.servicer,
    balance: centsToInputValue(loan.balanceCents),
    originalBalance: centsToInputValue(loan.originalBalanceCents),
    rate: bpsToInputValue(loan.annualRateBps),
    minimumPayment: centsToInputValue(loan.minimumPaymentCents),
    status: loan.status,
    isFederal: loan.isFederal,
    isPslfEligible: loan.isPslfEligible,
    pslfPaymentsMade: String(loan.pslfPaymentsMade),
  };
}

function createDebtId(): string {
  return `manual-debt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createStudentLoanId(): string {
  return `student-loan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isDebtAccount(account: Account): boolean {
  const name = account.name.toLowerCase();
  return (
    account.type === 'CREDIT_CARD' ||
    account.type === 'LOAN' ||
    /\b(debt|loan|mortgage|card|heloc)\b/.test(name)
  );
}

function debtTypeFromAccount(account: Account): Debt['type'] {
  const name = account.name.toLowerCase();
  if (account.type === 'CREDIT_CARD' || name.includes('card')) return 'credit_card';
  if (name.includes('student')) return 'student_loan';
  if (name.includes('auto') || name.includes('car')) return 'auto_loan';
  if (name.includes('mortgage')) return 'mortgage';
  return account.type === 'LOAN' ? 'personal_loan' : 'other';
}

function defaultDebtRateBps(type: Debt['type']): number {
  if (type === 'credit_card') return 1999;
  if (type === 'mortgage') return 700;
  if (type === 'student_loan') return 550;
  if (type === 'auto_loan') return 650;
  return 900;
}

function defaultMinimumPaymentCents(balanceCents: number, type: Debt['type']): number {
  if (balanceCents <= 0) return 0;
  const percent = type === 'credit_card' ? 0.03 : 0.015;
  return Math.max(2_500, Math.round(balanceCents * percent));
}

function accountToDebt(account: Account): Debt | null {
  const balanceCents = Math.abs(account.currentBalance.amount);
  if (balanceCents <= 0 || !isDebtAccount(account)) return null;
  const type = debtTypeFromAccount(account);
  return {
    id: `account-${account.id}`,
    name: account.name,
    balanceCents,
    originalBalanceCents: balanceCents,
    annualRateBps: defaultDebtRateBps(type),
    minimumPaymentCents: defaultMinimumPaymentCents(balanceCents, type),
    type,
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Debt management page — the central hub for all debt tracking features.
 */
export function DebtPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<DebtTab>('payoff');

  return (
    <section className="debt-page" aria-label="Debt Management">
      <header className="debt-page__header">
        <h1>Debt Management</h1>
        <p className="debt-page__subtitle">Track, plan, and optimize your debt payoff strategy.</p>
      </header>

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
// Payoff Planner panel (#1662, #2154, #2157, #2165)
// ---------------------------------------------------------------------------

function PayoffPlannerPanel(): React.ReactElement {
  const { accounts, loading, error } = useAccounts();
  const [manualDebts, setManualDebts] = useState<Debt[]>([]);
  const [debtAdjustments, setDebtAdjustments] = useState<Record<string, Partial<Debt>>>({});
  const [manualForm, setManualForm] = useState<DebtFormState>(DEFAULT_DEBT_FORM);
  const [extraPayment, setExtraPayment] = useState('100');
  const [activeStrategy, setActiveStrategy] = useState<PayoffStrategy>('avalanche');
  const [monthlyIncome, setMonthlyIncome] = useState('5000');
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const importedDebts = useMemo(
    () => accounts.map(accountToDebt).filter((debt): debt is Debt => debt !== null),
    [accounts],
  );

  const confirmedImportedDebts = useMemo(
    () =>
      importedDebts.map((debt) => ({
        ...debt,
        ...debtAdjustments[debt.id],
      })),
    [debtAdjustments, importedDebts],
  );

  const debts = useMemo(
    () => [...confirmedImportedDebts, ...manualDebts].filter((debt) => debt.balanceCents > 0),
    [confirmedImportedDebts, manualDebts],
  );
  const extraPaymentCents = parseCurrencyInput(extraPayment);
  const monthlyIncomeCents = parseCurrencyInput(monthlyIncome);

  const comparison = useMemo<StrategyComparison | null>(
    () => (debts.length > 0 ? compareStrategies(debts, extraPaymentCents) : null),
    [debts, extraPaymentCents],
  );
  const activeResult = useMemo(
    () =>
      debts.length > 0 ? calculateStrategyResult(debts, activeStrategy, extraPaymentCents) : null,
    [activeStrategy, debts, extraPaymentCents],
  );
  const interestSavedCents = useMemo(
    () => calculateInterestSavedCents(debts, activeStrategy, extraPaymentCents),
    [activeStrategy, debts, extraPaymentCents],
  );
  const milestones = useMemo(() => calculateDebtMilestoneSummary(debts), [debts]);
  const dti = useMemo(
    () => calculateDebtToIncomeTrend(debts, monthlyIncomeCents, activeStrategy, extraPaymentCents),
    [activeStrategy, debts, extraPaymentCents, monthlyIncomeCents],
  );

  const handleAdjustment = useCallback((debtId: string, patch: Partial<Debt>) => {
    setDebtAdjustments((current) => ({
      ...current,
      [debtId]: {
        ...current[debtId],
        ...patch,
      },
    }));
  }, []);

  const handleManualFieldChange = useCallback((field: keyof DebtFormState, value: string) => {
    setManualForm((current) => ({ ...current, [field]: value }));
  }, []);

  const handleManualSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const balanceCents = parseCurrencyInput(manualForm.balance);
      const originalInput = parseCurrencyInput(manualForm.originalBalance);
      const minimumPaymentCents = parseCurrencyInput(manualForm.minimumPayment);
      const debt: Debt = {
        id: createDebtId(),
        name: manualForm.name.trim(),
        balanceCents,
        originalBalanceCents: Math.max(balanceCents, originalInput || balanceCents),
        annualRateBps: parseRateInput(manualForm.rate),
        minimumPaymentCents,
        type: manualForm.type,
      };

      if (!debt.name || debt.balanceCents <= 0 || debt.minimumPaymentCents <= 0) return;
      setManualDebts((current) => [...current, debt]);
      setManualForm(DEFAULT_DEBT_FORM);
    },
    [manualForm],
  );

  return (
    <div className="payoff-planner">
      {debts.length === 0 ? (
        <EmptyState
          title="No debts added"
          description="Add your debts or connect debt accounts to compare payoff strategies and see how extra payments can save you money."
          action={<button type="button">Add Debt</button>}
        />
      ) : (
        <>
          {activeResult && (
            <section className="debt-hero" aria-label="Debt-free countdown">
              <div>
                <p className="debt-hero__eyebrow">Debt-Free Date</p>
                <h2>{formatCountdown(activeResult.totalMonths)}</h2>
                <p>
                  Keep going — this plan points to{' '}
                  {formatMonthYear(addMonthsToIsoDate(todayIso, activeResult.totalMonths))}.
                </p>
              </div>
              <div className="debt-hero__savings" aria-live="polite">
                <span>Interest saved</span>
                <strong>
                  <CurrencyDisplay amount={interestSavedCents} context="interest saved" />
                </strong>
                <p>Compared with making minimum payments only.</p>
              </div>
            </section>
          )}

          <section aria-label="Debt milestones" className="debt-milestones">
            <div>
              <h2>Debt Milestones</h2>
              <p>{milestones.percentPaidOff.toFixed(1)}% paid off — every payment is progress.</p>
            </div>
            <ul role="list" className="debt-milestones__badges">
              {milestones.milestones.map((milestone) => (
                <li
                  key={milestone.thresholdPercent}
                  className={`debt-milestone ${milestone.isReached ? 'debt-milestone--reached' : ''}`}
                >
                  <span aria-hidden="true">{milestone.isReached ? '🏆' : '○'}</span>
                  <strong>{milestone.thresholdPercent}%</strong>
                  <span>{milestone.isReached ? 'Celebrated' : 'On deck'}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Debt-to-income ratio" className="dti-card">
            <div className="dti-card__header">
              <div>
                <h2>Debt-to-Income Trend</h2>
                <p>
                  {dti.isImproving
                    ? 'Your required debt payments trend downward as balances disappear.'
                    : 'Add income or payoff progress to see the trend improve.'}
                </p>
              </div>
              <label>
                Monthly income ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={monthlyIncome}
                  onChange={(event) => setMonthlyIncome(event.target.value)}
                />
              </label>
            </div>
            <dl className="dti-card__stats">
              <dt>DTI ratio</dt>
              <dd>{dti.currentRatioPercent.toFixed(1)}%</dd>
              <dt>Projected final DTI</dt>
              <dd>{dti.projectedFinalRatioPercent.toFixed(1)}%</dd>
              <dt>Trend</dt>
              <dd>{dti.isImproving ? 'Improving' : 'Holding steady'}</dd>
            </dl>
            <ol className="dti-trend" aria-label="Monthly DTI trend preview">
              {dti.trend.slice(0, 6).map((point) => (
                <li key={point.month}>
                  Month {point.month}: {point.ratioPercent.toFixed(1)}%
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      <section aria-label="Imported debt accounts" className="imported-debts">
        <h2>Imported from Accounts</h2>
        {loading && <p>Loading accounts…</p>}
        {error && <p role="alert">Could not load accounts: {error}</p>}
        {!loading && importedDebts.length === 0 && (
          <p className="form-help">
            No credit card or loan accounts were found. You can add debts manually below.
          </p>
        )}
        {confirmedImportedDebts.length > 0 && (
          <ul role="list" className="debt-import-list">
            {confirmedImportedDebts.map((debt) => (
              <li key={debt.id} className="debt-import-list__item">
                <h3>{debt.name}</h3>
                <label>
                  Balance ($)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={centsToInputValue(debt.balanceCents)}
                    onChange={(event) =>
                      handleAdjustment(debt.id, {
                        balanceCents: parseCurrencyInput(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Original balance ($)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={centsToInputValue(debt.originalBalanceCents ?? debt.balanceCents)}
                    onChange={(event) =>
                      handleAdjustment(debt.id, {
                        originalBalanceCents: Math.max(
                          debt.balanceCents,
                          parseCurrencyInput(event.target.value),
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  APR (%)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bpsToInputValue(debt.annualRateBps)}
                    onChange={(event) =>
                      handleAdjustment(debt.id, {
                        annualRateBps: parseRateInput(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Minimum payment ($)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={centsToInputValue(debt.minimumPaymentCents)}
                    onChange={(event) =>
                      handleAdjustment(debt.id, {
                        minimumPaymentCents: parseCurrencyInput(event.target.value),
                      })
                    }
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Manual debt entry">
        <h2>Add Debt Manually</h2>
        <form className="debt-entry-form" onSubmit={handleManualSubmit} noValidate>
          <label>
            Debt name
            <input
              type="text"
              value={manualForm.name}
              onChange={(event) => handleManualFieldChange('name', event.target.value)}
              required
            />
          </label>
          <label>
            Debt balance ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={manualForm.balance}
              onChange={(event) => handleManualFieldChange('balance', event.target.value)}
              required
            />
          </label>
          <label>
            Original balance ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={manualForm.originalBalance}
              onChange={(event) => handleManualFieldChange('originalBalance', event.target.value)}
            />
          </label>
          <label>
            APR (%)
            <input
              type="number"
              min="0"
              step="0.01"
              value={manualForm.rate}
              onChange={(event) => handleManualFieldChange('rate', event.target.value)}
              required
            />
          </label>
          <label>
            Minimum payment ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={manualForm.minimumPayment}
              onChange={(event) => handleManualFieldChange('minimumPayment', event.target.value)}
              required
            />
          </label>
          <label>
            Debt type
            <select
              value={manualForm.type}
              onChange={(event) =>
                handleManualFieldChange('type', event.target.value as Debt['type'])
              }
            >
              <option value="credit_card">Credit card</option>
              <option value="student_loan">Student loan</option>
              <option value="auto_loan">Auto loan</option>
              <option value="mortgage">Mortgage</option>
              <option value="personal_loan">Personal loan</option>
              <option value="medical">Medical</option>
              <option value="other">Other</option>
            </select>
          </label>
          <button type="submit">Add Debt</button>
        </form>
      </section>

      {debts.length > 0 && (
        <>
          <section aria-label="Payoff controls" className="payoff-controls">
            <h2>Payoff Plan</h2>
            <label>
              Active strategy
              <select
                value={activeStrategy}
                onChange={(event) => setActiveStrategy(event.target.value as PayoffStrategy)}
              >
                <option value="avalanche">Avalanche (highest APR first)</option>
                <option value="snowball">Snowball (smallest balance first)</option>
              </select>
            </label>
            <label>
              Extra monthly payment ($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={extraPayment}
                onChange={(event) => setExtraPayment(event.target.value)}
              />
            </label>
          </section>

          <section aria-label="Your debts">
            <h2>Your Debts</h2>
            <ul role="list" className="debt-list">
              {debts.map((debt) => (
                <li key={debt.id} role="listitem" className="debt-list__item">
                  <div className="debt-list__name">{debt.name}</div>
                  <div className="debt-list__details">
                    <CurrencyDisplay amount={debt.balanceCents} context="balance" />
                    <span className="debt-list__rate">{formatRateBps(debt.annualRateBps)} APR</span>
                    <CurrencyDisplay amount={debt.minimumPaymentCents} context="minimum payment" />
                  </div>
                </li>
              ))}
            </ul>
          </section>

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
              <p className="strategy-savings" aria-live="polite">
                Your {activeStrategy} plan saves{' '}
                <CurrencyDisplay amount={interestSavedCents} context="interest savings" /> in
                interest versus minimum-only payments.
              </p>
            </section>
          )}
        </>
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

function BnplDashboardPanel(): React.ReactElement {
  const [obligations] = useState<BnplObligation[]>([]);
  const monthlyIncomeCents = 500_000;

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
// Student Loan panel (#1681, #1761, #2160)
// ---------------------------------------------------------------------------

function StudentLoanPanel(): React.ReactElement {
  const [loans, setLoans] = useState<StudentLoan[]>([]);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [extraPayment, setExtraPayment] = useState('50');
  const [formState, setFormState] = useState<StudentLoanFormState>(DEFAULT_STUDENT_LOAN_FORM);
  const [scenarioForm, setScenarioForm] =
    useState<StudentLoanScenarioFormState>(DEFAULT_STUDENT_SCENARIOS);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const summary = useMemo(
    () => calculateStudentLoanDashboardSummary(loans, todayIso),
    [loans, todayIso],
  );
  const whatIfScenario = useMemo(
    () => calculateStudentLoanWhatIfScenario(loans, parseCurrencyInput(extraPayment), todayIso),
    [extraPayment, loans, todayIso],
  );
  const scenarioResults = useMemo(() => {
    const annualIncomeCents = parseCurrencyInput(scenarioForm.annualIncome);
    const idrInput = {
      annualIncomeCents,
      familySize: Math.max(1, Number.parseInt(scenarioForm.familySize, 10) || 1),
      state: 'US',
      filingStatus: scenarioForm.filingStatus,
    };
    const scenarios: StudentLoanScenarioConfig[] = [
      {
        id: 'idr-scenario',
        label: `IDR (${scenarioForm.idrPlan})`,
        type: 'idr',
        idrPlan: scenarioForm.idrPlan,
        idrInput,
      },
      {
        id: 'pslf-scenario',
        label: 'PSLF path',
        type: 'pslf',
        idrPlan: scenarioForm.idrPlan,
        idrInput,
        pslfQualifyingPayments: Math.max(
          0,
          Number.parseInt(scenarioForm.pslfPaymentsMade, 10) || 0,
        ),
      },
      {
        id: 'refinance-scenario',
        label: 'Refinance',
        type: 'refinance',
        refinanceAnnualRateBps: parseRateInput(scenarioForm.refinanceRate),
        refinanceTermMonths: Math.max(
          1,
          Number.parseInt(scenarioForm.refinanceTermMonths, 10) || 120,
        ),
      },
      {
        id: 'raise-scenario',
        label: 'Salary raise',
        type: 'salary_raise',
        idrPlan: scenarioForm.salaryRaisePlan,
        idrInput,
        salaryRaiseAnnualCents: parseCurrencyInput(scenarioForm.salaryRaise),
      },
    ];
    return calculateStudentLoanScenarioComparisons(loans, scenarios, todayIso);
  }, [loans, scenarioForm, todayIso]);

  const resetForm = useCallback(() => {
    setEditingLoanId(null);
    setFormState(DEFAULT_STUDENT_LOAN_FORM);
  }, []);

  const handleFieldChange = useCallback(
    <K extends keyof StudentLoanFormState>(field: K, value: StudentLoanFormState[K]) => {
      setFormState((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const handleScenarioFieldChange = useCallback(
    <K extends keyof StudentLoanScenarioFormState>(
      field: K,
      value: StudentLoanScenarioFormState[K],
    ) => {
      setScenarioForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const balanceCents = parseCurrencyInput(formState.balance);
      const originalBalanceInput = parseCurrencyInput(formState.originalBalance);
      const originalBalanceCents = Math.max(balanceCents, originalBalanceInput || balanceCents);
      const minimumPaymentCents = parseCurrencyInput(formState.minimumPayment);
      const loan: StudentLoan = {
        id: editingLoanId ?? createStudentLoanId(),
        name: formState.name.trim(),
        servicer: formState.servicer.trim(),
        balanceCents,
        annualRateBps: parseRateInput(formState.rate),
        minimumPaymentCents,
        status: formState.status,
        originalBalanceCents,
        isFederal: formState.isFederal,
        isPslfEligible: formState.isPslfEligible,
        pslfPaymentsMade: Math.max(0, Number.parseInt(formState.pslfPaymentsMade, 10) || 0),
      };

      if (!loan.name || !loan.servicer || loan.balanceCents <= 0 || loan.minimumPaymentCents <= 0) {
        return;
      }

      setLoans((current) => {
        if (editingLoanId) {
          return current.map((existingLoan) =>
            existingLoan.id === editingLoanId ? loan : existingLoan,
          );
        }
        return [...current, loan];
      });
      resetForm();
    },
    [editingLoanId, formState, resetForm],
  );

  const handleEditLoan = useCallback((loan: StudentLoan) => {
    setEditingLoanId(loan.id);
    setFormState(buildStudentLoanFormState(loan));
  }, []);

  return (
    <div className="student-loan-dashboard">
      {loans.length === 0 ? (
        <EmptyState
          title="No student loans"
          description="Add a loan below to see payoff estimates, progress tracking, and extra-payment savings."
        />
      ) : (
        <>
          <section aria-label="Student loan dashboard overview">
            <h2>Dashboard Overview</h2>
            <div className="student-loan-summary-grid">
              <article className="student-loan-stat-card">
                <h3>Total Balance</h3>
                <p className="student-loan-stat-card__value">
                  <CurrencyDisplay
                    amount={summary.totalBalanceCents}
                    context="student loan balance"
                  />
                </p>
              </article>
              <article className="student-loan-stat-card">
                <h3>Weighted Avg Rate</h3>
                <p className="student-loan-stat-card__value">
                  {formatRateBps(summary.weightedAverageRateBps)}
                </p>
              </article>
              <article className="student-loan-stat-card">
                <h3>Monthly Payment</h3>
                <p className="student-loan-stat-card__value">
                  <CurrencyDisplay
                    amount={summary.monthlyPaymentCents}
                    context="student loan payment"
                  />
                </p>
              </article>
              <article className="student-loan-stat-card">
                <h3>Estimated Payoff</h3>
                <p className="student-loan-stat-card__value">
                  {summary.estimatedPayoffDate
                    ? formatMonthYear(summary.estimatedPayoffDate)
                    : 'Not amortizing'}
                </p>
                <p className="student-loan-stat-card__hint">
                  Based on your current payment amount.
                </p>
              </article>
              <article className="student-loan-stat-card">
                <h3>Total Interest Remaining</h3>
                <p className="student-loan-stat-card__value">
                  <CurrencyDisplay
                    amount={summary.totalInterestCents}
                    context="remaining interest"
                  />
                </p>
              </article>
              <article className="student-loan-stat-card student-loan-stat-card--wide">
                <h3>Paid Off Progress</h3>
                <div
                  className="student-loan-progress"
                  role="progressbar"
                  aria-label="Student loans paid off"
                  aria-valuenow={summary.percentPaidOff}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="student-loan-progress__bar"
                    style={{ width: `${summary.percentPaidOff}%` }}
                  />
                </div>
                <p className="student-loan-stat-card__hint">
                  {summary.percentPaidOff.toFixed(1)}% paid off
                </p>
              </article>
            </div>
          </section>

          <section aria-label="What-if calculator" className="student-loan-what-if">
            <h2>What if?</h2>
            <label htmlFor="student-loan-extra-payment">Extra payment each month ($)</label>
            <input
              id="student-loan-extra-payment"
              type="number"
              min="0"
              step="0.01"
              value={extraPayment}
              onChange={(event) => setExtraPayment(event.target.value)}
            />
            <p className="student-loan-what-if__result" aria-live="polite">
              Pay{' '}
              <CurrencyDisplay amount={whatIfScenario.extraPaymentCents} context="extra payment" />{' '}
              extra/month → save{' '}
              <CurrencyDisplay
                amount={whatIfScenario.interestSavedCents}
                context="interest savings"
              />{' '}
              in interest and pay off {whatIfScenario.monthsSaved} month
              {whatIfScenario.monthsSaved === 1 ? '' : 's'} earlier.
            </p>
          </section>

          <section aria-label="Student loan scenario editor" className="student-loan-scenarios">
            <h2>Editable Scenario Comparison</h2>
            <div className="student-loan-scenario-form">
              <label>
                Annual income ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={scenarioForm.annualIncome}
                  onChange={(event) =>
                    handleScenarioFieldChange('annualIncome', event.target.value)
                  }
                />
              </label>
              <label>
                Family size
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={scenarioForm.familySize}
                  onChange={(event) => handleScenarioFieldChange('familySize', event.target.value)}
                />
              </label>
              <label>
                Filing status
                <select
                  value={scenarioForm.filingStatus}
                  onChange={(event) =>
                    handleScenarioFieldChange(
                      'filingStatus',
                      event.target.value as StudentLoanScenarioFormState['filingStatus'],
                    )
                  }
                >
                  <option value="single">Single</option>
                  <option value="married_filing_jointly">Married filing jointly</option>
                  <option value="married_filing_separately">Married filing separately</option>
                </select>
              </label>
              <label>
                IDR plan
                <select
                  value={scenarioForm.idrPlan}
                  onChange={(event) =>
                    handleScenarioFieldChange('idrPlan', event.target.value as IdrPlanType)
                  }
                >
                  {Object.entries(IDR_PLAN_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                PSLF payments made
                <input
                  type="number"
                  min="0"
                  max="120"
                  step="1"
                  value={scenarioForm.pslfPaymentsMade}
                  onChange={(event) =>
                    handleScenarioFieldChange('pslfPaymentsMade', event.target.value)
                  }
                />
              </label>
              <label>
                Refinance APR (%)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={scenarioForm.refinanceRate}
                  onChange={(event) =>
                    handleScenarioFieldChange('refinanceRate', event.target.value)
                  }
                />
              </label>
              <label>
                Refinance term (months)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={scenarioForm.refinanceTermMonths}
                  onChange={(event) =>
                    handleScenarioFieldChange('refinanceTermMonths', event.target.value)
                  }
                />
              </label>
              <label>
                Salary raise ($/year)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={scenarioForm.salaryRaise}
                  onChange={(event) => handleScenarioFieldChange('salaryRaise', event.target.value)}
                />
              </label>
            </div>
            <div className="student-loan-scenario-grid">
              {scenarioResults.map((scenario) => (
                <article key={scenario.id} className="student-loan-scenario-card">
                  <h3>{scenario.label}</h3>
                  <dl>
                    <dt>Monthly payment</dt>
                    <dd>
                      <CurrencyDisplay
                        amount={scenario.monthlyPaymentCents}
                        context="scenario monthly payment"
                      />
                    </dd>
                    <dt>Total paid</dt>
                    <dd>
                      <CurrencyDisplay
                        amount={scenario.totalPaidCents}
                        context="scenario total paid"
                      />
                    </dd>
                    <dt>Payoff time</dt>
                    <dd>
                      {scenario.monthsToPayoff === null
                        ? 'Not amortizing'
                        : `${scenario.monthsToPayoff} months`}
                    </dd>
                    <dt>Forgiven</dt>
                    <dd>
                      <CurrencyDisplay
                        amount={scenario.forgivenAmountCents}
                        context="forgiven amount"
                      />
                    </dd>
                  </dl>
                  <p>{scenario.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section aria-label="Student loan cards">
            <h2>Your Loans</h2>
            <ul role="list" className="student-loan-card-grid">
              {loans.map((loan) => (
                <li key={loan.id} role="listitem">
                  <article className="student-loan-card">
                    <div className="student-loan-card__header">
                      <div>
                        <h3>{loan.name}</h3>
                        <p className="student-loan-card__servicer">{loan.servicer}</p>
                      </div>
                      <span
                        className={`student-loan-status student-loan-status--${loan.status.replace(/_/g, '-')}`}
                      >
                        {STUDENT_LOAN_STATUS_LABELS[loan.status]}
                      </span>
                    </div>
                    <dl className="student-loan-card__stats">
                      <dt>Balance</dt>
                      <dd>
                        <CurrencyDisplay
                          amount={loan.balanceCents}
                          context={`${loan.name} balance`}
                        />
                      </dd>
                      <dt>Rate</dt>
                      <dd>{formatRateBps(loan.annualRateBps)}</dd>
                      <dt>Monthly Payment</dt>
                      <dd>
                        <CurrencyDisplay
                          amount={loan.minimumPaymentCents}
                          context={`${loan.name} payment`}
                        />
                      </dd>
                      <dt>PSLF</dt>
                      <dd>
                        {loan.isPslfEligible
                          ? `${loan.pslfPaymentsMade}/120 payments`
                          : 'Not tracking'}
                      </dd>
                    </dl>
                    <button type="button" onClick={() => handleEditLoan(loan)}>
                      Edit Loan
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section aria-label={editingLoanId ? 'Edit student loan' : 'Add student loan'}>
        <h2>{editingLoanId ? 'Edit Student Loan' : 'Add Student Loan'}</h2>
        <form className="student-loan-form" onSubmit={handleSubmit} noValidate>
          <label>
            Loan name
            <input
              type="text"
              value={formState.name}
              onChange={(event) => handleFieldChange('name', event.target.value)}
              required
            />
          </label>
          <label>
            Servicer
            <input
              type="text"
              value={formState.servicer}
              onChange={(event) => handleFieldChange('servicer', event.target.value)}
              required
            />
          </label>
          <label>
            Current balance ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.balance}
              onChange={(event) => handleFieldChange('balance', event.target.value)}
              required
            />
          </label>
          <label>
            Original balance ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.originalBalance}
              onChange={(event) => handleFieldChange('originalBalance', event.target.value)}
            />
          </label>
          <label>
            Interest rate (%)
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.rate}
              onChange={(event) => handleFieldChange('rate', event.target.value)}
              required
            />
          </label>
          <label>
            Minimum payment ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.minimumPayment}
              onChange={(event) => handleFieldChange('minimumPayment', event.target.value)}
              required
            />
          </label>
          <label>
            Status
            <select
              value={formState.status}
              onChange={(event) =>
                handleFieldChange('status', event.target.value as StudentLoanStatus)
              }
            >
              {Object.entries(STUDENT_LOAN_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="student-loan-checkbox">
            <input
              type="checkbox"
              checked={formState.isFederal}
              onChange={(event) => handleFieldChange('isFederal', event.target.checked)}
            />
            Federal loan
          </label>
          <label className="student-loan-checkbox">
            <input
              type="checkbox"
              checked={formState.isPslfEligible}
              onChange={(event) => handleFieldChange('isPslfEligible', event.target.checked)}
            />
            PSLF eligible
          </label>
          <label>
            Qualifying PSLF payments made
            <input
              type="number"
              min="0"
              max="120"
              step="1"
              value={formState.pslfPaymentsMade}
              onChange={(event) => handleFieldChange('pslfPaymentsMade', event.target.value)}
            />
          </label>
          <p className="form-help">
            Leave original balance blank if you only know today&apos;s balance.
          </p>
          <div className="student-loan-form__actions">
            <button type="submit">
              {editingLoanId ? 'Update Student Loan' : 'Add Student Loan'}
            </button>
            {editingLoanId && (
              <button type="button" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Credit Card panel (#1569)
// ---------------------------------------------------------------------------

function CreditCardPanel(): React.ReactElement {
  const [cards] = useState<CreditCard[]>([]);
  const checkingBalanceCents = 0;

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
