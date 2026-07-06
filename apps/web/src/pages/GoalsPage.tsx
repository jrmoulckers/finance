// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ConfirmDialog,
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
  SortableList,
  useToast,
} from '../components/common';
import { GoalContributionDialog } from '../components/goals/GoalContributionDialog';
import { SharedGoalBadge } from '../components/goals/SharedGoalContributions';
import { GoalForm } from '../components/forms';
import { pluralize } from '../lib/ui/pluralize';
import { AppIcon, type IconName } from '../components/icons';
import {
  ContributionPlanner,
  GoalProjection,
  NudgeToast,
  SuggestedGoals,
} from '../components/savings';
import { OfflineBanner } from '../components/OfflineBanner';
import { ShareCelebrationButton } from '../components/social/ShareCelebrationButton';
import { goalCelebrationEvent } from '../lib/social/share-celebration';
import type { CreateGoalInput, GoalContributionInput } from '../db/repositories/goals';
import { useAccounts, useCategories, useGoals, useTransactions } from '../hooks';
import { useTaxReserve } from '../hooks/useTaxReserve';
import type { Goal } from '../kmp/bridge';
import { getGoalStatusIndicator } from '../lib/a11y';
import {
  buildSavingsAnalysisSnapshot,
  generateSavingsNudges,
  projectSuggestedGoal,
  suggestSavingsGoals,
  type ContributionFrequency,
  type SuggestedGoalType,
  type SuggestedSavingsGoal,
  type SavingsNudge,
} from '../lib/savings';
import { getCurrentMonthBounds, getNextQuarterlyTaxDueDate } from '../lib/tax-reserve';

const PLANNER_STORAGE_KEY = 'finance:savings-planner-overrides';
const DISMISSED_NUDGES_STORAGE_KEY = 'finance:savings-dismissed-nudges';

type PlannerSelection = {
  monthlyContributionCents: number;
  frequency: ContributionFrequency;
};

function getGoalIcon(iconName: string | null | undefined): IconName {
  switch (iconName) {
    case 'shield':
      return 'shield';
    case 'plane':
      return 'plane';
    case 'home':
      return 'home';
    case 'laptop':
      return 'laptop';
    default:
      return 'target';
  }
}

function getSuggestedGoalIcon(type: SuggestedGoalType): string {
  switch (type) {
    case 'emergency-fund':
      return 'shield';
    case 'discretionary-savings':
      return 'wallet';
    case 'big-purchase':
      return 'target';
    case 'retirement':
      return 'trending-up';
    case 'debt-payoff':
      return 'bank';
    default:
      return 'target';
  }
}

function getSuggestedGoalColor(type: SuggestedGoalType): string {
  switch (type) {
    case 'emergency-fund':
      return '#2563EB';
    case 'discretionary-savings':
      return '#7C3AED';
    case 'big-purchase':
      return '#F59E0B';
    case 'retirement':
      return '#059669';
    case 'debt-payoff':
      return '#DC2626';
    default:
      return '#2563EB';
  }
}

function loadPlannerSelections(): Record<string, PlannerSelection> {
  try {
    const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as Record<string, PlannerSelection>;
  } catch {
    return {};
  }
}

function savePlannerSelections(value: Record<string, PlannerSelection>): void {
  try {
    localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures in local-only mode.
  }
}

