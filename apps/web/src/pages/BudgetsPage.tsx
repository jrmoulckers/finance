// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BudgetAnalytics } from '../components/budgets';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { CurrencyDisplay } from '../components/common/CurrencyDisplay';
import { ReadAloudButton } from '../components/common/ReadAloudButton';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { ExplainThis } from '../components/common/ExplainThis';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { SortableList } from '../components/common/SortableList';
import { SyncIndicator } from '../components/common/SyncIndicator';
import { BudgetForm } from '../components/forms';
import { TripCountryBudgetsSection } from '../components/budgets/TripCountryBudgetsSection';
import { OfflineBanner } from '../components/OfflineBanner';
import type { CreateBudgetInput, CreateBudgetTemplateInput } from '../db/repositories/budgets';
import { useBudgets } from '../hooks/useBudgets';
import { useCategories } from '../hooks/useCategories';
import { FOOD_MEAL_SUBCATEGORY_DEFINITIONS } from '../hooks/useCategories';
import { useTransactions } from '../hooks/useTransactions';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { useExchangeRates } from '../hooks/useExchangeRates';
import type { Budget } from '../kmp/bridge';
import { getBudgetStatusIndicator } from '../lib/a11y';
import { getBudgetStarterTemplates } from '../lib/budgeting/starter-budget-templates';
import { computePreviousPeriodSpending } from '../lib/budget-previous-period';
import { computeCurrentPeriodIncome } from '../lib/budget-current-income';
import type { DisplayExchangeRate } from '../lib/budgeting/display-currency-rollups';
import type { TripBudgetTransaction } from '../lib/budgeting/trip-country-budget-scope';
import {
  buildTripBudgetView,
  collectTripBudgetCountries,
  createTripCountryBudget,
  deleteTripCountryBudget,
  filterTripCountryBudgets,
  loadTripCountryBudgets,
  saveTripCountryBudget,
  setTripCountryBudgetArchived,
  type TripBudgetStorageLike,
  type TripCountryBudget,
  type TripCountryBudgetFormInput,
} from '../lib/budgeting/trip-country-budgets';
import {
  calculateActiveCadenceRange,
  generateVarianceInsights,
  summarizeCadenceIncome,
  summarizeEnvelopePlan,
  type IncomeEventInput,
  type PlanningCadence,
} from '../lib/budgeting-beta';
import { AppIcon, type IconName } from '../components/icons';
import { dollarsToCents } from '../lib/currency';

import './BudgetsPage.css';

function getBudgetIcon(iconName: string | null | undefined): IconName {
  switch (iconName) {
    case 'utensils':
      return 'shopping-cart';
    case 'home':
      return 'home';
    case 'car':
      return 'car';
    case 'film':
      return 'film';
    case 'wallet':
      return 'wallet';
    case 'package':
      return 'package';
    case 'heart-pulse':
      return 'heart-pulse';
    case 'tag':
      return 'tag';
    default:
      return 'chart-bar';
  }
}

function renderBudgetIcon(iconName: string | null | undefined): React.ReactNode {
  if (iconName && iconName.length <= 4) {
    return <span aria-hidden="true">{iconName}</span>;
  }

  return <AppIcon name={getBudgetIcon(iconName)} />;
}

function centsFromInput(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? dollarsToCents(parsed) : 0;
}

function todayIso(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Resolve a localStorage-compatible store for persisted trip/country budgets.
 *
 * Falls back to a process-local in-memory shim when storage is unavailable
 * (SSR / private browsing) so the surface degrades gracefully instead of
 * throwing.
 */
const tripBudgetMemoryStore = new Map<string, string>();
function resolveTripBudgetStorage(): TripBudgetStorageLike {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // Storage blocked (private mode) — fall through to the in-memory shim.
  }
  return {
    getItem: (key) => tripBudgetMemoryStore.get(key) ?? null,
    setItem: (key, value) => {
      tripBudgetMemoryStore.set(key, value);
    },
    removeItem: (key) => {
      tripBudgetMemoryStore.delete(key);
    },
  };
}

