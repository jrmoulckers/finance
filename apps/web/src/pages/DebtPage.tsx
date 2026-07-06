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

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { CurrencyDisplay, EmptyState } from '../components/common';
import { pluralize } from '../lib/ui/pluralize';
import { ExplainThis } from '../components/common/ExplainThis';
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
  calculateExtraPaymentImpactScenarios,
  calculateInterestSavedCents,
  calculateMonthlyInterestCents,
  calculatePayoffStrategyRecommendation,
  calculateStrategyResult,
  compareStrategies,
} from '../lib/debt-payoff-engine';
import { addMonthsToIsoDate } from '../lib/date-utils';
import { aggregateBnplDashboard, type BnplObligationDraft } from '../lib/debt/bnpl-aggregation';
import {
  calculateStudentLoanDashboardSummary,
  calculateStudentLoanScenarioComparisons,
  calculateStudentLoanWhatIfScenario,
} from '../lib/debt-student-loan-engine';
import {
  calculateCreditUtilizationSummary,
  calculateReservationSummary,
} from '../lib/debt-credit-card-engine';
import {
  compareConsolidationOffer,
  type ConsolidationFeeTreatment,
} from '../lib/debt/consolidation-comparison';
import { buildConsolidationOfferPanelModel } from '../lib/debt/consolidation-offer-panel';
import {
  readConsolidationScenario,
  restoreConsolidationScenario,
  writeConsolidationScenario,
  type PersistedConsolidationScenario,
} from '../lib/debt/consolidation-scenario-persistence';
import {
  buildDebtPayoffProgressRingCard,
  buildStudentLoanProgressRingCard,
  type DebtProgressRingCard,
} from '../lib/debt/debt-progress-rings';
import { readDebtTracker, writeDebtTracker } from '../lib/debt/debt-tracker-persistence';
import { buildCreditScoreSimulatorPanelModel } from '../lib/debt/credit-score-simulator-panel';
import { buildCreditScoreAssumptionSummary } from '../lib/debt/credit-score-simulator-assumptions';
import {
  validateBnplObligationDraft,
  upsertBnplObligationFromDraft,
} from '../lib/debt/bnpl-obligation-entry';
import {
  markBnplInstallmentPaidById,
  readBnplObligations,
  writeBnplObligations,
} from '../lib/debt/bnpl-obligation-persistence';
import { calculateRefinanceBreakEven } from '../lib/debt/refinance-break-even';
import { buildRefinanceBreakEvenPanelModel } from '../lib/debt/refinance-break-even-panel';
import {
  buildRefinanceBaselineOptions,
  resolveRefinanceBaselinePaymentCents,
  type RefinanceBaselineId,
} from '../lib/debt/refinance-baseline-options';
import type { Account } from '../kmp/bridge';
// Imported directly (not via a shared barrel) so it stays code-split into the
// lazy Debt page chunk and does not inflate other route bundles (#2175).
import { DebtPayoffRings } from '../components/debt/DebtPayoffRings';
// Imported directly (not via a shared barrel) for the same code-splitting
// reason — keeps the joint-debt planner inside the lazy Debt chunk (#2153).
import { JointDebtPlanner } from '../components/debt/JointDebtPlanner';

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type DebtTab = 'payoff' | 'payoff-rings' | 'joint' | 'bnpl' | 'student-loans' | 'credit-cards';

