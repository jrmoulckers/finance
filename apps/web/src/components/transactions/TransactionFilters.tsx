// SPDX-License-Identifier: BUSL-1.1

/**
 * TransactionFilters — Collapsible advanced filter panel for transactions.
 *
 * Provides filters for: date range, category, account, amount range,
 * type (income/expense/transfer), and status (pending/cleared).
 * Filters compose with AND logic. Active filters are shown as removable chips.
 *
 * @module components/transactions/TransactionFilters
 * References: issue #1464
 */

import React, { useCallback, useId } from 'react';

import type { Account, Category, TransactionStatus, TransactionType } from '../../kmp/bridge';
import './transaction-filters.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All possible filter state managed by this component. */
export interface AdvancedFilters {
  startDate: string;
  endDate: string;
  categoryIds: string[];
  accountIds: string[];
  amountMin: string;
  amountMax: string;
  types: TransactionType[];
  statuses: TransactionStatus[];
}

/** Default (empty) filter state. */
export const EMPTY_FILTERS: AdvancedFilters = {
  startDate: '',
  endDate: '',
  categoryIds: [],
  accountIds: [],
  amountMin: '',
  amountMax: '',
  types: [],
  statuses: [],
};

export interface TransactionFiltersProps {
  /** Current filter state. */
  filters: AdvancedFilters;
  /** Callback when any filter changes. */
  onChange: (filters: AdvancedFilters) => void;
  /** Whether the panel is expanded. */
  isOpen: boolean;
  /** Toggle panel open/closed. */
  onToggle: () => void;
  /** Available categories for multi-select. */
  categories: Category[];
  /** Available accounts for multi-select. */
  accounts: Account[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count how many filters are currently active. */
export function countActiveFilters(filters: AdvancedFilters): number {
  let count = 0;
  if (filters.startDate) count++;
  if (filters.endDate) count++;
  if (filters.categoryIds.length > 0) count++;
  if (filters.accountIds.length > 0) count++;
  if (filters.amountMin) count++;
  if (filters.amountMax) count++;
  if (filters.types.length > 0) count++;
  if (filters.statuses.length > 0) count++;
  return count;
}

/** Get human-readable chip descriptions for active filters. */
export function getActiveFilterChips(
  filters: AdvancedFilters,
  categories: Category[],
  accounts: Account[],
): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = [];

  if (filters.startDate) {
    chips.push({ key: 'startDate', label: `From: ${filters.startDate}` });
  }
  if (filters.endDate) {
    chips.push({ key: 'endDate', label: `To: ${filters.endDate}` });
  }
  if (filters.categoryIds.length > 0) {
    const names = filters.categoryIds
      .map((id) => categories.find((c) => c.id === id)?.name ?? id)
      .join(', ');
    chips.push({ key: 'categories', label: `Categories: ${names}` });
  }
  if (filters.accountIds.length > 0) {
    const names = filters.accountIds
      .map((id) => accounts.find((a) => a.id === id)?.name ?? id)
      .join(', ');
    chips.push({ key: 'accounts', label: `Accounts: ${names}` });
  }
  if (filters.amountMin) {
    chips.push({ key: 'amountMin', label: `Min: $${filters.amountMin}` });
  }
  if (filters.amountMax) {
    chips.push({ key: 'amountMax', label: `Max: $${filters.amountMax}` });
  }
  if (filters.types.length > 0) {
    chips.push({ key: 'types', label: `Type: ${filters.types.join(', ')}` });
  }
  if (filters.statuses.length > 0) {
    chips.push({ key: 'statuses', label: `Status: ${filters.statuses.join(', ')}` });
  }

  return chips;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TRANSACTION_TYPES: TransactionType[] = ['INCOME', 'EXPENSE', 'TRANSFER'];
const TRANSACTION_STATUSES: TransactionStatus[] = ['PENDING', 'CLEARED'];

export const TransactionFilters: React.FC<TransactionFiltersProps> = ({
  filters,
  onChange,
  isOpen,
  onToggle,
  categories,
  accounts,
}) => {
  const idPrefix = useId();
  const activeCount = countActiveFilters(filters);

  const handleFieldChange = useCallback(
    (field: keyof AdvancedFilters, value: AdvancedFilters[keyof AdvancedFilters]) => {
      onChange({ ...filters, [field]: value });
    },
    [filters, onChange],
  );

  const handleTypeToggle = useCallback(
    (type: TransactionType) => {
      const current = filters.types;
      const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
      onChange({ ...filters, types: next });
    },
    [filters, onChange],
  );

  const handleStatusToggle = useCallback(
    (status: TransactionStatus) => {
      const current = filters.statuses;
      const next = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      onChange({ ...filters, statuses: next });
    },
    [filters, onChange],
  );

  const handleClearAll = useCallback(() => {
    onChange(EMPTY_FILTERS);
  }, [onChange]);

  const handleRemoveChip = useCallback(
    (key: string) => {
      const updated = { ...filters };
      switch (key) {
        case 'startDate':
          updated.startDate = '';
          break;
        case 'endDate':
          updated.endDate = '';
          break;
        case 'categories':
          updated.categoryIds = [];
          break;
        case 'accounts':
          updated.accountIds = [];
          break;
        case 'amountMin':
          updated.amountMin = '';
          break;
        case 'amountMax':
          updated.amountMax = '';
          break;
        case 'types':
          updated.types = [];
          break;
        case 'statuses':
          updated.statuses = [];
          break;
      }
      onChange(updated);
    },
    [filters, onChange],
  );

  const handleCategoryChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selected = Array.from(event.target.selectedOptions, (opt) => opt.value);
      handleFieldChange('categoryIds', selected);
    },
    [handleFieldChange],
  );

