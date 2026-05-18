// SPDX-License-Identifier: BUSL-1.1

/**
 * TransactionSort — Sort controls for the transactions list.
 *
 * Allows sorting by date, amount, payee, or category with
 * ascending/descending direction toggle.
 *
 * @module components/transactions/TransactionSort
 * References: issue #1464
 */

import React, { useCallback, useId } from 'react';

import './transaction-filters.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Fields that transactions can be sorted by. */
export type SortField = 'date' | 'amount' | 'payee' | 'category';

/** Sort direction. */
export type SortDirection = 'asc' | 'desc';

/** Sort configuration. */
export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

/** Default sort: newest first. */
export const DEFAULT_SORT: SortConfig = {
  field: 'date',
  direction: 'desc',
};

export interface TransactionSortProps {
  /** Current sort configuration. */
  sort: SortConfig;
  /** Callback when sort changes. */
  onChange: (sort: SortConfig) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SORT_FIELD_LABELS: Record<SortField, string> = {
  date: 'Date',
  amount: 'Amount',
  payee: 'Payee',
  category: 'Category',
};

export const TransactionSort: React.FC<TransactionSortProps> = ({ sort, onChange }) => {
  const idPrefix = useId();

  const handleFieldChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ ...sort, field: event.target.value as SortField });
    },
    [sort, onChange],
  );

  const handleDirectionToggle = useCallback(() => {
    onChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
  }, [sort, onChange]);

  return (
    <div className="transaction-sort" role="group" aria-label="Sort transactions">
      <label htmlFor={`${idPrefix}-sort-field`} className="sr-only">
        Sort by
      </label>
      <select
        id={`${idPrefix}-sort-field`}
        className="transaction-sort__select"
        value={sort.field}
        onChange={handleFieldChange}
        aria-label="Sort field"
      >
        {(Object.entries(SORT_FIELD_LABELS) as [SortField, string][]).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="transaction-sort__direction"
        onClick={handleDirectionToggle}
        aria-label={`Sort direction: ${sort.direction === 'asc' ? 'ascending' : 'descending'}. Click to toggle.`}
        title={sort.direction === 'asc' ? 'Ascending' : 'Descending'}
      >
        <span aria-hidden="true">{sort.direction === 'asc' ? '↑' : '↓'}</span>
      </button>
    </div>
  );
};