const TAB_LABELS: Record<DebtTab, string> = {
  payoff: 'Payoff Planner',
  'payoff-rings': 'Payoff Rings',
  joint: 'Joint Debt',
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

type CreditCardFormState = {
  name: string;
  balance: string;
  creditLimit: string;
  minimumPayment: string;
  rate: string;
  dueDate: string;
  statementDate: string;
};

type ConsolidationFormState = {
  annualRate: string;
  termMonths: string;
  originationFee: string;
  feeTreatment: ConsolidationFeeTreatment;
  targetPayment: string;
};

type BnplFormState = {
  id: string;
  merchantName: string;
  originalAmount: string;
  totalInstallments: string;
  paidInstallments: string;
  installmentAmount: string;
  annualRate: string;
  totalFees: string;
  firstDueDate: string;
  cadenceDays: string;
};

type CreditScoreSimulatorFormState = {
  targetCardId: string;
  targetUtilization: string;
  plannedPayment: string;
  onTimePaymentMonths: string;
  hardInquiries: string;
  closeAccountId: string;
};

type RefinanceFormState = {
  annualRate: string;
  termMonths: string;
  originationFee: string;
  feesFinanced: boolean;
  paymentOverride: string;
  baselineId: RefinanceBaselineId;
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

const DEFAULT_CREDIT_CARD_FORM: CreditCardFormState = {
  name: '',
  balance: '',
  creditLimit: '',
  minimumPayment: '',
  rate: '',
  dueDate: '',
  statementDate: '',
};

const DEFAULT_CONSOLIDATION_FORM: ConsolidationFormState = {
  annualRate: '9',
  termMonths: '36',
  originationFee: '0',
  feeTreatment: 'paid_upfront',
  targetPayment: '',
};

const DEFAULT_BNPL_FORM: BnplFormState = {
  id: '',
  merchantName: '',
  originalAmount: '',
  totalInstallments: '4',
  paidInstallments: '0',
  installmentAmount: '',
  annualRate: '0',
  totalFees: '0',
  firstDueDate: '',
  cadenceDays: '14',
};

const DEFAULT_CREDIT_SCORE_FORM: CreditScoreSimulatorFormState = {
  targetCardId: '',
  targetUtilization: '30',
  plannedPayment: '0',
  onTimePaymentMonths: '0',
  hardInquiries: '0',
  closeAccountId: '',
};

const DEFAULT_REFINANCE_FORM: RefinanceFormState = {
  annualRate: '5',
  termMonths: '60',
  originationFee: '0',
  feesFinanced: false,
  paymentOverride: '',
  baselineId: 'current_required',
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

/**
 * Joins debt names into a human-readable list ("A", "A and B", "A, B, and C").
 */
function formatDebtNameList(names: readonly string[]): string {
  if (names.length === 0) return 'this debt';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function formatStrategyName(strategy: PayoffStrategy): string {
  return strategy === 'avalanche' ? 'Avalanche' : 'Snowball';
}

function parseScenarioAmounts(input: string, activeExtraPaymentCents: number): number[] {
  const parsed = input
    .split(',')
    .map((value) => parseCurrencyInput(value.trim()))
    .filter((amount) => amount > 0);
  return Array.from(new Set([0, 2_500, 5_000, 10_000, activeExtraPaymentCents, ...parsed]));
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

function createCreditCardId(): string {
  return 'credit-card-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function createBnplId(): string {
  return 'bnpl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
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

function defaultInstallmentTermMonths(type: Debt['type']): number {
  if (type === 'auto_loan') return 60;
  if (type === 'mortgage') return 360;
  if (type === 'student_loan') return 120;
  if (type === 'personal_loan') return 60;
  return 0;
}

function defaultMinimumPaymentCents(balanceCents: number, type: Debt['type']): number {
  if (balanceCents <= 0) return 0;
  const termMonths = defaultInstallmentTermMonths(type);
  if (termMonths > 0) {
    // Installment loans carry a fixed amortizing payment, not a percent of balance.
    const monthlyRate = defaultDebtRateBps(type) / 120_000;
    const payment =
      monthlyRate > 0
        ? (balanceCents * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))
        : balanceCents / termMonths;
    return Math.max(2_500, Math.round(payment));
  }
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
    rateEstimated: true,
    minimumEstimated: true,
  };
}

function getLocalStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Debt management page — the central hub for all debt tracking features.
 */
export function DebtPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<DebtTab>('payoff');
  const debtTabKeys = useMemo(() => Object.keys(TAB_LABELS) as DebtTab[], []);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, tab: DebtTab) => {
      const currentIndex = debtTabKeys.indexOf(tab);
      let nextIndex: number;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          nextIndex = (currentIndex + 1) % debtTabKeys.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          nextIndex = (currentIndex - 1 + debtTabKeys.length) % debtTabKeys.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = debtTabKeys.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      const nextTab = debtTabKeys[nextIndex];
      if (!nextTab) {
        return;
      }
      setActiveTab(nextTab);
      document.getElementById(`debt-tab-${nextTab}`)?.focus();
    },
    [debtTabKeys],
  );

  return (
    <section className="debt-page" aria-label="Debt Management">
      <header className="debt-page__header">
        <h1>Debt Management</h1>
        <p className="debt-page__subtitle">Track, plan, and optimize your debt payoff strategy.</p>
      </header>

      <nav className="debt-page__tabs" aria-label="Debt management sections">
        <ul role="tablist" className="debt-page__tab-list">
          {debtTabKeys.map((tab) => (
            <li key={tab} role="presentation">
              <button
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`debt-panel-${tab}`}
                id={`debt-tab-${tab}`}
                tabIndex={activeTab === tab ? 0 : -1}
                className={`debt-page__tab ${activeTab === tab ? 'debt-page__tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(event) => handleTabKeyDown(event, tab)}
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
        {activeTab === 'payoff-rings' && <PayoffRingsPanel />}
        {activeTab === 'joint' && <JointDebtPanel />}
        {activeTab === 'bnpl' && <BnplDashboardPanel />}
        {activeTab === 'student-loans' && <StudentLoanPanel />}
        {activeTab === 'credit-cards' && <CreditCardPanel />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Payoff Rings panel (#2175)
// ---------------------------------------------------------------------------

/**
 * Dedicated "fitness rings" payoff surface. Visualises payoff progress,
 * estimated payoff date, milestones, and an extra-payment what-if comparison
 * for each loan/debt account derived from local account data.
 */
function PayoffRingsPanel(): React.ReactElement {
  const { accounts } = useAccounts();
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const debts = useMemo(
    () =>
      accounts
        .map(accountToDebt)
        .filter((debt): debt is Debt => debt !== null && debt.balanceCents > 0),
    [accounts],
  );
  return <DebtPayoffRings debts={debts} todayIso={todayIso} />;
}

// ---------------------------------------------------------------------------
// Joint Debt panel (#2153)
// ---------------------------------------------------------------------------

/**
 * Couples' joint debt payoff surface. Derives both partners' debts from the
 * household's debt accounts and hands them to the accessible JointDebtPlanner,
 * which adds the partner-ownership dimension, an avalanche/snowball comparison
 * across the combined debts, a goal-impact view, and a recommendation mode.
 */
function JointDebtPanel(): React.ReactElement {
  const { accounts } = useAccounts();
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const debts = useMemo(
    () =>
      accounts
        .map(accountToDebt)
        .filter((debt): debt is Debt => debt !== null && debt.balanceCents > 0),
    [accounts],
  );
  return <JointDebtPlanner debts={debts} todayIso={todayIso} />;
}

// ---------------------------------------------------------------------------
// Payoff Planner panel (#1662, #2154, #2157, #2165)
// ---------------------------------------------------------------------------

function PayoffPlannerPanel(): React.ReactElement {
  const { accounts, loading, error } = useAccounts();
  const [manualDebts, setManualDebts] = useState<Debt[]>(() => {
    const storage = getLocalStorage();
    return storage ? readDebtTracker(storage).manualDebts : [];
  });
  const [debtAdjustments, setDebtAdjustments] = useState<Record<string, Partial<Debt>>>(() => {
    const storage = getLocalStorage();
    return storage ? readDebtTracker(storage).debtAdjustments : {};
  });
  const [manualForm, setManualForm] = useState<DebtFormState>(DEFAULT_DEBT_FORM);
  const [manualErrors, setManualErrors] = useState<
    Partial<Record<'name' | 'balance' | 'minimumPayment', string>>
  >({});
  const manualNameRef = useRef<HTMLInputElement>(null);
  const manualBalanceRef = useRef<HTMLInputElement>(null);
  const manualMinimumRef = useRef<HTMLInputElement>(null);
  const [extraPayment, setExtraPayment] = useState('100');
  const [activeStrategy, setActiveStrategy] = useState<PayoffStrategy>('avalanche');
  const [monthlyIncome, setMonthlyIncome] = useState('5000');
  const [manualInterestPaid, setManualInterestPaid] = useState('0');
  const [dtiAnnualRaise, setDtiAnnualRaise] = useState('0');
  const [dtiTarget, setDtiTarget] = useState('36');
  const [impactScenarioInput, setImpactScenarioInput] = useState('25, 50, 100, 200');
  const [consolidationForm, setConsolidationForm] = useState<ConsolidationFormState>(
    DEFAULT_CONSOLIDATION_FORM,
  );
  const [selectedConsolidationDebtIds, setSelectedConsolidationDebtIds] = useState<string[]>([]);
  const [hasRestoredConsolidation, setHasRestoredConsolidation] = useState(false);
  const [consolidationRestoreMessage, setConsolidationRestoreMessage] = useState<string | null>(
    null,
  );
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
  const eligibleConsolidationDebtIds = useMemo(() => debts.map((debt) => debt.id), [debts]);
  const effectiveConsolidationDebtIds =
    selectedConsolidationDebtIds.length > 0
      ? selectedConsolidationDebtIds.filter((id) => eligibleConsolidationDebtIds.includes(id))
      : eligibleConsolidationDebtIds;

  useEffect(() => {
    if (hasRestoredConsolidation || debts.length === 0) return;
    const storage = getLocalStorage();
    const saved = storage ? readConsolidationScenario(storage) : null;
    if (saved) {
      const restored = restoreConsolidationScenario(saved, debts);
      setSelectedConsolidationDebtIds([...restored.selectedDebtIds]);
      setConsolidationForm({
        annualRate: bpsToInputValue(restored.annualRateBps),
        termMonths: String(restored.termMonths),
        originationFee: centsToInputValue(restored.originationFeeCents),
        feeTreatment: restored.feeTreatment,
        targetPayment:
          restored.targetPaymentCents === undefined
            ? ''
            : centsToInputValue(restored.targetPaymentCents),
      });
      if (restored.ignoredDebtIds.length > 0) {
        setConsolidationRestoreMessage(
          'Ignored ' +
            restored.ignoredDebtIds.length +
            ' deleted or paid-off saved debt selection' +
            (restored.ignoredDebtIds.length === 1 ? '' : 's') +
            '.',
        );
      }
    }
    setHasRestoredConsolidation(true);
  }, [debts, hasRestoredConsolidation]);

  useEffect(() => {
    const storage = getLocalStorage();
    if (storage) writeDebtTracker(storage, { manualDebts, debtAdjustments });
  }, [manualDebts, debtAdjustments]);
  const extraPaymentCents = parseCurrencyInput(extraPayment);
  const monthlyIncomeCents = parseCurrencyInput(monthlyIncome);
  const manualInterestPaidCents = parseCurrencyInput(manualInterestPaid);
  const dtiAnnualRaiseBps = parseRateInput(dtiAnnualRaise);
  const dtiTargetPercent = Number.parseFloat(dtiTarget);

  const comparison = useMemo<StrategyComparison | null>(
    () => (debts.length > 0 ? compareStrategies(debts, extraPaymentCents) : null),
    [debts, extraPaymentCents],
  );
  const recommendation = useMemo(
    () => (comparison ? calculatePayoffStrategyRecommendation(comparison) : null),
    [comparison],
  );
  const activeResult = useMemo(
    () =>
      debts.length > 0 ? calculateStrategyResult(debts, activeStrategy, extraPaymentCents) : null,
    [activeStrategy, debts, extraPaymentCents],
  );
  const minimumOnlyResult = useMemo(
    () => (debts.length > 0 ? calculateStrategyResult(debts, activeStrategy, 0) : null),
    [activeStrategy, debts],
  );
  const interestSavedCents = useMemo(
    () => calculateInterestSavedCents(debts, activeStrategy, extraPaymentCents),
    [activeStrategy, debts, extraPaymentCents],
  );
  const milestones = useMemo(
    () => calculateDebtMilestoneSummary(debts, manualInterestPaidCents),
    [debts, manualInterestPaidCents],
  );
  const dti = useMemo(
    () =>
      calculateDebtToIncomeTrend(debts, monthlyIncomeCents, activeStrategy, extraPaymentCents, {
        annualRaiseBps: dtiAnnualRaiseBps,
        targetRatioPercent: Number.isFinite(dtiTargetPercent) ? dtiTargetPercent : undefined,
        paymentBasis: 'minimum',
      }),
    [
      activeStrategy,
      debts,
      dtiAnnualRaiseBps,
      dtiTargetPercent,
      extraPaymentCents,
      monthlyIncomeCents,
    ],
  );
  const extraPaymentScenarios = useMemo(
    () =>
      debts.length > 0
        ? calculateExtraPaymentImpactScenarios(
            debts,
            activeStrategy,
            parseScenarioAmounts(impactScenarioInput, extraPaymentCents),
          )
        : [],
    [activeStrategy, debts, extraPaymentCents, impactScenarioInput],
  );
  const diminishingReturnScenario = extraPaymentScenarios.find(
    (scenario) => scenario.isDiminishingReturn,
  );
  const consolidationComparison = useMemo(() => {
    if (debts.length === 0) return null;
    return compareConsolidationOffer({
      debts,
      selectedDebtIds: effectiveConsolidationDebtIds,
      currentStrategy: activeStrategy,
      currentExtraPaymentCents: extraPaymentCents,
      consolidationAnnualRateBps: parseRateInput(consolidationForm.annualRate),
      consolidationTermMonths: Math.max(1, Number.parseInt(consolidationForm.termMonths, 10) || 1),
      originationFeeCents: parseCurrencyInput(consolidationForm.originationFee),
      monthlyPaymentTargetCents:
        consolidationForm.targetPayment.trim() === ''
          ? undefined
          : parseCurrencyInput(consolidationForm.targetPayment),
      feeTreatment: consolidationForm.feeTreatment,
    });
  }, [activeStrategy, consolidationForm, debts, effectiveConsolidationDebtIds, extraPaymentCents]);
  const consolidationPanelModel = useMemo(
    () =>
      consolidationComparison ? buildConsolidationOfferPanelModel(consolidationComparison) : null,
    [consolidationComparison],
  );
  const debtProgressRing = useMemo(
    () =>
      activeResult
        ? buildDebtPayoffProgressRingCard({
            milestones,
            activeResult,
            interestSavedCents,
            debtFreeLabel: formatMonthYear(addMonthsToIsoDate(todayIso, activeResult.totalMonths)),
            hasTrackedProgress: milestones.paidOffCents > 0,
          })
        : null,
    [activeResult, interestSavedCents, milestones, todayIso],
  );
  const underwaterDebts = useMemo(
    () =>
      activeResult && !activeResult.fullyPaidOff
        ? debts.filter((debt) => activeResult.unpaidDebtIds.includes(debt.id))
        : [],
    [activeResult, debts],
  );

  useEffect(() => {
    if (!hasRestoredConsolidation || debts.length === 0) return;
    const storage = getLocalStorage();
    if (!storage) return;
    const scenario: PersistedConsolidationScenario = {
      version: 1,
      selectedDebtIds: effectiveConsolidationDebtIds,
      annualRateBps: parseRateInput(consolidationForm.annualRate),
      termMonths: Math.max(1, Number.parseInt(consolidationForm.termMonths, 10) || 1),
      originationFeeCents: parseCurrencyInput(consolidationForm.originationFee),
      feeTreatment: consolidationForm.feeTreatment,
      targetPaymentCents:
        consolidationForm.targetPayment.trim() === ''
          ? undefined
          : parseCurrencyInput(consolidationForm.targetPayment),
    };
    writeConsolidationScenario(storage, scenario);
  }, [consolidationForm, debts.length, effectiveConsolidationDebtIds, hasRestoredConsolidation]);

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

  const handleConsolidationFieldChange = useCallback(
    <K extends keyof ConsolidationFormState>(field: K, value: ConsolidationFormState[K]) => {
      setConsolidationForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const handleConsolidationDebtToggle = useCallback(
    (debtId: string, checked: boolean) => {
      setSelectedConsolidationDebtIds((current) => {
        const base = current.length === 0 ? eligibleConsolidationDebtIds : current;
        return checked
          ? Array.from(new Set([...base, debtId]))
          : base.filter((id) => id !== debtId);
      });
    },
    [eligibleConsolidationDebtIds],
  );

  const handleManualSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const balanceCents = parseCurrencyInput(manualForm.balance);
      const originalInput = parseCurrencyInput(manualForm.originalBalance);
      const minimumPaymentCents = parseCurrencyInput(manualForm.minimumPayment);

      const errors: Partial<Record<'name' | 'balance' | 'minimumPayment', string>> = {};
      if (!manualForm.name.trim()) {
        errors.name = 'Enter a name for this debt.';
      }
      if (!(balanceCents > 0)) {
        errors.balance = 'Enter a balance greater than $0.';
      }
      if (!(minimumPaymentCents > 0)) {
        errors.minimumPayment = 'Enter a minimum payment greater than $0.';
      }

      if (Object.keys(errors).length > 0) {
        setManualErrors(errors);
        if (errors.name) {
          manualNameRef.current?.focus();
        } else if (errors.balance) {
          manualBalanceRef.current?.focus();
        } else {
          manualMinimumRef.current?.focus();
        }
        return;
      }

      const debt: Debt = {
        id: createDebtId(),
        name: manualForm.name.trim(),
        balanceCents,
        originalBalanceCents: Math.max(balanceCents, originalInput || balanceCents),
        annualRateBps: parseRateInput(manualForm.rate),
        minimumPaymentCents,
        type: manualForm.type,
      };

      setManualErrors({});
      setManualDebts((current) => [...current, debt]);
      setManualForm(DEFAULT_DEBT_FORM);
    },
    [manualForm],
  );

  const manualErrorMessages = Object.values(manualErrors).filter((message): message is string =>
    Boolean(message),
  );

  return (
    <div className="payoff-planner">
      {debts.length === 0 ? (
        <EmptyState
          title="No debts added"
          description="Add your debts or connect debt accounts to compare payoff strategies and see how extra payments can save you money."
          action={
            <button
              type="button"
              onClick={() => {
                manualNameRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
                manualNameRef.current?.focus();
              }}
            >
              Add Debt
            </button>
          }
        />
      ) : (
        <>
          {activeResult &&
            (activeResult.fullyPaidOff ? (
              <section className="debt-hero" aria-label="Debt-free countdown">
                <div>
                  <p className="debt-hero__eyebrow">Debt-Free Date</p>
                  <h2>{formatCountdown(activeResult.totalMonths)}</h2>
                  <p>
                    Keep going. This plan points to{' '}
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
            ) : (
              <section
                className="debt-hero debt-hero--warning"
                aria-label="Payment does not cover interest"
              >
                <div role="alert">
                  <p className="debt-hero__eyebrow">Payment Too Low</p>
                  <h2>This plan never reaches debt-free</h2>
                  <p>
                    Your current payment doesn&rsquo;t cover the monthly interest on{' '}
                    {formatDebtNameList(underwaterDebts.map((debt) => debt.name))}, so the balance
                    keeps growing instead of shrinking. Increase your monthly payment to start
                    making real progress.
                  </p>
                </div>
                <ul className="debt-hero__underwater">
                  {underwaterDebts.map((debt) => (
                    <li key={debt.id}>
                      <span className="debt-hero__underwater-name">{debt.name}</span>: minimum{' '}
                      <CurrencyDisplay
                        amount={debt.minimumPaymentCents}
                        context="minimum payment"
                      />{' '}
                      vs.{' '}
                      <CurrencyDisplay
                        amount={calculateMonthlyInterestCents(
                          debt.balanceCents,
                          debt.annualRateBps,
                        )}
                        context="monthly interest"
                      />{' '}
                      interest each month
                    </li>
                  ))}
                </ul>
              </section>
            ))}

          {debtProgressRing && <ProgressRingCard card={debtProgressRing} />}

          <section aria-label="Debt milestones" className="debt-milestones">
            <div className="debt-milestones__summary">
              <h2>Debt Milestones</h2>
              {milestones.paidOffCents > 0 ? (
                <p>{milestones.percentPaidOff.toFixed(1)}% paid off. Every payment is progress.</p>
              ) : (
                <p>
                  Track payoff progress by setting each debt&rsquo;s starting balance. Every payment
                  is progress.
                </p>
              )}
              <label>
                Historical interest paid ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualInterestPaid}
                  onChange={(event) => setManualInterestPaid(event.target.value)}
                />
              </label>
              <dl className="debt-milestones__interest">
                <dt>Interest paid to date</dt>
                <dd>
                  <CurrencyDisplay
                    amount={milestones.totalInterestPaidToDateCents}
                    context="interest paid to date"
                  />
                </dd>
                <dt>Projected remaining interest</dt>
                <dd>
                  <CurrencyDisplay
                    amount={activeResult?.totalInterestCents ?? 0}
                    context="projected remaining interest"
                  />
                </dd>
              </dl>
              <p className="form-help">
                Share-safe copy: I have paid off {milestones.percentPaidOff.toFixed(1)}% of my
                starting debt and reached{' '}
                {milestones.milestones.filter((milestone) => milestone.isReached).length} milestone
                {milestones.milestones.filter((milestone) => milestone.isReached).length === 1
                  ? ''
                  : 's'}
                .
              </p>
            </div>
            <div>
              <p role="status" aria-live="polite" className="debt-milestones__celebration">
                {milestones.milestones.some((milestone) => milestone.isReached)
                  ? 'Milestones reached: ' +
                    milestones.milestones
                      .filter((milestone) => milestone.isReached)
                      .map((milestone) => milestone.thresholdPercent + '%')
                      .join(', ') +
                    '. Keep going!'
                  : 'Your first 10% milestone is on deck.'}
              </p>
              <ul role="list" className="debt-milestones__badges">
                {milestones.milestones.map((milestone) => (
                  <li
                    key={milestone.thresholdPercent}
                    className={
                      'debt-milestone ' + (milestone.isReached ? 'debt-milestone--reached' : '')
                    }
                  >
                    <span aria-hidden="true">{milestone.isReached ? '🏆' : '○'}</span>
                    <strong>{milestone.thresholdPercent}%</strong>
                    <span>{milestone.isReached ? 'Celebrated' : 'On deck'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section aria-label="Debt-to-income ratio" className="dti-card">
            <div className="dti-card__header">
              <div>
                <h2>Debt-to-Income Trend</h2>
                <p>
                  {dti.isImproving
                    ? 'Your required debt payments trend downward as balances disappear.'
                    : 'Add income or payoff progress to see the trend improve.'}{' '}
                  Ratios use minimum required debt payments; accelerated payments affect when debts
                  disappear.
                </p>
              </div>
              <div className="dti-card__inputs">
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
                <label>
                  Annual raise (%)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={dtiAnnualRaise}
                    onChange={(event) => setDtiAnnualRaise(event.target.value)}
                  />
                </label>
                <label>
                  Target DTI (%)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={dtiTarget}
                    onChange={(event) => setDtiTarget(event.target.value)}
                  />
                </label>
              </div>
            </div>
            <dl className="dti-card__stats">
              <dt>DTI ratio</dt>
              <dd>{dti.currentRatioPercent.toFixed(1)}%</dd>
              <dt>Projected final DTI</dt>
              <dd>{dti.projectedFinalRatioPercent.toFixed(1)}%</dd>
              <dt>Threshold crossings</dt>
              <dd>
                {dti.thresholdCrossings
                  .map((crossing) =>
                    crossing.month === null
                      ? crossing.thresholdPercent + '%: not reached'
                      : crossing.thresholdPercent + '%: month ' + crossing.month,
                  )
                  .join(' · ')}
              </dd>
            </dl>
            <div className="dti-table-wrap">
              <table className="dti-table">
                <caption>Full monthly debt-to-income projection</caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Required debt payments</th>
                    <th scope="col">Income</th>
                    <th scope="col">DTI</th>
                    <th scope="col">Thresholds met</th>
                  </tr>
                </thead>
                <tbody>
                  {dti.trend.map((point) => (
                    <tr key={point.month}>
                      <td>{point.month}</td>
                      <td>
                        <CurrencyDisplay
                          amount={point.requiredDebtPaymentCents}
                          context="required debt payments"
                        />
                      </td>
                      <td>
                        <CurrencyDisplay
                          amount={point.monthlyIncomeCents}
                          context="monthly income"
                        />
                      </td>
                      <td>{point.ratioPercent.toFixed(1)}%</td>
                      <td>
                        {point.thresholdStatuses
                          .filter((status) => status.isAtOrBelow)
                          .map((status) => status.thresholdPercent + '%')
                          .join(', ') || 'None'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                {(debt.originalBalanceCents ?? debt.balanceCents) <= debt.balanceCents && (
                  <p className="form-help debt-import-list__hint">
                    Defaults to your current balance. Enter your original balance to track payoff
                    progress.
                  </p>
                )}
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
                        rateEstimated: false,
                      })
                    }
                  />
                </label>
                {debt.rateEstimated && (
                  <p className="form-help debt-import-list__hint">
                    Estimated APR — confirm your real rate for an accurate payoff date.
                  </p>
                )}
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
                        minimumEstimated: false,
                      })
                    }
                  />
                </label>
                {debt.minimumEstimated && (
                  <p className="form-help debt-import-list__hint">
                    Estimated minimum payment — confirm it to plan accurately.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Manual debt entry">
        <h2>Add Debt Manually</h2>
        {manualErrorMessages.length > 0 ? (
          <div role="alert" className="debt-entry-form__error-summary">
            Please fix the following before adding this debt: {manualErrorMessages.join(' ')}
          </div>
        ) : null}
        <form className="debt-entry-form" onSubmit={handleManualSubmit} noValidate>
          <label>
            Debt name
            <input
              ref={manualNameRef}
              type="text"
              value={manualForm.name}
              onChange={(event) => handleManualFieldChange('name', event.target.value)}
              required
              aria-invalid={manualErrors.name ? true : undefined}
              aria-describedby={manualErrors.name ? 'manual-debt-name-error' : undefined}
            />
          </label>
          {manualErrors.name ? (
            <span id="manual-debt-name-error" className="debt-entry-form__error">
              {manualErrors.name}
            </span>
          ) : null}
          <label>
            Debt balance ($)
            <input
              ref={manualBalanceRef}
              type="number"
              min="0"
              step="0.01"
              value={manualForm.balance}
              onChange={(event) => handleManualFieldChange('balance', event.target.value)}
              required
              aria-invalid={manualErrors.balance ? true : undefined}
              aria-describedby={manualErrors.balance ? 'manual-debt-balance-error' : undefined}
            />
          </label>
          {manualErrors.balance ? (
            <span id="manual-debt-balance-error" className="debt-entry-form__error">
              {manualErrors.balance}
            </span>
          ) : null}
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
              ref={manualMinimumRef}
              type="number"
              min="0"
              step="0.01"
              value={manualForm.minimumPayment}
              onChange={(event) => handleManualFieldChange('minimumPayment', event.target.value)}
              required
              aria-invalid={manualErrors.minimumPayment ? true : undefined}
              aria-describedby={
                manualErrors.minimumPayment ? 'manual-debt-minimum-error' : undefined
              }
            />
          </label>
          {manualErrors.minimumPayment ? (
            <span id="manual-debt-minimum-error" className="debt-entry-form__error">
              {manualErrors.minimumPayment}
            </span>
          ) : null}
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

          <section aria-label="Consolidation offer comparison" className="debt-beta-panel">
            <h2>Consolidation Offer Beta</h2>
            {consolidationRestoreMessage && (
              <p className="form-help">{consolidationRestoreMessage}</p>
            )}
            <div className="debt-beta-form">
              <label>
                Offer APR (%)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={consolidationForm.annualRate}
                  onChange={(event) =>
                    handleConsolidationFieldChange('annualRate', event.target.value)
                  }
                />
              </label>
              <label>
                Term (months)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={consolidationForm.termMonths}
                  onChange={(event) =>
                    handleConsolidationFieldChange('termMonths', event.target.value)
                  }
                />
              </label>
              <label>
                Origination fee ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={consolidationForm.originationFee}
                  onChange={(event) =>
                    handleConsolidationFieldChange('originationFee', event.target.value)
                  }
                />
              </label>
              <label>
                Fee treatment
                <select
                  value={consolidationForm.feeTreatment}
                  onChange={(event) =>
                    handleConsolidationFieldChange(
                      'feeTreatment',
                      event.target.value as ConsolidationFeeTreatment,
                    )
                  }
                >
                  <option value="paid_upfront">Paid upfront</option>
                  <option value="financed">Financed</option>
                </select>
              </label>
              <label>
                Optional target payment ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={consolidationForm.targetPayment}
                  onChange={(event) =>
                    handleConsolidationFieldChange('targetPayment', event.target.value)
                  }
                />
              </label>
            </div>
            <fieldset className="debt-checkbox-list">
              <legend>Eligible debts to consolidate</legend>
              <button type="button" onClick={() => setSelectedConsolidationDebtIds([])}>
                Select all debts
              </button>
              {debts.map((debt) => (
                <label key={debt.id}>
                  <input
                    type="checkbox"
                    checked={effectiveConsolidationDebtIds.includes(debt.id)}
                    onChange={(event) =>
                      handleConsolidationDebtToggle(debt.id, event.target.checked)
                    }
                  />
                  {debt.name}
                </label>
              ))}
            </fieldset>
            {consolidationPanelModel && (
              <dl className="debt-beta-stats">
                <dt>Payment</dt>
                <dd>
                  <CurrencyDisplay
                    amount={consolidationPanelModel.paymentCents}
                    context="payment"
                  />
                </dd>
                <dt>Total paid</dt>
                <dd>
                  <CurrencyDisplay
                    amount={consolidationPanelModel.totalPaidCents}
                    context="total paid"
                  />
                </dd>
                <dt>Interest</dt>
                <dd>
                  <CurrencyDisplay
                    amount={consolidationPanelModel.interestCents}
                    context="interest"
                  />
                </dd>
                <dt>
                  Payoff months{' '}
                  <ExplainThis glossaryKey="amortization" buttonLabel="Explain amortizing" />
                </dt>
                <dd>{consolidationPanelModel.payoffMonths ?? 'Not amortizing'}</dd>
                <dt>Fees</dt>
                <dd>
                  <CurrencyDisplay amount={consolidationPanelModel.feesCents} context="fees" />
                </dd>
                <dt>Recommendation</dt>
                <dd>{consolidationPanelModel.recommendationSummary}</dd>
              </dl>
            )}
            {consolidationPanelModel && consolidationPanelModel.flags.length > 0 && (
              <ul role="list" className="debt-beta-list" aria-label="Consolidation flags">
                {consolidationPanelModel.flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            )}
            {consolidationPanelModel && (
              <p className="form-help">
                Assumptions: {consolidationPanelModel.assumptions.join(' ')}
              </p>
            )}
          </section>

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
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-2)',
                      }}
                    >
                      {formatRateBps(debt.annualRateBps)} APR
                      <ExplainThis tipKey="aprVsApy" buttonLabel="Explain APR versus APY" />
                    </span>
                    <CurrencyDisplay amount={debt.minimumPaymentCents} context="minimum payment" />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {comparison && (
            <section aria-label="Strategy comparison">
              <h2>Strategy Comparison</h2>
              {recommendation && (
                <article className="strategy-recommendation" aria-live="polite">
                  <h3>Recommended: {formatStrategyName(recommendation.recommendedStrategy)}</h3>
                  <p>{recommendation.recommendationReason}</p>
                  <p>{recommendation.snowballMotivationNote}</p>
                  <p>
                    Minimum-only baseline for {formatStrategyName(activeStrategy)}:{' '}
                    {minimumOnlyResult?.totalMonths ?? 0}{' '}
                    {pluralize(minimumOnlyResult?.totalMonths ?? 0, 'month')} and{' '}
                    <CurrencyDisplay
                      amount={minimumOnlyResult?.totalInterestCents ?? 0}
                      context="minimum only interest"
                    />{' '}
                    in interest.
                  </p>
                </article>
              )}
              <div className="strategy-comparison">
                <StrategyCard
                  title="Avalanche (Highest Rate First)"
                  result={comparison.avalanche}
                  recommended={recommendation?.recommendedStrategy === 'avalanche'}
                  baselineMonths={
                    minimumOnlyResult?.totalMonths ?? comparison.avalanche.totalMonths
                  }
                  todayIso={todayIso}
                />
                <StrategyCard
                  title="Snowball (Smallest Balance First)"
                  result={comparison.snowball}
                  recommended={recommendation?.recommendedStrategy === 'snowball'}
                  baselineMonths={minimumOnlyResult?.totalMonths ?? comparison.snowball.totalMonths}
                  todayIso={todayIso}
                />
              </div>
              <p className="strategy-savings" aria-live="polite">
                Your {activeStrategy} plan saves{' '}
                <CurrencyDisplay amount={interestSavedCents} context="interest savings" /> in
                interest versus minimum-only payments and reaches debt-free{' '}
                {Math.max(
                  0,
                  (minimumOnlyResult?.totalMonths ?? 0) - (activeResult?.totalMonths ?? 0),
                )}{' '}
                month
                {Math.max(
                  0,
                  (minimumOnlyResult?.totalMonths ?? 0) - (activeResult?.totalMonths ?? 0),
                ) === 1
                  ? ''
                  : 's'}{' '}
                sooner.
              </p>
            </section>
          )}

          <section aria-label="Extra-payment impact visualizer" className="extra-payment-impact">
            <div className="extra-payment-impact__header">
              <div>
                <h2>Extra-Payment Impact</h2>
                <p>
                  Compare custom monthly extras without changing the active{' '}
                  {formatStrategyName(activeStrategy)} plan.
                </p>
              </div>
              <label>
                Scenarios ($, comma separated)
                <input
                  type="text"
                  value={impactScenarioInput}
                  onChange={(event) => setImpactScenarioInput(event.target.value)}
                />
              </label>
            </div>
            {diminishingReturnScenario && (
              <p className="form-help" role="status">
                Diminishing returns begin around{' '}
                <CurrencyDisplay
                  amount={diminishingReturnScenario.extraPaymentCents}
                  context="diminishing return extra payment"
                />{' '}
                extra/month because incremental interest savings taper.
              </p>
            )}
            <div className="extra-payment-impact__table-wrap">
              <table className="extra-payment-impact__table">
                <caption>Extra monthly payment scenarios versus minimum-only payoff</caption>
                <thead>
                  <tr>
                    <th scope="col">Extra/month</th>
                    <th scope="col">Debt-free date</th>
                    <th scope="col">Months saved</th>
                    <th scope="col">Interest saved</th>
                    <th scope="col">Total paid</th>
                  </tr>
                </thead>
                <tbody>
                  {extraPaymentScenarios.map((scenario) => (
                    <tr key={scenario.extraPaymentCents}>
                      <td>
                        <CurrencyDisplay
                          amount={scenario.extraPaymentCents}
                          context="extra payment"
                        />
                      </td>
                      <td>{formatMonthYear(addMonthsToIsoDate(todayIso, scenario.totalMonths))}</td>
                      <td>{scenario.monthsSaved}</td>
                      <td>
                        <CurrencyDisplay
                          amount={scenario.interestSavedCents}
                          context="scenario interest saved"
                        />
                      </td>
                      <td>
                        <CurrencyDisplay
                          amount={scenario.totalPaidCents}
                          context="scenario total paid"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress ring sub-component (#2440)
// ---------------------------------------------------------------------------

function ProgressRingCard({ card }: { card: DebtProgressRingCard }): React.ReactElement {
  const circumference = 2 * Math.PI * 44;
  const dashOffset = circumference * (1 - card.percent / 100);

  return (
    <article className="debt-progress-ring-card" aria-label={card.ariaLabel}>
      <svg
        className="debt-progress-ring"
        viewBox="0 0 120 120"
        aria-hidden="true"
        focusable="false"
      >
        <circle className="debt-progress-ring__track" cx="60" cy="60" r="44" />
        <circle
          className="debt-progress-ring__value"
          cx="60"
          cy="60"
          r="44"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
        <text x="60" y="64" textAnchor="middle">
          {Math.round(card.percent)}%
        </text>
      </svg>
      <div>
        <h2>{card.title}</h2>
        <p className="debt-progress-ring-card__primary">{card.primaryText}</p>
        <p>{card.secondaryText}</p>
        <ul role="list">
          {card.detailItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Strategy card sub-component
// ---------------------------------------------------------------------------

interface StrategyCardProps {
  title: string;
  result: StrategyComparison['avalanche'];
  recommended: boolean;
  baselineMonths: number;
  todayIso: string;
}

function StrategyCard({
  title,
  result,
  recommended,
  baselineMonths,
  todayIso,
}: StrategyCardProps): React.ReactElement {
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
        <dt>Payoff Date</dt>
        <dd>{formatMonthYear(addMonthsToIsoDate(todayIso, result.totalMonths))}</dd>
        <dt>Months Saved</dt>
        <dd>{Math.max(0, baselineMonths - result.totalMonths)}</dd>
        <dt>Payoff Order</dt>
        <dd>
          <ol>
            {result.schedules.map((s) => (
              <li key={s.debtId}>
                {s.debtName}: {s.monthsToPayoff} {pluralize(s.monthsToPayoff, 'month')}
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
  const [obligations, setObligations] = useState<BnplObligation[]>(() => {
    const storage = getLocalStorage();
    return storage ? [...readBnplObligations(storage)] : [];
  });
  const [formState, setFormState] = useState<BnplFormState>(DEFAULT_BNPL_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const monthlyIncomeCents = 500_000;
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const aggregation = useMemo(
    () => aggregateBnplDashboard({ obligations, monthlyIncomeCents, todayIso }),
    [monthlyIncomeCents, obligations, todayIso],
  );
  const summary = aggregation.summary;
  const alerts = aggregation.alerts;
  const riskScore = aggregation.riskScore;

  useEffect(() => {
    const storage = getLocalStorage();
    if (storage) writeBnplObligations(storage, obligations);
  }, [obligations]);

  const handleFieldChange = useCallback(
    <K extends keyof BnplFormState>(field: K, value: BnplFormState[K]) => {
      setFormState((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const buildDraft = useCallback(
    (): BnplObligationDraft => ({
      id: formState.id || createBnplId(),
      merchantName: formState.merchantName,
      originalAmountCents: parseCurrencyInput(formState.originalAmount),
      totalInstallments: Number.parseInt(formState.totalInstallments, 10) || 0,
      paidInstallments: Number.parseInt(formState.paidInstallments, 10) || 0,
      installmentAmountCents: parseCurrencyInput(formState.installmentAmount),
      annualRateBps: parseRateInput(formState.annualRate),
      totalFeesCents: parseCurrencyInput(formState.totalFees),
      firstDueDateIso: formState.firstDueDate,
      cadenceDays: Number.parseInt(formState.cadenceDays, 10) || 14,
    }),
    [formState],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const draft = buildDraft();
      const validation = validateBnplObligationDraft(draft);
      setFormErrors([...validation.errors]);
      if (!validation.isValid) return;
      setObligations((current) => [...upsertBnplObligationFromDraft(current, draft)]);
      setFormState(DEFAULT_BNPL_FORM);
    },
    [buildDraft],
  );

  const handleEdit = useCallback(
    (obligation: BnplObligation) => {
      setFormState({
        id: obligation.id,
        merchantName: obligation.merchantName,
        originalAmount: centsToInputValue(obligation.originalAmountCents),
        totalInstallments: String(obligation.totalInstallments),
        paidInstallments: String(obligation.paidInstallments),
        installmentAmount: centsToInputValue(obligation.installmentAmountCents),
        annualRate: bpsToInputValue(obligation.annualRateBps),
        totalFees: centsToInputValue(obligation.totalFeesCents),
        firstDueDate: obligation.upcomingDueDates[0] ?? todayIso,
        cadenceDays: '14',
      });
    },
    [todayIso],
  );

  const handleMarkPaid = useCallback((obligationId: string) => {
    setObligations((current) => [...markBnplInstallmentPaidById(current, obligationId)]);
  }, []);

  return (
    <div className="bnpl-dashboard">
      {obligations.length === 0 && (
        <EmptyState
          title="No BNPL obligations"
          description="Track your Buy Now Pay Later purchases to see total exposure and detect payment conflicts."
          action={<button type="button">Add BNPL Purchase</button>}
        />
      )}

      <section aria-label="BNPL obligation entry" className="debt-beta-panel">
        <h2>{formState.id ? 'Edit BNPL Purchase' : 'Add BNPL Purchase'}</h2>
        {formErrors.length > 0 && (
          <ul role="alert" className="debt-beta-list">
            {formErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        <form className="debt-beta-form" onSubmit={handleSubmit} noValidate>
          <label>
            Merchant
            <input
              type="text"
              value={formState.merchantName}
              onChange={(event) => handleFieldChange('merchantName', event.target.value)}
            />
          </label>
          <label>
            Original amount ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.originalAmount}
              onChange={(event) => handleFieldChange('originalAmount', event.target.value)}
            />
          </label>
          <label>
            Installments
            <input
              type="number"
              min="0"
              step="1"
              value={formState.totalInstallments}
              onChange={(event) => handleFieldChange('totalInstallments', event.target.value)}
            />
          </label>
          <label>
            Paid installments
            <input
              type="number"
              min="0"
              step="1"
              value={formState.paidInstallments}
              onChange={(event) => handleFieldChange('paidInstallments', event.target.value)}
            />
          </label>
          <label>
            Installment amount ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.installmentAmount}
              onChange={(event) => handleFieldChange('installmentAmount', event.target.value)}
            />
          </label>
          <label>
            Fees ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.totalFees}
              onChange={(event) => handleFieldChange('totalFees', event.target.value)}
            />
          </label>
          <label>
            APR (%)
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.annualRate}
              onChange={(event) => handleFieldChange('annualRate', event.target.value)}
            />
          </label>
          <label>
            First remaining due date
            <input
              type="date"
              value={formState.firstDueDate}
              onChange={(event) => handleFieldChange('firstDueDate', event.target.value)}
            />
          </label>
          <label>
            Cadence days
            <input
              type="number"
              min="1"
              step="1"
              value={formState.cadenceDays}
              onChange={(event) => handleFieldChange('cadenceDays', event.target.value)}
            />
          </label>
          <button type="submit">
            {formState.id ? 'Update BNPL Purchase' : 'Add BNPL Purchase'}
          </button>
        </form>
      </section>

      {obligations.length > 0 && (
        <>
          <section aria-label="BNPL risk assessment">
            <div
              className={`risk-badge risk-badge--${riskScore.category}`}
              role="status"
              aria-live="polite"
            >
              <span className="risk-badge__score">{riskScore.score}</span>
              <span className="risk-badge__label">
                BNPL Risk:{' '}
                {riskScore.category.charAt(0).toUpperCase() + riskScore.category.slice(1)}
              </span>
            </div>
            {riskScore.factors.length > 0 && (
              <ul className="risk-factors" role="list" aria-label="Risk factors">
                {riskScore.factors.map((factor) => (
                  <li key={factor} role="listitem">
                    {factor}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {alerts.length > 0 && (
            <section aria-label="BNPL alerts">
              <h2>Alerts</h2>
              <ul role="list" className="bnpl-alerts">
                {alerts.map((alert) => (
                  <li
                    key={alert.message}
                    role="listitem"
                    className={`bnpl-alert bnpl-alert--${alert.level}`}
                  >
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
                <CurrencyDisplay
                  amount={summary.totalOutstandingCents}
                  context="total outstanding"
                />
              </dd>
              <dt>Monthly Commitment</dt>
              <dd>
                <CurrencyDisplay
                  amount={summary.monthlyCommitmentCents}
                  context="monthly commitment"
                />
              </dd>
              <dt>Total Fees Paid</dt>
              <dd>
                <CurrencyDisplay amount={summary.totalFeesCents} context="total fees" />
              </dd>
              <dt>Completed obligations</dt>
              <dd>{aggregation.completedObligations.length}</dd>
            </dl>
            <p className="form-help">{aggregation.assumptions.join(' ')}</p>
          </section>

          <section aria-label="BNPL obligations">
            <h2>Obligations</h2>
            <ul role="list" className="bnpl-list">
              {obligations.map((obligation) => (
                <li key={obligation.id} role="listitem" className="bnpl-list__item">
                  <div className="bnpl-list__merchant">{obligation.merchantName}</div>
                  <div className="bnpl-list__details">
                    <CurrencyDisplay
                      amount={obligation.remainingBalanceCents}
                      context={`${obligation.merchantName} remaining`}
                    />
                    <span>
                      {obligation.paidInstallments}/{obligation.totalInstallments} payments
                    </span>
                    {obligation.upcomingDueDates[0] && (
                      <span>Next due: {obligation.upcomingDueDates[0]}</span>
                    )}
                    <button type="button" onClick={() => handleEdit(obligation)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleMarkPaid(obligation.id)}>
                      Mark next paid
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
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
  const [refinanceForm, setRefinanceForm] = useState<RefinanceFormState>(DEFAULT_REFINANCE_FORM);
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
  const studentLoanProgressRing = useMemo(
    () =>
      loans.length > 0
        ? buildStudentLoanProgressRingCard({
            summary,
            interestSavedCents: whatIfScenario.interestSavedCents,
          })
        : null,
    [loans.length, summary, whatIfScenario.interestSavedCents],
  );
  const refinanceBaselineOptions = useMemo(
    () =>
      buildRefinanceBaselineOptions({
        loans,
        studentLoanSummary: summary,
        selectedPayoffStrategyPaymentCents: whatIfScenario.newMonthlyPaymentCents,
      }),
    [loans, summary, whatIfScenario.newMonthlyPaymentCents],
  );
  const refinanceBaselinePaymentCents = resolveRefinanceBaselinePaymentCents(
    refinanceBaselineOptions,
    refinanceForm.baselineId,
  );
  const refinanceBreakEven = useMemo(
    () =>
      loans.length > 0
        ? calculateRefinanceBreakEven({
            loans,
            refinanceAnnualRateBps: parseRateInput(refinanceForm.annualRate),
            refinanceTermMonths: Math.max(1, Number.parseInt(refinanceForm.termMonths, 10) || 1),
            originationFeeCents: parseCurrencyInput(refinanceForm.originationFee),
            monthlyPaymentOverrideCents:
              refinanceForm.paymentOverride.trim() === ''
                ? undefined
                : parseCurrencyInput(refinanceForm.paymentOverride),
            currentMonthlyPaymentOverrideCents: refinanceBaselinePaymentCents,
            feesFinanced: refinanceForm.feesFinanced,
          })
        : null,
    [loans, refinanceBaselinePaymentCents, refinanceForm],
  );
  const refinancePanelModel = useMemo(
    () => (refinanceBreakEven ? buildRefinanceBreakEvenPanelModel(refinanceBreakEven) : null),
    [refinanceBreakEven],
  );

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

  const handleRefinanceFieldChange = useCallback(
    <K extends keyof RefinanceFormState>(field: K, value: RefinanceFormState[K]) => {
      setRefinanceForm((current) => ({ ...current, [field]: value }));
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
                <h3>
                  Estimated Payoff{' '}
                  <ExplainThis glossaryKey="amortization" buttonLabel="Explain amortizing" />
                </h3>
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

          {studentLoanProgressRing && <ProgressRingCard card={studentLoanProgressRing} />}

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

          <section aria-label="Refinance break-even comparison" className="debt-beta-panel">
            <h2>Refinance Break-Even Beta</h2>
            <div className="debt-beta-form">
              <label>
                Compare against
                <select
                  value={refinanceForm.baselineId}
                  onChange={(event) =>
                    handleRefinanceFieldChange(
                      'baselineId',
                      event.target.value as RefinanceBaselineId,
                    )
                  }
                >
                  {refinanceBaselineOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Break-even APR (%)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={refinanceForm.annualRate}
                  onChange={(event) => handleRefinanceFieldChange('annualRate', event.target.value)}
                />
              </label>
              <label>
                Term (months)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={refinanceForm.termMonths}
                  onChange={(event) => handleRefinanceFieldChange('termMonths', event.target.value)}
                />
              </label>
              <label>
                Fees ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={refinanceForm.originationFee}
                  onChange={(event) =>
                    handleRefinanceFieldChange('originationFee', event.target.value)
                  }
                />
              </label>
              <label>
                Optional payment override ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={refinanceForm.paymentOverride}
                  onChange={(event) =>
                    handleRefinanceFieldChange('paymentOverride', event.target.value)
                  }
                />
              </label>
              <label className="student-loan-checkbox">
                <input
                  type="checkbox"
                  checked={refinanceForm.feesFinanced}
                  onChange={(event) =>
                    handleRefinanceFieldChange('feesFinanced', event.target.checked)
                  }
                />
                Finance fees into principal
              </label>
            </div>
            {refinancePanelModel && (
              <>
                <dl className="debt-beta-stats">
                  <dt>Monthly savings</dt>
                  <dd>
                    <CurrencyDisplay
                      amount={refinancePanelModel.monthlySavingsCents}
                      context="monthly savings"
                      colorize
                    />
                  </dd>
                  <dt>Total interest savings</dt>
                  <dd>
                    <CurrencyDisplay
                      amount={refinancePanelModel.totalInterestSavingsCents}
                      context="interest savings"
                      colorize
                    />
                  </dd>
                  <dt>Total cost savings</dt>
                  <dd>
                    <CurrencyDisplay
                      amount={refinancePanelModel.totalCostSavingsCents}
                      context="total cost savings"
                      colorize
                    />
                  </dd>
                  <dt>
                    Payoff-date change{' '}
                    <ExplainThis glossaryKey="amortization" buttonLabel="Explain amortizing" />
                  </dt>
                  <dd>
                    {refinancePanelModel.payoffMonthsDifference === null
                      ? 'Not amortizing'
                      : `${refinancePanelModel.payoffMonthsDifference} ${pluralize(refinancePanelModel.payoffMonthsDifference, 'month')}`}
                  </dd>
                  <dt>Break-even month</dt>
                  <dd>{refinancePanelModel.breakEvenMonth ?? 'No break-even'}</dd>
                  <dt>Recommendation</dt>
                  <dd>{refinancePanelModel.recommendation}</dd>
                </dl>
                {refinancePanelModel.warnings.length > 0 && (
                  <ul role="list" className="debt-beta-list" aria-label="Refinance warnings">
                    {refinancePanelModel.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
                <p className="form-help">
                  Assumptions: {refinancePanelModel.assumptions.join(' ')} This is not legal or
                  credit advice.
                </p>
              </>
            )}
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
                    <dt>
                      Payoff time{' '}
                      <ExplainThis glossaryKey="amortization" buttonLabel="Explain amortizing" />
                    </dt>
                    <dd>
                      {scenario.monthsToPayoff === null
                        ? 'Not amortizing'
                        : `${scenario.monthsToPayoff} ${pluralize(scenario.monthsToPayoff, 'month')}`}
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
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [cardForm, setCardForm] = useState<CreditCardFormState>(DEFAULT_CREDIT_CARD_FORM);
  const [creditScoreForm, setCreditScoreForm] =
    useState<CreditScoreSimulatorFormState>(DEFAULT_CREDIT_SCORE_FORM);
  const checkingBalanceCents = 0;
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const summary = useMemo(
    () => calculateReservationSummary(checkingBalanceCents, cards, today),
    [cards, today],
  );
  const utilization = useMemo(() => calculateCreditUtilizationSummary(cards), [cards]);
  const creditScoreSimulator = useMemo(() => {
    const targetCardId = creditScoreForm.targetCardId || cards[0]?.id || '';
    return buildCreditScoreSimulatorPanelModel(cards, {
      targetCardId,
      targetUtilizationPercent: Number.parseFloat(creditScoreForm.targetUtilization) || 0,
      plannedPaymentCents: parseCurrencyInput(creditScoreForm.plannedPayment),
      onTimePaymentMonths: Number.parseInt(creditScoreForm.onTimePaymentMonths, 10) || 0,
      hardInquiries: Number.parseInt(creditScoreForm.hardInquiries, 10) || 0,
      closeAccountIds: creditScoreForm.closeAccountId ? [creditScoreForm.closeAccountId] : [],
    });
  }, [cards, creditScoreForm]);
  const creditScoreAssumptions = useMemo(
    () => buildCreditScoreAssumptionSummary(cards, creditScoreSimulator.result),
    [cards, creditScoreSimulator.result],
  );

  const handleCardFieldChange = useCallback(
    <K extends keyof CreditCardFormState>(field: K, value: CreditCardFormState[K]) => {
      setCardForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const handleCreditScoreFieldChange = useCallback(
    <K extends keyof CreditScoreSimulatorFormState>(
      field: K,
      value: CreditScoreSimulatorFormState[K],
    ) => {
      setCreditScoreForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const handleCardSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const card: CreditCard = {
        id: createCreditCardId(),
        name: cardForm.name.trim(),
        balanceCents: parseCurrencyInput(cardForm.balance),
        creditLimitCents: parseCurrencyInput(cardForm.creditLimit),
        minimumPaymentCents: parseCurrencyInput(cardForm.minimumPayment),
        dueDate: cardForm.dueDate,
        annualRateBps: parseRateInput(cardForm.rate),
        statementDate: cardForm.statementDate,
      };

      if (!card.name || card.balanceCents < 0 || card.minimumPaymentCents < 0) return;
      setCards((current) => [...current, card]);
      setCardForm(DEFAULT_CREDIT_CARD_FORM);
    },
    [cardForm],
  );

  return (
    <div className="credit-card-dashboard">
      {cards.length === 0 ? (
        <EmptyState
          title="No credit cards"
          description="Add your credit cards to track balances, reserve funds for payments, get due date reminders, and monitor utilization before statement close."
          action={<button type="button">Add Credit Card</button>}
        />
      ) : (
        <>
          <section aria-label="Credit utilization overview" className="credit-utilization-overview">
            <h2>Credit Utilization</h2>
            <dl className="balance-summary">
              <dt>Overall utilization</dt>
              <dd>
                {utilization.aggregateUtilizationPercent === null
                  ? 'Add credit limits'
                  : utilization.aggregateUtilizationPercent.toFixed(1) + '%'}
              </dd>
              <dt>Status</dt>
              <dd>{utilization.aggregateStatus.replace('_', ' ')}</dd>
              <dt>Thresholds</dt>
              <dd>
                Warning {utilization.thresholds.warningPercent}%, high{' '}
                {utilization.thresholds.highPercent}%, critical{' '}
                {utilization.thresholds.criticalPercent}%
              </dd>
            </dl>
            {utilization.unknownLimitCount > 0 && (
              <p role="alert" className="form-help">
                {utilization.unknownLimitCount} card
                {utilization.unknownLimitCount === 1 ? '' : 's'} need a credit limit before
                utilization can be calculated.
              </p>
            )}
            <ul role="list" className="credit-utilization-list">
              {utilization.cards.map((card) => (
                <li
                  key={card.cardId}
                  className={'credit-utilization credit-utilization--' + card.status}
                >
                  <strong>{card.cardName}</strong>
                  <span>
                    {card.utilizationPercent === null
                      ? 'Limit needed'
                      : card.utilizationPercent.toFixed(1) + '% utilized'}
                  </span>
                  <span>Statement closes: {card.statementDate || 'Not set'}</span>
                  <span>{card.message}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Credit-score impact simulator" className="debt-beta-panel">
            <h2>Credit-Score Impact Simulator</h2>
            <p className="form-help">{creditScoreSimulator.result.disclaimer}</p>
            <div className="debt-beta-form">
              <label>
                Card to pay down
                <select
                  value={creditScoreForm.targetCardId || cards[0]?.id || ''}
                  onChange={(event) =>
                    handleCreditScoreFieldChange('targetCardId', event.target.value)
                  }
                >
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Target utilization (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={creditScoreForm.targetUtilization}
                  onChange={(event) =>
                    handleCreditScoreFieldChange('targetUtilization', event.target.value)
                  }
                />
              </label>
              <label>
                Planned payment ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={creditScoreForm.plannedPayment}
                  onChange={(event) =>
                    handleCreditScoreFieldChange('plannedPayment', event.target.value)
                  }
                />
              </label>
              <label>
                On-time payment streak (months)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={creditScoreForm.onTimePaymentMonths}
                  onChange={(event) =>
                    handleCreditScoreFieldChange('onTimePaymentMonths', event.target.value)
                  }
                />
              </label>
              <label>
                New hard inquiries
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={creditScoreForm.hardInquiries}
                  onChange={(event) =>
                    handleCreditScoreFieldChange('hardInquiries', event.target.value)
                  }
                />
              </label>
              <label>
                Modeled closure
                <select
                  value={creditScoreForm.closeAccountId}
                  onChange={(event) =>
                    handleCreditScoreFieldChange('closeAccountId', event.target.value)
                  }
                >
                  <option value="">No closure</option>
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      Close {card.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <dl className="debt-beta-stats">
              <dt>Modeled payment</dt>
              <dd>
                <CurrencyDisplay
                  amount={creditScoreSimulator.modeledPaymentCents}
                  context="modeled payment"
                />
              </dd>
              <dt>Target payment needed</dt>
              <dd>
                {creditScoreSimulator.targetPaymentCents === null ? (
                  'Add credit limit'
                ) : (
                  <CurrencyDisplay
                    amount={creditScoreSimulator.targetPaymentCents}
                    context="target payment"
                  />
                )}
              </dd>
              <dt>Overall direction</dt>
              <dd>{creditScoreSimulator.result.overallDirection}</dd>
            </dl>
            <ul role="list" className="debt-beta-list" aria-label="Score factor directions">
              {creditScoreSimulator.result.factorImpacts.map((impact) => (
                <li key={impact.factor}>
                  <strong>{impact.factor.replace(/_/g, ' ')}:</strong> {impact.direction}.{' '}
                  {impact.explanation}
                </li>
              ))}
            </ul>
            {creditScoreAssumptions.missingStates.length > 0 && (
              <ul role="list" className="debt-beta-list" aria-label="Credit score missing data">
                {creditScoreAssumptions.missingStates.map((state) => (
                  <li key={state}>{state}</li>
                ))}
              </ul>
            )}
            <p className="form-help">
              Known inputs: {creditScoreAssumptions.knownFromApp.join(', ') || 'None yet'}.
              Assumptions: {creditScoreAssumptions.assumptions.join(' ')}
            </p>
          </section>

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
                {summary.alerts.map((alert) => (
                  <li
                    key={alert.cardId + alert.type}
                    role="listitem"
                    className={'payment-alert payment-alert--' + alert.type}
                  >
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
                      context={res.cardName + ' reserved'}
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
        </>
      )}

      <section aria-label="Add credit card" className="credit-card-form-section">
        <h2>Add Credit Card</h2>
        <form className="credit-card-form" onSubmit={handleCardSubmit} noValidate>
          <label>
            Card name
            <input
              type="text"
              value={cardForm.name}
              onChange={(event) => handleCardFieldChange('name', event.target.value)}
              required
            />
          </label>
          <label>
            Balance ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={cardForm.balance}
              onChange={(event) => handleCardFieldChange('balance', event.target.value)}
              required
            />
          </label>
          <label>
            Credit limit ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={cardForm.creditLimit}
              onChange={(event) => handleCardFieldChange('creditLimit', event.target.value)}
            />
          </label>
          <label>
            Minimum payment ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={cardForm.minimumPayment}
              onChange={(event) => handleCardFieldChange('minimumPayment', event.target.value)}
              required
            />
          </label>
          <label>
            APR (%)
            <input
              type="number"
              min="0"
              step="0.01"
              value={cardForm.rate}
              onChange={(event) => handleCardFieldChange('rate', event.target.value)}
            />
          </label>
          <label>
            Due date
            <input
              type="date"
              value={cardForm.dueDate}
              onChange={(event) => handleCardFieldChange('dueDate', event.target.value)}
            />
          </label>
          <label>
            Statement date
            <input
              type="date"
              value={cardForm.statementDate}
              onChange={(event) => handleCardFieldChange('statementDate', event.target.value)}
            />
          </label>
          <button type="submit">Add Credit Card</button>
        </form>
      </section>
    </div>
  );
}

export default DebtPage;