function loadDismissedNudges(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_NUDGES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveDismissedNudges(value: readonly string[]): void {
  try {
    localStorage.setItem(DISMISSED_NUDGES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures in local-only mode.
  }
}

function useOptionalToast(): ReturnType<typeof useToast> | null {
  try {
    return useToast();
  } catch {
    return null;
  }
}

function formatCurrencyAmount(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function formatDueDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDueCountdown(days: number): string {
  if (days === 0) {
    return 'today';
  }

  return `in ${days} day${days === 1 ? '' : 's'}`;
}

export const GoalsPage: React.FC = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const [contributingGoal, setContributingGoal] = useState<Goal | null>(null);
  const [isDeletingGoal, setIsDeletingGoal] = useState(false);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [plannerSelections, setPlannerSelections] =
    useState<Record<string, PlannerSelection>>(loadPlannerSelections);
  const [dismissedNudges, setDismissedNudges] = useState<string[]>(loadDismissedNudges);
  const {
    goals,
    loading,
    error,
    refresh,
    createGoal,
    updateGoal,
    contributeToGoal,
    deleteGoal,
    reorderGoals,
  } = useGoals();
  const accountsState = useAccounts();
  const categoriesState = useCategories();
  const transactionsState = useTransactions();
  const taxReserveAsOf = useMemo(() => new Date(), []);
  const currentMonthRange = useMemo(() => getCurrentMonthBounds(taxReserveAsOf), [taxReserveAsOf]);
  const nextTaxDueDate = useMemo(
    () => getNextQuarterlyTaxDueDate(taxReserveAsOf),
    [taxReserveAsOf],
  );
  const currentMonthFilters = useMemo(
    () => ({ startDate: currentMonthRange.startDate, endDate: currentMonthRange.endDate }),
    [currentMonthRange],
  );
  const taxQuarterFilters = useMemo(
    () => ({ startDate: nextTaxDueDate.periodStart, endDate: nextTaxDueDate.periodEnd }),
    [nextTaxDueDate],
  );
  const {
    transactions: currentMonthTransactions,
    loading: currentMonthTransactionsLoading,
    error: currentMonthTransactionsError,
    refresh: refreshCurrentMonthTransactions,
  } = useTransactions(currentMonthFilters);
  const {
    transactions: taxQuarterTransactions,
    loading: taxQuarterTransactionsLoading,
    error: taxQuarterTransactionsError,
    refresh: refreshTaxQuarterTransactions,
  } = useTransactions(taxQuarterFilters);
  const taxReserve = useTaxReserve({
    currentMonthTransactions,
    quarterTransactions: taxQuarterTransactions,
    accounts: accountsState.accounts,
    asOf: taxReserveAsOf,
  });
  const taxReserveCurrency =
    taxQuarterTransactions[0]?.currency.code ?? currentMonthTransactions[0]?.currency.code ?? 'USD';
  const taxReserveRatePercent = Math.round(taxReserve.settings.rate * 100);
  const taxReserveBucketDollars = (taxReserve.settings.bucketBalanceCents / 100).toFixed(2);
  const isTaxReserveLoading =
    accountsState.loading || currentMonthTransactionsLoading || taxQuarterTransactionsLoading;
  const taxReserveError =
    accountsState.error ?? currentMonthTransactionsError ?? taxQuarterTransactionsError;
  const toast = useOptionalToast();
  const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmount.amount, 0);
  const totalSaved = goals.reduce((sum, goal) => sum + goal.currentAmount.amount, 0);

  const aiLoading = accountsState.loading || categoriesState.loading || transactionsState.loading;
  const aiError = accountsState.error || categoriesState.error || transactionsState.error;

  const analysisSnapshot = useMemo(
    () =>
      buildSavingsAnalysisSnapshot(
        accountsState.accounts,
        transactionsState.transactions,
        categoriesState.categories,
        goals,
      ),
    [accountsState.accounts, categoriesState.categories, goals, transactionsState.transactions],
  );

  const suggestedGoals = useMemo(() => suggestSavingsGoals(analysisSnapshot), [analysisSnapshot]);

  const activeSuggestion = useMemo(
    () =>
      suggestedGoals.find((suggestion) => suggestion.id === selectedSuggestionId) ??
      suggestedGoals[0] ??
      null,
    [selectedSuggestionId, suggestedGoals],
  );

  const activePlannerSelection = useMemo(() => {
    if (!activeSuggestion) {
      return null;
    }

    return (
      plannerSelections[activeSuggestion.id] ?? {
        monthlyContributionCents:
          activeSuggestion.contributionPlan.recommendedMonthlyContributionCents,
        frequency: activeSuggestion.contributionPlan.recommendedFrequency,
      }
    );
  }, [activeSuggestion, plannerSelections]);

  const activeProjection = useMemo(() => {
    if (!activeSuggestion || !activePlannerSelection) {
      return null;
    }

    return projectSuggestedGoal(activeSuggestion, activePlannerSelection.monthlyContributionCents);
  }, [activePlannerSelection, activeSuggestion]);

  const nudges = useMemo(
    () =>
      generateSavingsNudges({
        currencyCode: analysisSnapshot.currencyCode,
        monthlySurplusCents: analysisSnapshot.monthlySurplusCents,
        currentWeeklySavingsCents: analysisSnapshot.currentWeeklySavingsCents,
        previousWeeklySavingsCents: analysisSnapshot.previousWeeklySavingsCents,
        topDiscretionaryCategory: analysisSnapshot.discretionaryCategories[0] ?? null,
        suggestions: suggestedGoals,
      }).filter((nudge) => !dismissedNudges.includes(nudge.id)),
    [analysisSnapshot, dismissedNudges, suggestedGoals],
  );

  const activeNudge = nudges[0] ?? null;
  const householdId =
    goals[0]?.householdId ??
    accountsState.accounts[0]?.householdId ??
    transactionsState.transactions[0]?.householdId ??
    categoriesState.categories[0]?.householdId ??
    null;

  useEffect(() => {
    savePlannerSelections(plannerSelections);
  }, [plannerSelections]);

  useEffect(() => {
    saveDismissedNudges(dismissedNudges);
  }, [dismissedNudges]);

  useEffect(() => {
    if (!activeSuggestion) {
      setSelectedSuggestionId(null);
      return;
    }

    if (!suggestedGoals.some((suggestion) => suggestion.id === selectedSuggestionId)) {
      setSelectedSuggestionId(activeSuggestion.id);
    }
  }, [activeSuggestion, selectedSuggestionId, suggestedGoals]);

  const handleOpenForm = useCallback(() => {
    setEditingGoal(null);
    setIsFormOpen(true);
  }, []);

  const handleEditGoal = useCallback((goal: Goal) => {
    setEditingGoal(goal);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setEditingGoal(null);
    setIsFormOpen(false);
  }, []);

  const handleRequestDelete = useCallback((goal: Goal) => {
    setDeletingGoal(goal);
  }, []);

  const handleContributeGoal = useCallback((goal: Goal) => {
    setContributingGoal(goal);
  }, []);

  const handleCloseContribution = useCallback(() => {
    setContributingGoal(null);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeletingGoal(null);
  }, []);

  const handleTaxReserveRetry = useCallback(() => {
    accountsState.refresh();
    refreshCurrentMonthTransactions();
    refreshTaxQuarterTransactions();
  }, [accountsState, refreshCurrentMonthTransactions, refreshTaxQuarterTransactions]);

  const handleTaxRateChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      taxReserve.updateRatePercent(Number(event.target.value));
    },
    [taxReserve],
  );

  const handleBucketBalanceChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      taxReserve.updateBucketBalanceCents(Math.round(Number(event.target.value || 0) * 100));
    },
    [taxReserve],
  );

  const handleRecordRecommendedPayment = useCallback(() => {
    taxReserve.addToBucket(taxReserve.summary.recommendedPaymentCents);
  }, [taxReserve]);

  const handleSelectSuggestion = useCallback((suggestionId: string) => {
    setSelectedSuggestionId(suggestionId);
  }, []);

  const handleMonthlyContributionChange = useCallback(
    (monthlyContributionCents: number) => {
      if (!activeSuggestion) {
        return;
      }

      setPlannerSelections((prev) => ({
        ...prev,
        [activeSuggestion.id]: {
          monthlyContributionCents,
          frequency:
            prev[activeSuggestion.id]?.frequency ??
            activeSuggestion.contributionPlan.recommendedFrequency,
        },
      }));
    },
    [activeSuggestion],
  );

  const handleFrequencyChange = useCallback(
    (frequency: ContributionFrequency) => {
      if (!activeSuggestion) {
        return;
      }

      setPlannerSelections((prev) => ({
        ...prev,
        [activeSuggestion.id]: {
          monthlyContributionCents:
            prev[activeSuggestion.id]?.monthlyContributionCents ??
            activeSuggestion.contributionPlan.recommendedMonthlyContributionCents,
          frequency,
        },
      }));
    },
    [activeSuggestion],
  );

  const handleDismissNudge = useCallback((nudgeId: string) => {
    setDismissedNudges((prev) => (prev.includes(nudgeId) ? prev : [...prev, nudgeId]));
  }, []);

  const handleNudgeAction = useCallback((nudge: SavingsNudge) => {
    if (nudge.linkedSuggestionId !== null) {
      setSelectedSuggestionId(nudge.linkedSuggestionId);
    }
  }, []);

  const handleAddSuggestedGoal = useCallback(
    async (suggestion: SuggestedSavingsGoal) => {
      if (suggestion.linkedGoalId !== null) {
        setSelectedSuggestionId(suggestion.id);
        return;
      }

      if (householdId === null) {
        toast?.showToast({
          type: 'warning',
          message:
            'Add an account or an existing goal first so we can save this suggestion locally.',
          duration: 5000,
        });
        return;
      }

      const createdGoal = createGoal({
        householdId,
        name: suggestion.title,
        description: suggestion.reasoning.join(' '),
        targetAmount: { amount: suggestion.targetCents },
        currentAmount: { amount: suggestion.currentCents },
        targetDate: suggestion.targetDate,
        icon: getSuggestedGoalIcon(suggestion.type),
        color: getSuggestedGoalColor(suggestion.type),
      });

      if (createdGoal === null) {
        throw new Error('Failed to create goal from suggestion.');
      }

      toast?.showToast({
        type: 'success',
        message: `Saved ${createdGoal.name} as a goal`,
        duration: 3000,
      });
    },
    [createGoal, householdId, toast],
  );

  const handleSubmitGoal = useCallback(
    async (data: CreateGoalInput) => {
      if (editingGoal !== null) {
        const updatedGoal = updateGoal(editingGoal.id, data);
        if (updatedGoal === null) {
          throw new Error('Failed to update goal.');
        }
      } else {
        const createdGoal = createGoal(data);
        if (createdGoal === null) {
          throw new Error('Failed to create goal.');
        }
      }

      setEditingGoal(null);
      setIsFormOpen(false);
    },
    [createGoal, editingGoal, updateGoal],
  );

  const handleSubmitContribution = useCallback(
    async (input: GoalContributionInput) => {
      const updatedGoal = contributeToGoal(input.goalId, input);
      if (updatedGoal === null) {
        throw new Error('Failed to contribute to goal.');
      }

      toast?.showToast({
        type: 'success',
        message: `Contribution added to ${updatedGoal.name}`,
        duration: 3000,
      });
    },
    [contributeToGoal, toast],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (deletingGoal === null) {
      return;
    }

    setIsDeletingGoal(true);

    try {
      const deletedGoal = deleteGoal(deletingGoal.id);
      if (!deletedGoal) {
        throw new Error('Failed to delete goal.');
      }

      setDeletingGoal(null);
    } finally {
      setIsDeletingGoal(false);
    }
  }, [deleteGoal, deletingGoal]);

  return (
    <>
      <OfflineBanner />
      <div className="page-section__header" style={{ marginBottom: 'var(--spacing-6)' }}>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            marginBottom: 0,
          }}
        >
          Goals
        </h2>
        <button
          type="button"
          className="form-button form-button--primary"
          onClick={handleOpenForm}
          aria-label="Add a new goal"
        >
          Add Goal
        </button>
      </div>
      <section className="page-section" aria-label="Tax reserve bucket">
        <article className="card">
          <div className="card__header">
            <h3 className="card__title">Tax Reserve</h3>
            <span className="list-item__secondary">Suggested rate: 25–30%</span>
          </div>
          {isTaxReserveLoading ? (
            <div
              style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-4) 0' }}
            >
              <LoadingSpinner label="Loading tax reserve" />
            </div>
          ) : taxReserveError ? (
            <ErrorBanner message={taxReserveError} onRetry={handleTaxReserveRetry} />
          ) : (
            <>
              <div className="card-grid card-grid--3">
                <div>
                  <p className="list-item__secondary">Set-aside rate</p>
                  <label className="sr-only" htmlFor="tax-reserve-rate">
                    Tax set-aside rate percent
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                    <input
                      id="tax-reserve-rate"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={taxReserveRatePercent}
                      onChange={handleTaxRateChange}
                      className="form-input"
                      style={{ maxWidth: '7rem' }}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div>
                  <p className="list-item__secondary">Bucket balance</p>
                  <label className="sr-only" htmlFor="tax-reserve-balance">
                    Tax reserve bucket balance in dollars
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                    <span aria-hidden="true">$</span>
                    <input
                      id="tax-reserve-balance"
                      type="number"
                      min={0}
                      step="0.01"
                      value={taxReserveBucketDollars}
                      onChange={handleBucketBalanceChange}
                      className="form-input"
                      style={{ maxWidth: '9rem' }}
                    />
                  </div>
                </div>
                <div>
                  <p className="list-item__secondary">Recommended payment</p>
                  <p className="card__value">
                    <CurrencyDisplay
                      amount={taxReserve.summary.recommendedPaymentCents}
                      currency={taxReserveCurrency}
                      context="recommended estimated tax payment"
                    />
                  </p>
                </div>
              </div>
              <p style={{ marginTop: 'var(--spacing-3)' }}>
                You earned{' '}
                {formatCurrencyAmount(
                  taxReserve.summary.currentMonthNetIncomeCents,
                  taxReserveCurrency,
                )}{' '}
                this month. Set aside{' '}
                {formatCurrencyAmount(
                  taxReserve.summary.currentMonthRecommendedCents,
                  taxReserveCurrency,
                )}{' '}
                ({taxReserveRatePercent}%).
              </p>
              <p className="list-item__secondary">
                Quarterly estimate due {formatDueCountdown(taxReserve.summary.daysUntilDue)} on{' '}
                {formatDueDate(taxReserve.summary.nextDueDate.dueDate)}. Based on income so far, set
                aside ~
                {formatCurrencyAmount(
                  taxReserve.summary.quarterRecommendedCents,
                  taxReserveCurrency,
                )}
                .
              </p>
              <button
                type="button"
                className="form-button form-button--secondary"
                onClick={handleRecordRecommendedPayment}
                disabled={taxReserve.summary.recommendedPaymentCents === 0}
              >
                Record recommended payment in bucket
              </button>
            </>
          )}
        </article>
      </section>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading goals" />
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={refresh} />
      ) : (
        <>
          {goals.length > 0 ? (
            <section className="page-section" aria-label="Goals summary">
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
                    <p className="card__title">Goals</p>
                    <p className="card__value">{goals.length}</p>
                  </div>
                  <div>
                    <p className="card__title">Saved</p>
                    <p className="card__value">
                      <CurrencyDisplay amount={totalSaved} />
                    </p>
                  </div>
                  <div>
                    <p className="card__title">Target</p>
                    <p className="card__value">
                      <CurrencyDisplay amount={totalTarget} />
                    </p>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="page-section" aria-label="AI suggested savings goals">
            <div style={{ marginBottom: 'var(--spacing-4)' }}>
              <p className="card__title">AI-suggested goals</p>
              <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-2)' }}>
                Local-first suggestions from your spending patterns
              </h3>
              <p style={{ color: 'var(--semantic-text-secondary)', marginBottom: 0 }}>
                We analyze your local income, expenses, cash buffer, and active goals to suggest
                realistic next moves. Nothing leaves this device.
              </p>
            </div>

            {aiLoading ? (
              <div className="card">
                <LoadingSpinner label="Analyzing savings opportunities" />
              </div>
            ) : aiError ? (
              <div className="card" role="status">
                <p style={{ marginTop: 0, fontWeight: 600 }}>
                  Suggestions are temporarily unavailable
                </p>
                <p style={{ marginBottom: 0, color: 'var(--semantic-text-secondary)' }}>
                  {aiError}
                </p>
              </div>
            ) : suggestedGoals.length > 0 ? (
              <>
                {activeNudge ? (
                  <div style={{ marginBottom: 'var(--spacing-4)' }}>
                    <NudgeToast
                      nudge={activeNudge}
                      onDismiss={handleDismissNudge}
                      onAction={handleNudgeAction}
                    />
                  </div>
                ) : null}
                <SuggestedGoals
                  suggestions={suggestedGoals}
                  currencyCode={analysisSnapshot.currencyCode}
                  selectedSuggestionId={activeSuggestion?.id ?? null}
                  onSelectSuggestion={handleSelectSuggestion}
                  onAddGoal={handleAddSuggestedGoal}
                />
                {activeSuggestion && activePlannerSelection && activeProjection ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: 'var(--spacing-4)',
                      marginTop: 'var(--spacing-4)',
                    }}
                  >
                    <ContributionPlanner
                      suggestion={activeSuggestion}
                      currencyCode={analysisSnapshot.currencyCode}
                      monthlyContributionCents={activePlannerSelection.monthlyContributionCents}
                      frequency={activePlannerSelection.frequency}
                      onMonthlyContributionChange={handleMonthlyContributionChange}
                      onFrequencyChange={handleFrequencyChange}
                    />
                    <GoalProjection
                      projection={activeProjection}
                      currencyCode={analysisSnapshot.currencyCode}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="card" role="status">
                <p style={{ marginTop: 0, fontWeight: 600 }}>No suggestions yet</p>
                <p style={{ marginBottom: 0, color: 'var(--semantic-text-secondary)' }}>
                  Add a few weeks of income and spending history to unlock local savings
                  suggestions.
                </p>
              </div>
            )}
          </section>

          {goals.length === 0 ? (
            <EmptyState
              title="No goals yet"
              description="Create a savings goal to track progress toward something important."
            />
          ) : (
            <section aria-label="Goal list">
              <SortableList
                items={goals}
                getItemId={(goal) => goal.id}
                getItemLabel={(goal) => goal.name}
                onReorder={reorderGoals}
                className="card-grid"
                ariaLabel="Goal list"
                renderItem={(goal, { itemProps, dragHandleProps }) => {
                  const percentComplete =
                    goal.targetAmount.amount > 0
                      ? Math.round((goal.currentAmount.amount / goal.targetAmount.amount) * 100)
                      : 0;
                  const remainingAmount = Math.max(
                    goal.targetAmount.amount - goal.currentAmount.amount,
                    0,
                  );
                  const goalStatus = getGoalStatusIndicator(percentComplete);
                  const statusTone =
                    percentComplete >= 100
                      ? 'positive'
                      : percentComplete >= 50
                        ? 'positive'
                        : percentComplete >= 25
                          ? 'warning'
                          : 'negative';
                  const targetDate = goal.targetDate
                    ? new Date(`${goal.targetDate}T00:00:00`)
                    : null;
                  const daysLeft =
                    targetDate === null
                      ? null
                      : Math.max(0, Math.ceil((targetDate.getTime() - Date.now()) / 86400000));
                  const shareEvent = goalCelebrationEvent({
                    goalName: goal.name,
                    percentComplete,
                    amountCents: goal.currentAmount.amount,
                    currency: goal.currency.code,
                  });

                  return (
                    <article
                      {...itemProps}
                      key={goal.id}
                      className={`${itemProps.className} card`}
                      role="listitem"
                      aria-label={`${goal.name}: ${percentComplete}%, ${goalStatus.label}`}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 'var(--spacing-3)',
                          marginBottom: 'var(--spacing-3)',
                        }}
                      >
                        <h3 style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                          <Link
                            to={`/goals/${goal.id}`}
                            style={{ textDecoration: 'none', color: 'inherit' }}
                            aria-label={`View details for ${goal.name}`}
                          >
                            <AppIcon name={getGoalIcon(goal.icon)} /> {goal.name}
                          </Link>
                        </h3>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--spacing-2)',
                          }}
                        >
                          <button
                            {...dragHandleProps}
                            className={`${dragHandleProps.className ?? ''} icon-button`.trim()}
                            aria-label={`Reorder ${goal.name}`}
                            title="Reorder goal"
                          >
                            <span aria-hidden="true">⋮⋮</span>
                          </button>
                          <span
                            style={{
                              fontSize: 'var(--type-scale-caption-font-size)',
                              color: 'var(--semantic-text-secondary)',
                            }}
                          >
                            {targetDate !== null
                              ? targetDate.toLocaleDateString('en-US', {
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : 'No target date'}
                          </span>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--spacing-1)',
                            }}
                          >
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => handleEditGoal(goal)}
                              aria-label={`Edit ${goal.name}`}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="icon-button icon-button--delete"
                              onClick={() => handleRequestDelete(goal)}
                              aria-label={`Delete ${goal.name}`}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 'var(--spacing-2)',
                        }}
                      >
                        <CurrencyDisplay
                          amount={goal.currentAmount.amount}
                          currency={goal.currency.code}
                        />
                        <CurrencyDisplay
                          amount={goal.targetAmount.amount}
                          currency={goal.currency.code}
                        />
                      </div>
                      <div
                        className="progress-bar"
                        role="progressbar"
                        aria-valuenow={Math.min(percentComplete, 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${goal.name}: ${percentComplete} percent of goal reached, ${goalStatus.label}`}
                      >
                        <div
                          className={`progress-bar__fill progress-bar__fill--${statusTone}`}
                          style={{ width: `${Math.min(percentComplete, 100)}%` }}
                        />
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: 'var(--spacing-2)',
                          fontSize: 'var(--type-scale-caption-font-size)',
                          color: 'var(--semantic-text-secondary)',
                        }}
                      >
                        <span>
                          <AppIcon name={goalStatus.icon} />{' '}
                          {percentComplete >= 100 ? (
                            'Goal reached!'
                          ) : (
                            <>
                              <CurrencyDisplay
                                amount={remainingAmount}
                                currency={goal.currency.code}
                                context={`remaining for ${goal.name} goal`}
                              />{' '}
                              to go
                            </>
                          )}
                        </span>
                        <span>
                          {daysLeft === null
                            ? 'No due date'
                            : daysLeft > 0
                              ? `${daysLeft} ${pluralize(daysLeft, 'day')} left`
                              : 'Past due'}
                        </span>
                      </div>
                      <SharedGoalBadge goalId={goal.id} goalName={goal.name} />
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: 'var(--spacing-2)',
                          marginTop: 'var(--spacing-4)',
                        }}
                      >
                        {shareEvent && (
                          <ShareCelebrationButton
                            event={shareEvent}
                            label={`Share ${goal.name} progress`}
                          />
                        )}
                        <button
                          type="button"
                          className="form-button form-button--secondary"
                          onClick={() => handleContributeGoal(goal)}
                          aria-label={`Contribute to ${goal.name}`}
                        >
                          Contribute
                        </button>
                      </div>
                    </article>
                  );
                }}
              />
            </section>
          )}
        </>
      )}
      <GoalContributionDialog
        isOpen={contributingGoal !== null}
        goal={contributingGoal}
        onCancel={handleCloseContribution}
        onSubmit={handleSubmitContribution}
      />
      <GoalForm
        isOpen={isFormOpen}
        onCancel={handleCloseForm}
        onSubmit={handleSubmitGoal}
        initialData={editingGoal ?? undefined}
      />
      <ConfirmDialog
        isOpen={deletingGoal !== null}
        title="Delete goal?"
        message={
          deletingGoal === null
            ? ''
            : `Are you sure you want to delete “${deletingGoal.name}”? This action cannot be undone.`
        }
        confirmLabel="Delete Goal"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        isLoading={isDeletingGoal}
      />
    </>
  );
};

export default GoalsPage;
