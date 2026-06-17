// SPDX-License-Identifier: BUSL-1.1

import type { AccountPurpose } from '../../kmp/bridge';
import {
  ACCOUNT_PURPOSE_FILTER_OPTIONS,
  type AccountPurposeFilter,
  getAccountPurposeBadgeLabel,
  normalizeAccountPurpose,
} from '../../lib/accountPurpose';

export function AccountPurposeBadge({ purpose }: { purpose?: AccountPurpose | null }) {
  const normalizedPurpose = normalizeAccountPurpose(purpose);

  return (
    <span className={`account-purpose-badge account-purpose-badge--${normalizedPurpose}`}>
      {getAccountPurposeBadgeLabel(normalizedPurpose)}
    </span>
  );
}

export function AccountPurposeFilterControl({
  value,
  onChange,
  label = 'Filter by account purpose',
}: {
  value: AccountPurposeFilter;
  onChange: (value: AccountPurposeFilter) => void;
  label?: string;
}) {
  return (
    <div className="purpose-filter" role="group" aria-label={label}>
      {ACCOUNT_PURPOSE_FILTER_OPTIONS.map((option) => {
        const isSelected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            className={`purpose-filter__button${isSelected ? ' purpose-filter__button--selected' : ''}`}
            aria-pressed={isSelected}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