  const handleAccountChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selected = Array.from(event.target.selectedOptions, (opt) => opt.value);
      handleFieldChange('accountIds', selected);
    },
    [handleFieldChange],
  );

  const chips = getActiveFilterChips(filters, categories, accounts);

  return (
    <div className="transaction-filters">
      <button
        type="button"
        className="transaction-filters-toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`${idPrefix}-panel`}
        aria-label={`Filters${activeCount > 0 ? `, ${activeCount} active` : ''}`}
      >
        <span aria-hidden="true">⚙️</span>
        Filters
        {activeCount > 0 && (
          <span className="transaction-filters-toggle__badge" aria-hidden="true">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id={`${idPrefix}-panel`}
          className="transaction-filters-panel"
          role="region"
          aria-label="Advanced filters"
        >
          {/* Date range */}
          <div className="transaction-filters-panel__group">
            <label className="transaction-filters-panel__label" htmlFor={`${idPrefix}-start-date`}>
              From date
            </label>
            <input
              id={`${idPrefix}-start-date`}
              type="date"
              className="transaction-filters-panel__input"
              value={filters.startDate}
              onChange={(e) => handleFieldChange('startDate', e.target.value)}
            />
          </div>

          <div className="transaction-filters-panel__group">
            <label className="transaction-filters-panel__label" htmlFor={`${idPrefix}-end-date`}>
              To date
            </label>
            <input
              id={`${idPrefix}-end-date`}
              type="date"
              className="transaction-filters-panel__input"
              value={filters.endDate}
              onChange={(e) => handleFieldChange('endDate', e.target.value)}
            />
          </div>

          {/* Category multi-select */}
          <div className="transaction-filters-panel__group">
            <label className="transaction-filters-panel__label" htmlFor={`${idPrefix}-categories`}>
              Categories
            </label>
            <select
              id={`${idPrefix}-categories`}
              className="transaction-filters-panel__input"
              multiple
              value={filters.categoryIds}
              onChange={handleCategoryChange}
              aria-label="Select categories"
              size={3}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Account multi-select */}
          <div className="transaction-filters-panel__group">
            <label className="transaction-filters-panel__label" htmlFor={`${idPrefix}-accounts`}>
              Accounts
            </label>
            <select
              id={`${idPrefix}-accounts`}
              className="transaction-filters-panel__input"
              multiple
              value={filters.accountIds}
              onChange={handleAccountChange}
              aria-label="Select accounts"
              size={3}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount range */}
          <div className="transaction-filters-panel__group">
            <label className="transaction-filters-panel__label" htmlFor={`${idPrefix}-amount-min`}>
              Min amount ($)
            </label>
            <input
              id={`${idPrefix}-amount-min`}
              type="number"
              className="transaction-filters-panel__input"
              value={filters.amountMin}
              onChange={(e) => handleFieldChange('amountMin', e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          <div className="transaction-filters-panel__group">
            <label className="transaction-filters-panel__label" htmlFor={`${idPrefix}-amount-max`}>
              Max amount ($)
            </label>
            <input
              id={`${idPrefix}-amount-max`}
              type="number"
              className="transaction-filters-panel__input"
              value={filters.amountMax}
              onChange={(e) => handleFieldChange('amountMax', e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          {/* Type toggles */}
          <div className="transaction-filters-panel__group">
            <span className="transaction-filters-panel__label" id={`${idPrefix}-type-label`}>
              Type
            </span>
            <div
              className="transaction-type-toggles"
              role="group"
              aria-labelledby={`${idPrefix}-type-label`}
            >
              {TRANSACTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`transaction-type-toggle${filters.types.includes(type) ? ' transaction-type-toggle--active' : ''}`}
                  onClick={() => handleTypeToggle(type)}
                  aria-pressed={filters.types.includes(type)}
                >
                  {type.charAt(0) + type.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Status toggles */}
          <div className="transaction-filters-panel__group">
            <span className="transaction-filters-panel__label" id={`${idPrefix}-status-label`}>
              Status
            </span>
            <div
              className="transaction-type-toggles"
              role="group"
              aria-labelledby={`${idPrefix}-status-label`}
            >
              {TRANSACTION_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`transaction-type-toggle${filters.statuses.includes(status) ? ' transaction-type-toggle--active' : ''}`}
                  onClick={() => handleStatusToggle(status)}
                  aria-pressed={filters.statuses.includes(status)}
                >
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Clear all */}
          {activeCount > 0 && (
            <div className="transaction-filters-panel__actions">
              <button
                type="button"
                className="transaction-filters-panel__clear"
                onClick={handleClearAll}
                aria-label="Clear all filters"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="transaction-active-filters" role="list" aria-label="Active filters">
          {chips.map((chip) => (
            <span key={chip.key} className="transaction-active-filter-chip" role="listitem">
              {chip.label}
              <button
                type="button"
                className="transaction-active-filter-chip__remove"
                onClick={() => handleRemoveChip(chip.key)}
                aria-label={`Remove filter: ${chip.label}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
