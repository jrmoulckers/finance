// SPDX-License-Identifier: BUSL-1.1

/**
 * Recurring transactions page.
 *
 * Lists all recurring transaction rules with controls for creating, editing,
 * toggling active state, and deleting rules. Also displays upcoming scheduled
 * transactions for the next 7 days.
 *
 * @module pages/RecurringPage
 * References: todo s7-recurring
 */

import React, { useCallback, useState } from 'react';
import { ConfirmDialog, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { RecurringRuleForm } from '../components/forms';
import type { CreateRecurringRuleInput, RecurringRule } from '../db/repositories/recurring-rules';
import { getUpcomingTransactionsInRange } from '../db/repositories/recurring-rules';
import { useAccounts, useCategories } from '../hooks';
import { useRecurringRules } from '../hooks/useRecurringRules';

import '../styles/recurring.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Biweekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

function formatCurrency(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function getNextOccurrenceLabel(
  rule: RecurringRule,
  getUpcoming: (id: string, count?: number) => { date: string }[],
): string {
  if (!rule.isActive) return 'Paused';
  const upcoming = getUpcoming(rule.id, 1);
  if (upcoming.length === 0) return 'No upcoming';
  return formatDate(upcoming[0]!.date);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RecurringPage: React.FC = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<RecurringRule | null>(null);
  const [isDeletingRule, setIsDeletingRule] = useState(false);

  const { rules, loading, error, refresh, createRule, updateRule, deleteRule, getUpcoming } =
    useRecurringRules();

  const { accounts } = useAccounts();
  const { categories } = useCategories();

  // Upcoming transactions in the next 7 days
  const upcomingTransactions = getUpcomingTransactionsInRange(7);

  // -- handlers ------------------------------------------------------------

  const handleOpenForm = useCallback(() => {
    setEditingRule(null);
    setIsFormOpen(true);
  }, []);

  const handleEditRule = useCallback((rule: RecurringRule) => {
    setEditingRule(rule);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setEditingRule(null);
    setIsFormOpen(false);
  }, []);

  const handleRequestDelete = useCallback((rule: RecurringRule) => {
    setDeletingRule(rule);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeletingRule(null);
  }, []);

  const handleSubmitRule = useCallback(
    (data: CreateRecurringRuleInput) => {
      if (editingRule !== null) {
        const updated = updateRule(editingRule.id, data);
        if (updated === null) {
          return;
        }
      } else {
        const created = createRule(data);
        if (created === null) {
          return;
        }
      }

      setEditingRule(null);
      setIsFormOpen(false);
    },
    [createRule, editingRule, updateRule],
  );

  const handleToggleActive = useCallback(
    (rule: RecurringRule) => {
      updateRule(rule.id, { isActive: !rule.isActive });
    },
    [updateRule],
  );

  const handleConfirmDelete = useCallback(() => {
    if (deletingRule === null) return;

    setIsDeletingRule(true);

    try {
      deleteRule(deletingRule.id);
      setDeletingRule(null);
    } finally {
      setIsDeletingRule(false);
    }
  }, [deleteRule, deletingRule]);

  // -- render --------------------------------------------------------------

  return (
    <>
      <div className="recurring-header">
        <h2 className="recurring-header__title">Recurring Transactions</h2>
        <button
          type="button"
          className="form-button form-button--primary"
          onClick={handleOpenForm}
          aria-label="Add a new recurring rule"
        >
          Add Rule
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading recurring rules" />
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={refresh} />
      ) : rules.length === 0 ? (
        <EmptyState
          title="No recurring transactions set up yet"
          description="Create a recurring rule to automatically track regular transactions like rent, subscriptions, or paychecks."
        />
      ) : (
        <section aria-label="Recurring rules list">
          <div className="recurring-list">
            {rules.map((rule) => (
              <article
                key={rule.id}
                className={`recurring-rule-card${!rule.isActive ? ' recurring-rule-card--inactive' : ''}`}
                aria-label={`${rule.description}: ${formatCurrency(rule.amount.amount)} ${FREQUENCY_LABELS[rule.frequency] ?? rule.frequency}`}
              >
                <div className="recurring-rule-card__row">
                  <h3 className="recurring-rule-card__description">{rule.description}</h3>
                  <span
                    className={`recurring-rule-card__amount recurring-rule-card__amount--${rule.type === 'INCOME' ? 'income' : 'expense'}`}
                  >
                    {rule.type === 'INCOME' ? '+' : '-'}
                    {formatCurrency(rule.amount.amount)}
                  </span>
                </div>

                <div className="recurring-rule-card__row">
                  <div className="recurring-rule-card__meta">
                    <span className="recurring-badge recurring-badge--frequency">
                      {FREQUENCY_LABELS[rule.frequency] ?? rule.frequency}
                    </span>
                    <span
                      className={`recurring-badge ${rule.isActive ? 'recurring-badge--active' : 'recurring-badge--paused'}`}
                    >
                      {rule.isActive ? 'Active' : 'Paused'}
                    </span>
                    <span>Next: {getNextOccurrenceLabel(rule, getUpcoming)}</span>
                  </div>
                  <div className="recurring-rule-card__actions">
                    <button
                      type="button"
                      className="recurring-toggle"
                      onClick={() => handleToggleActive(rule)}
                      aria-label={
                        rule.isActive ? `Pause ${rule.description}` : `Resume ${rule.description}`
                      }
                    >
                      {rule.isActive ? '⏸ Pause' : '▶ Resume'}
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => handleEditRule(rule)}
                      aria-label={`Edit ${rule.description}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => handleRequestDelete(rule)}
                      aria-label={`Delete ${rule.description}`}
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
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming transactions section */}
      <section className="recurring-upcoming" aria-label="Upcoming scheduled transactions">
        <h3 className="recurring-upcoming__title">Upcoming (Next 7 Days)</h3>
        {upcomingTransactions.length === 0 ? (
          <p className="recurring-upcoming__empty">No scheduled transactions in the next 7 days.</p>
        ) : (
          <ul className="recurring-upcoming__list">
            {upcomingTransactions.map((occ, i) => (
              <li key={`${occ.date}-${occ.description}-${i}`} className="recurring-upcoming__item">
                <div>
                  <span className="recurring-upcoming__item-description">{occ.description}</span>
                  <br />
                  <span className="recurring-upcoming__item-date">{formatDate(occ.date)}</span>
                </div>
                <span className="recurring-upcoming__item-amount">
                  {formatCurrency(occ.amount.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecurringRuleForm
        isOpen={isFormOpen}
        onCancel={handleCloseForm}
        onSubmit={handleSubmitRule}
        accounts={accounts}
        categories={categories}
        initialData={editingRule ?? undefined}
      />

      <ConfirmDialog
        isOpen={deletingRule !== null}
        title="Delete recurring rule?"
        message={
          deletingRule === null
            ? ''
            : `Are you sure you want to delete "${deletingRule.description}"? This action cannot be undone.`
        }
        confirmLabel="Delete Rule"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        isLoading={isDeletingRule}
      />
    </>
  );
};

export default RecurringPage;