const CADENCE_LABELS: Record<PlanningCadence, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Biweekly',
  MONTHLY: 'Monthly',
};

export const BudgetsPage: React.FC = () => {
  const {
    budgets,
    loading,
    error,
    refresh,
    createBudget,
    createBudgetTemplate,
    updateBudget,
    deleteBudget,
    reorderBudgets,
  } = useBudgets();
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    refresh: refreshCategories,
    foodMealTemplate,
    ensureFoodMealCategories,
  } = useCategories();
  const { transactions } = useTransactions();
  const { displayCurrency, supportedCurrencies } = useDisplayCurrency();
  const {
    rates: exchangeRates,
    isOffline: ratesOffline,
    isStale: ratesStale,
    loading: ratesLoading,
  } = useExchangeRates(displayCurrency);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);
  const [defaultCategoryId, setDefaultCategoryId] = useState<string | undefined>(undefined);
  const [planningCadence, setPlanningCadence] = useState<PlanningCadence>('MONTHLY');
  const [expectedIncomeInput, setExpectedIncomeInput] = useState('');
  const [incomeSourceInput, setIncomeSourceInput] = useState('Paycheck');
  const [incomeAmountInput, setIncomeAmountInput] = useState('');
  const [incomeDateInput, setIncomeDateInput] = useState(todayIso);
  const [incomeEvents, setIncomeEvents] = useState<IncomeEventInput[]>([]);
  const [incomeError, setIncomeError] = useState<string | null>(null);
  const [tripBudgets, setTripBudgets] = useState<readonly TripCountryBudget[]>(() =>
    loadTripCountryBudgets(resolveTripBudgetStorage()),
  );
  const [tripCountryFilter, setTripCountryFilter] = useState('');
  const [showArchivedTrips, setShowArchivedTrips] = useState(false);

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const starterTemplates = useMemo(() => getBudgetStarterTemplates(), []);

  // --- Trip & country budgets (derived from real transactions + real rates) ---
  const tripToday = useMemo(() => todayIso(), []);
  const tripDisplayRates = useMemo<DisplayExchangeRate[]>(
    () =>
      Object.values(exchangeRates).map((rate) => ({
        from: rate.from,
        to: rate.to,
        rate: rate.rate,
        timestamp: rate.timestamp,
        // When connectivity has degraded mark every rate offline so the engine
        // discloses the whole roll-up as potentially stale.
        source: ratesOffline ? 'offline' : rate.source,
      })),
    [exchangeRates, ratesOffline],
  );
  const tripTransactions = useMemo<TripBudgetTransaction[]>(
    () =>
      transactions.map((transaction) => ({
        id: transaction.id,
        amountCents: transaction.amount.amount,
        currency: transaction.currency.code,
        date: transaction.date,
        merchantCountry: transaction.merchantCountry,
        tags: transaction.tags,
        accountId: transaction.accountId,
        deleted: transaction.deletedAt != null,
        kind:
          transaction.type === 'INCOME'
            ? 'income'
            : transaction.type === 'TRANSFER'
              ? 'transfer'
              : 'expense',
      })),
    [transactions],
  );
  const tripCountries = useMemo(() => collectTripBudgetCountries(tripBudgets), [tripBudgets]);
  const tripViews = useMemo(
    () =>
      filterTripCountryBudgets(tripBudgets, {
        showArchived: showArchivedTrips,
        countryFilter: tripCountryFilter,
      }).map((budget) =>
        buildTripBudgetView(budget, tripTransactions, tripToday, tripDisplayRates),
      ),
    [
      tripBudgets,
      showArchivedTrips,
      tripCountryFilter,
      tripTransactions,
      tripToday,
      tripDisplayRates,
    ],
  );

  const handleCreateTripBudget = useCallback((input: TripCountryBudgetFormInput) => {
    const storage = resolveTripBudgetStorage();
    const budget = createTripCountryBudget(input, {
      id: `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    });
    setTripBudgets(saveTripCountryBudget(storage, budget));
  }, []);

  const handleArchiveTripBudget = useCallback((id: string, archived: boolean) => {
    setTripBudgets(setTripCountryBudgetArchived(resolveTripBudgetStorage(), id, archived));
  }, []);

  const handleDeleteTripBudget = useCallback((id: string) => {
    setTripBudgets(deleteTripCountryBudget(resolveTripBudgetStorage(), id));
  }, []);

  const isLoading = loading || categoriesLoading;
  const resolvedError = error ?? categoriesError;
  const handleRetry = () => {
    refresh();
    refreshCategories();
  };

  /** Open the budget dialog in create mode. */
  const handleAddBudget = useCallback(() => {
    setEditingBudget(null);
    setDefaultCategoryId(undefined);
    setIsFormOpen(true);
  }, []);

  const handleUseFoodMealsTemplate = useCallback(() => {
    const nextTemplateState = ensureFoodMealCategories();
    setEditingBudget(null);
    setDefaultCategoryId(nextTemplateState?.parentCategory?.id);
    setIsFormOpen(true);
  }, [ensureFoodMealCategories]);

  /** Open the budget dialog in edit mode for the selected budget. */
  const handleEditBudget = useCallback((budget: Budget) => {
    setEditingBudget(budget);
    setDefaultCategoryId(undefined);
    setIsFormOpen(true);
  }, []);

  /** Open the delete confirmation dialog for the selected budget. */
  const handleDeleteBudget = useCallback((budget: Budget) => {
    setDeletingBudget(budget);
  }, []);

  const handleAddIncomeEvent = useCallback(() => {
    const amountCents = centsFromInput(incomeAmountInput);
    if (amountCents <= 0) {
      setIncomeError('Enter an income amount greater than zero.');
      return;
    }

    const source = incomeSourceInput.trim() || 'Income';
    setIncomeEvents((events) => [
      ...events,
      {
        id: `income-${Date.now()}-${events.length}`,
        source,
        amountCents,
        date: incomeDateInput || todayIso(),
      },
    ]);
    setIncomeError(null);
    setIncomeAmountInput('');
  }, [incomeAmountInput, incomeDateInput, incomeSourceInput]);

  const handleRemoveIncomeEvent = useCallback((id: string) => {
    setIncomeEvents((events) => events.filter((event) => event.id !== id));
  }, []);

  /** Close the budget form dialog without saving. */
  const handleFormCancel = useCallback(() => {
    setIsFormOpen(false);
    setEditingBudget(null);
    setDefaultCategoryId(undefined);
  }, []);

  /** Close the delete confirmation dialog without deleting. */
  const handleDeleteCancel = useCallback(() => {
    setDeletingBudget(null);
  }, []);

  /** Create or update a budget, depending on the active dialog mode. */
  const handleFormSubmit = useCallback(
    async (data: CreateBudgetInput) => {
      if (editingBudget) {
        const updatedBudget = updateBudget(editingBudget.id, data);
        if (updatedBudget === null) {
          throw new Error('Failed to update budget.');
        }
      } else {
        const createdBudget = createBudget(data);
        if (createdBudget === null) {
          throw new Error('Failed to create budget.');
        }
      }

      setIsFormOpen(false);
      setEditingBudget(null);
      setDefaultCategoryId(undefined);
    },
    [createBudget, editingBudget, updateBudget],
  );

  const handleTemplateSubmit = useCallback(
    async (data: CreateBudgetTemplateInput) => {
      const createdBudgets = createBudgetTemplate(data);
      if (!createdBudgets || createdBudgets.length === 0) {
        throw new Error('Failed to create starter budget.');
      }

      setIsFormOpen(false);
      setEditingBudget(null);
      setDefaultCategoryId(undefined);
    },
    [createBudgetTemplate],
  );

  /** Delete the selected budget after the user confirms the action. */
  const handleDeleteConfirm = useCallback(() => {
    if (!deletingBudget) {
      return;
    }

    const deleted = deleteBudget(deletingBudget.id);
    if (deleted) {
      setDeletingBudget(null);
    }
  }, [deleteBudget, deletingBudget]);

  const totalBudgeted = budgets.reduce((sum, budget) => sum + budget.amount.amount, 0);
  const totalSpent = budgets.reduce((sum, budget) => sum + budget.spentAmount.amount, 0);
  const totalRemaining = budgets.reduce((sum, budget) => sum + budget.remainingAmount.amount, 0);
  const cadenceRange = useMemo(
    () => calculateActiveCadenceRange(planningCadence),
    [planningCadence],
  );
  const cadenceIncome = useMemo(
    () => summarizeCadenceIncome(incomeEvents, planningCadence),
    [incomeEvents, planningCadence],
  );
  const manualExpectedIncomeCents = centsFromInput(expectedIncomeInput);
  const expectedIncomeCents =
    incomeEvents.length > 0
      ? cadenceIncome.cadenceIncomeCents
      : manualExpectedIncomeCents > 0
        ? manualExpectedIncomeCents
        : totalBudgeted;
  const budgetPlanItems = useMemo(
    () =>
      budgets.map((budget) => ({
        id: budget.id,
        categoryId: budget.categoryId,
        name: budget.name,
        amountCents: budget.amount.amount,
        spentCents: budget.spentAmount.amount,
        period: budget.period,
        isRollover: budget.isRollover,
      })),
    [budgets],
  );
  const envelopeSummary = useMemo(
    () => summarizeEnvelopePlan(expectedIncomeCents, budgetPlanItems, planningCadence),
    [budgetPlanItems, expectedIncomeCents, planningCadence],
  );
  const assignedBeforeEditCents = useMemo(
    () =>
      budgets
        .filter((budget) => budget.id !== editingBudget?.id)
        .reduce((sum, budget) => sum + budget.amount.amount, 0),
    [budgets, editingBudget],
  );
  const varianceInsights = useMemo(
    () =>
      generateVarianceInsights(
        budgets.map((budget) => ({
          categoryId: budget.categoryId,
          name: budget.name,
          budgetedCents: budget.amount.amount,
          actualCents: budget.spentAmount.amount,
          priorActualCents: null,
        })),
        3,
      ),
    [budgets],
  );

  // Budget analytics data
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysElapsed = now.getDate();

  const currentCategorySpending = useMemo(() => {
    const map = new Map<string, number>();
    for (const budget of budgets) {
      const category = categoriesById.get(budget.categoryId);
      const name = category?.name ?? budget.name;
      map.set(name, (map.get(name) ?? 0) + budget.spentAmount.amount);
    }
    return map;
  }, [budgets, categoriesById]);

  const categoryBudgets = useMemo(() => {
    const map = new Map<string, number>();
    for (const budget of budgets) {
      const category = categoriesById.get(budget.categoryId);
      const name = category?.name ?? budget.name;
      map.set(name, (map.get(name) ?? 0) + budget.amount.amount);
    }
    return map;
  }, [budgets, categoriesById]);

  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const previousPeriod = useMemo(
    () =>
      computePreviousPeriodSpending(
        transactions.map((transaction) => ({
          type: transaction.type,
          amountCents: transaction.amount.amount,
          date: transaction.date,
          categoryId: transaction.categoryId,
          deleted: transaction.deletedAt != null,
        })),
        categoryNameById,
        new Date(currentYear, currentMonth, 1),
      ),
    [transactions, categoryNameById, currentYear, currentMonth],
  );

  // Real income for the current period drives the savings-rate analytics.
  // Fall back to the budgeted total only when no income has been recorded yet,
  // so the widget never regresses to a misleading "-100%" on a fresh ledger.
  const currentPeriodIncome = useMemo(
    () =>
      computeCurrentPeriodIncome(
        transactions.map((transaction) => ({
          type: transaction.type,
          amountCents: transaction.amount.amount,
          date: transaction.date,
          deleted: transaction.deletedAt != null,
        })),
        new Date(currentYear, currentMonth, 1),
      ),
    [transactions, currentYear, currentMonth],
  );
  const analyticsIncome = currentPeriodIncome > 0 ? currentPeriodIncome : totalBudgeted;

  return (
    <>
      <OfflineBanner />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-6)',
          gap: 'var(--spacing-4)',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)',
          }}
        >
          <h2
            style={{
              fontSize: 'var(--type-scale-headline-font-size)',
              fontWeight: 'var(--type-scale-headline-font-weight)',
              margin: 0,
            }}
          >
            Budgets
          </h2>
          <ExplainThis tipKey="budget503020Rule" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          <SyncIndicator />
          <button
            type="button"
            className="form-button form-button--primary"
            onClick={handleAddBudget}
            aria-label="Add budget"
          >
            + Add Budget
          </button>
        </div>
      </div>

      {!isLoading && !resolvedError && (
        <section aria-label="Budget beta planner" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div className="card">
            <div className="budget-planner__grid">
              <div className="budget-planner__field">
                <label htmlFor="budget-planning-cadence" className="card__title">
                  Planning cadence
                </label>
                <select
                  id="budget-planning-cadence"
                  className="form-select"
                  value={planningCadence}
                  onChange={(event) => setPlanningCadence(event.target.value as PlanningCadence)}
                >
                  <option value="WEEKLY">Weekly</option>
                  <option value="BIWEEKLY">Biweekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
                <p className="budget-planner__hint">
                  {CADENCE_LABELS[planningCadence]} plan: {cadenceRange.startDate} –{' '}
                  {cadenceRange.endDate}
                </p>
              </div>
              <div className="budget-planner__field">
                <label htmlFor="budget-expected-income" className="card__title">
                  Expected income
                </label>
                <input
                  id="budget-expected-income"
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={expectedIncomeInput}
                  onChange={(event) => setExpectedIncomeInput(event.target.value)}
                  placeholder={(totalBudgeted / 100).toFixed(2)}
                />
                <p className="budget-planner__hint">
                  Used for zero-based ready-to-assign warnings.
                </p>
              </div>
              <div className="budget-planner__field">
                <p className="card__title">Projected monthly income</p>
                <p className="card__value">
                  <CurrencyDisplay amount={cadenceIncome.projectedMonthlyIncomeCents} />
                </p>
                <p className="budget-planner__hint">
                  From {cadenceIncome.eventCount} expected income event
                  {cadenceIncome.eventCount === 1 ? '' : 's'} in this cadence.
                </p>
              </div>
            </div>

            <div className="budget-planner__stats">
              <div className="budget-planner__stat">
                <p className="card__title">Expected</p>
                <p className="card__value">
                  <CurrencyDisplay amount={envelopeSummary.totalIncomeCents} />
                </p>
              </div>
              <div className="budget-planner__stat">
                <p className="card__title">Total assigned</p>
                <p className="card__value">
                  <CurrencyDisplay amount={envelopeSummary.totalAssignedCents} />
                </p>
              </div>
              <div className="budget-planner__stat">
                <p className="card__title">
                  {envelopeSummary.readyToAssignCents < 0 ? 'Over-assigned' : 'Ready to assign'}
                  <ExplainThis
                    glossaryKey="zeroBasedBudget"
                    buttonLabel="Explain assigning every dollar"
                  />
                </p>
                <p className="card__value">
                  <CurrencyDisplay amount={Math.abs(envelopeSummary.readyToAssignCents)} colorize />
                </p>
              </div>
            </div>

            <div className="budget-planner__income">
              <input
                className="form-input"
                aria-label="Income source"
                value={incomeSourceInput}
                onChange={(event) => setIncomeSourceInput(event.target.value)}
                placeholder="Paycheck"
              />
              <input
                className="form-input"
                aria-label="Income amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={incomeAmountInput}
                onChange={(event) => setIncomeAmountInput(event.target.value)}
                placeholder="0.00"
              />
              <input
                className="form-input"
                aria-label="Income date"
                type="date"
                value={incomeDateInput}
                onChange={(event) => setIncomeDateInput(event.target.value)}
              />
              <button
                type="button"
                className="form-button form-button--secondary"
                onClick={handleAddIncomeEvent}
              >
                Add income event
              </button>
            </div>
            <p
              className="budget-planner__error"
              role="alert"
              aria-live="assertive"
              hidden={incomeError === null}
            >
              {incomeError}
            </p>
            {incomeEvents.length > 0 && (
              <ul className="budget-planner__income-list">
                {incomeEvents.map((event) => (
                  <li key={event.id} className="budget-planner__income-item">
                    <span>
                      {event.source} on {event.date}: <CurrencyDisplay amount={event.amountCents} />
                    </span>
                    <button
                      type="button"
                      className="icon-button icon-button--delete"
                      onClick={() => handleRemoveIncomeEvent(event.id)}
                      aria-label={`Remove income event: ${event.source} on ${event.date}`}
                      title="Remove income event"
                    >
                      <AppIcon name="trash" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {!isLoading && !resolvedError && (
        <section aria-label="Food & Meals template" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div className="card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 'var(--spacing-4)',
                flexWrap: 'wrap',
                marginBottom: 'var(--spacing-3)',
              }}
            >
              <div style={{ maxWidth: '40rem' }}>
                <p className="card__title">Food & Meals template</p>
                <p style={{ color: 'var(--semantic-text-secondary)' }}>
                  Create one monthly food budget, then track groceries, dining out, delivery,
                  coffee, and meal prep underneath it.
                </p>
                <p
                  style={{
                    fontSize: 'var(--type-scale-caption-font-size)',
                    color: 'var(--semantic-text-secondary)',
                    marginTop: 'var(--spacing-2)',
                  }}
                >
                  {foodMealTemplate.missingSubcategoryDefinitions.length === 0
                    ? 'All food subcategories are ready to use.'
                    : `${foodMealTemplate.missingSubcategoryDefinitions.length} subcategories will be added automatically when you start this budget.`}
                </p>
              </div>
              <button
                type="button"
                className="form-button form-button--secondary"
                onClick={handleUseFoodMealsTemplate}
              >
                Use Food & Meals template
              </button>
            </div>
            <div style={{ display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
              {FOOD_MEAL_SUBCATEGORY_DEFINITIONS.map((subcategory) => (
                <span
                  key={subcategory.name}
                  style={{
                    padding: 'var(--spacing-1) var(--spacing-2)',
                    borderRadius: '999px',
                    background: 'var(--semantic-background-secondary)',
                    fontSize: 'var(--type-scale-caption-font-size)',
                  }}
                >
                  {subcategory.icon} {subcategory.name}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {!resolvedError && (
        <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
          <TripCountryBudgetsSection
            views={tripViews}
            countries={tripCountries}
            countryFilter={tripCountryFilter}
            onCountryFilterChange={setTripCountryFilter}
            showArchived={showArchivedTrips}
            onShowArchivedChange={setShowArchivedTrips}
            displayCurrency={displayCurrency}
            supportedCurrencies={supportedCurrencies}
            ratesStale={ratesStale || ratesOffline}
            ratesLoading={ratesLoading}
            today={tripToday}
            onCreate={handleCreateTripBudget}
            onArchiveChange={handleArchiveTripBudget}
            onDelete={handleDeleteTripBudget}
          />
        </div>
      )}

      <BudgetForm
        isOpen={isFormOpen}
        onCancel={handleFormCancel}
        onSubmit={handleFormSubmit}
        onSubmitTemplate={editingBudget ? undefined : handleTemplateSubmit}
        categories={categories}
        templates={starterTemplates}
        initialData={editingBudget ?? undefined}
        defaultCategoryId={defaultCategoryId}
        expectedIncomeCents={expectedIncomeCents}
        assignedBeforeEditCents={assignedBeforeEditCents}
      />
      <ConfirmDialog
        isOpen={deletingBudget !== null}
        title="Delete Budget"
        message={
          deletingBudget
            ? `Delete the ${deletingBudget.name} budget? This will remove it from your budgets list.`
            : ''
        }
        confirmLabel="Delete Budget"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading budgets" />
        </div>
      ) : resolvedError ? (
        <ErrorBanner message={resolvedError} onRetry={handleRetry} />
      ) : budgets.length === 0 ? (
        <EmptyState
          title="No budget envelopes yet"
          description="Start by entering expected income above, then create budget envelopes that assign every dollar to spending, saving, or debt categories."
          action={
            <button
              type="button"
              className="form-button form-button--primary"
              onClick={handleAddBudget}
            >
              Create your first budget
            </button>
          }
        />
      ) : (
        <>
          <section className="page-section" aria-label="Budget summary">
            <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 'var(--spacing-4)',
                }}
              >
                <div>
                  <p className="card__title">Budgeted</p>
                  <p className="card__value">
                    <CurrencyDisplay amount={totalBudgeted} />
                  </p>
                </div>
                <div>
                  <p className="card__title">Spent</p>
                  <p className="card__value">
                    <CurrencyDisplay amount={totalSpent} />
                  </p>
                </div>
                <div>
                  <p className="card__title">Remaining</p>
                  <p className="card__value">
                    <CurrencyDisplay amount={totalRemaining} colorize />
                    <ReadAloudButton
                      amount={totalRemaining}
                      context="total remaining across budgets"
                    />
                  </p>
                </div>
              </div>
            </div>
          </section>
          <BudgetAnalytics
            totalIncome={analyticsIncome}
            totalSpent={totalSpent}
            totalBudget={totalBudgeted}
            daysElapsed={daysElapsed}
            totalDays={daysInMonth}
            previousPeriodSpent={previousPeriod.previousPeriodSpent}
            currentCategorySpending={currentCategorySpending}
            previousCategorySpending={previousPeriod.previousCategorySpending}
            categoryBudgets={categoryBudgets}
          />
          <section aria-label="Variance coaching" style={{ marginBottom: 'var(--spacing-6)' }}>
            <div className="card">
              <p className="card__title">Budget-vs-actual coaching</p>
              {varianceInsights.length === 0 ? (
                <p style={{ color: 'var(--semantic-text-secondary)' }}>
                  Categories are on track for this period.
                </p>
              ) : (
                <ul style={{ display: 'grid', gap: 'var(--spacing-3)', paddingLeft: '1.25rem' }}>
                  {varianceInsights.map((insight) => (
                    <li key={insight.categoryId}>
                      <strong>{insight.name}</strong> is{' '}
                      {insight.kind === 'over' ? 'over' : 'under'} by{' '}
                      <CurrencyDisplay amount={Math.abs(insight.varianceCents)} /> (
                      {Math.abs(insight.variancePercent)}%). {insight.action}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section aria-label="Budget categories">
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--spacing-2)',
                marginBottom: 'var(--spacing-3)',
              }}
            >
              <h3 style={{ margin: 0, fontWeight: 'var(--font-weight-semibold)' }}>
                Budget Categories
              </h3>
              <ExplainThis
                tipKey="budgetSinkingFund"
                buttonLabel="Explain sinking funds for budget categories"
              />
            </div>
            <SortableList
              items={budgets}
              getItemId={(budget) => budget.id}
              getItemLabel={(budget) => budget.name}
              onReorder={reorderBudgets}
              className="card-grid card-grid--2"
              ariaLabel="Budget categories"
              renderItem={(budget, { itemProps, dragHandleProps }) => {
                const percentUsed =
                  budget.amount.amount > 0
                    ? Math.round((budget.spentAmount.amount / budget.amount.amount) * 100)
                    : 0;
                const remainingAmount = budget.remainingAmount.amount;
                const budgetStatus = getBudgetStatusIndicator(percentUsed);
                const statusTone = budgetStatus.tone;
                const valueText = `${percentUsed}% used — ${budgetStatus.label}`;
                const radius = 36;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (Math.min(percentUsed, 100) / 100) * circumference;
                const category = categoriesById.get(budget.categoryId);
                const envelope = envelopeSummary.envelopes.find(
                  (entry) => entry.budgetId === budget.id,
                );

                return (
                  <article
                    {...itemProps}
                    key={budget.id}
                    className={`${itemProps.className} card`}
                    role="listitem"
                    aria-label={`${budget.name}: ${percentUsed}% used, ${budgetStatus.label}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}
                  >
                    <div
                      className="progress-ring"
                      role="progressbar"
                      aria-valuenow={Math.min(percentUsed, 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuetext={valueText}
                      aria-label={`${budget.name} budget: ${valueText}`}
                    >
                      <svg
                        className="progress-ring__svg"
                        width="88"
                        height="88"
                        viewBox="0 0 88 88"
                        aria-hidden="true"
                      >
                        <circle
                          className="progress-ring__track"
                          cx="44"
                          cy="44"
                          r={radius}
                          strokeWidth="8"
                        />
                        <circle
                          className={`progress-ring__fill progress-ring__fill--${statusTone}`}
                          cx="44"
                          cy="44"
                          r={radius}
                          strokeWidth="8"
                          strokeDasharray={circumference}
                          strokeDashoffset={offset}
                        />
                      </svg>
                      <span className="progress-ring__label" aria-hidden="true">
                        {percentUsed}%
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 'var(--spacing-3)',
                        }}
                      >
                        <div>
                          <p style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                            <Link
                              to={`/budgets/${budget.id}`}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                              aria-label={`View details for ${budget.name}`}
                            >
                              {renderBudgetIcon(category?.icon)} {budget.name}
                            </Link>
                          </p>
                          <p
                            style={{
                              fontSize: 'var(--type-scale-caption-font-size)',
                              color: 'var(--semantic-text-secondary)',
                            }}
                          >
                            <CurrencyDisplay
                              amount={budget.spentAmount.amount}
                              currency={budget.currency.code}
                            />{' '}
                            of{' '}
                            <CurrencyDisplay
                              amount={budget.amount.amount}
                              currency={budget.currency.code}
                            />
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                          <button
                            {...dragHandleProps}
                            className={`${dragHandleProps.className ?? ''} icon-button`.trim()}
                            aria-label={`Reorder ${budget.name}`}
                            title="Reorder budget"
                          >
                            <span aria-hidden="true">⋮⋮</span>
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => handleEditBudget(budget)}
                            aria-label={`Edit ${budget.name}`}
                            title="Edit budget"
                          >
                            <AppIcon name="edit" />
                          </button>
                          <button
                            type="button"
                            className="icon-button icon-button--delete"
                            onClick={() => handleDeleteBudget(budget)}
                            aria-label={`Delete ${budget.name}`}
                            title="Delete budget"
                          >
                            <AppIcon name="trash" />
                          </button>
                        </div>
                      </div>
                      <p
                        style={{
                          fontSize: 'var(--type-scale-caption-font-size)',
                          color:
                            remainingAmount >= 0
                              ? 'var(--semantic-status-positive)'
                              : 'var(--semantic-status-negative)',
                        }}
                      >
                        <AppIcon name={budgetStatus.icon} />{' '}
                        {remainingAmount >= 0 ? (
                          <>
                            <CurrencyDisplay
                              amount={remainingAmount}
                              currency={budget.currency.code}
                              context={`remaining in ${budget.name} budget`}
                            />{' '}
                            left
                          </>
                        ) : (
                          <>
                            <CurrencyDisplay
                              amount={Math.abs(remainingAmount)}
                              currency={budget.currency.code}
                              context={`over in ${budget.name} budget`}
                            />{' '}
                            over
                          </>
                        )}
                      </p>
                      {envelope && (
                        <p
                          style={{
                            fontSize: 'var(--type-scale-caption-font-size)',
                            color: 'var(--semantic-text-secondary)',
                          }}
                        >
                          {envelope.isEnvelope ? (
                            <>
                              Envelope balance:{' '}
                              <CurrencyDisplay
                                amount={envelope.envelopeBalanceCents}
                                currency={budget.currency.code}
                                colorize
                              />
                            </>
                          ) : (
                            'Resets each period'
                          )}
                        </p>
                      )}
                    </div>
                  </article>
                );
              }}
            />
          </section>
        </>
      )}
    </>
  );
};

export default BudgetsPage;
