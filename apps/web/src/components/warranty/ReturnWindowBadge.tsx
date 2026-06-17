// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import type { Transaction } from '../../kmp/bridge';
import { useWarrantyEntry, getReturnWindowState } from '../../lib/warranty';

export interface ReturnWindowBadgeProps {
  readonly transaction: Transaction;
}

export const ReturnWindowBadge: React.FC<ReturnWindowBadgeProps> = ({ transaction }) => {
  const warrantyEntry = useWarrantyEntry(transaction.id);

  if (!warrantyEntry?.returnWindowEndDate) {
    return null;
  }

  const returnWindowState = getReturnWindowState(warrantyEntry);

  let label = 'Return eligible';
  let backgroundColor = 'rgba(21, 128, 61, 0.12)';
  let textColor = '#166534';

  if (returnWindowState.isClosed) {
    label = 'Return window closed';
    backgroundColor = 'rgba(127, 29, 29, 0.12)';
    textColor = '#991b1b';
  } else if (returnWindowState.daysRemaining === 0) {
    label = 'Return by today';
    backgroundColor = 'rgba(146, 64, 14, 0.12)';
    textColor = '#9a3412';
  } else if (returnWindowState.isClosingSoon && returnWindowState.daysRemaining !== null) {
    label = `${returnWindowState.daysRemaining} day${returnWindowState.daysRemaining === 1 ? '' : 's'} left to return`;
    backgroundColor = 'rgba(146, 64, 14, 0.12)';
    textColor = '#9a3412';
  } else if (returnWindowState.daysRemaining !== null) {
    label = `${returnWindowState.daysRemaining} day${returnWindowState.daysRemaining === 1 ? '' : 's'} left to return`;
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        marginTop: 'var(--spacing-1)',
        padding: '0.2rem 0.55rem',
        borderRadius: '999px',
        backgroundColor,
        color: textColor,
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      ↩ {label}
    </span>
  );
};
