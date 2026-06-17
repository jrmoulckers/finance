// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { Link } from 'react-router-dom';
import type { Transaction } from '../../kmp/bridge';
import type { WarrantyDeadline } from '../../lib/warranty';
import { EmptyState } from '../common';

export interface ExpiringWarrantiesProps {
  readonly deadlines: readonly WarrantyDeadline[];
  readonly transactionLookup: ReadonlyMap<string, Transaction>;
  readonly limit?: number;
}

function describeDeadline(daysRemaining: number, dueDate: string): string {
  if (daysRemaining === 0) {
    return `Due today (${dueDate})`;
  }

  if (daysRemaining === 1) {
    return `1 day left (${dueDate})`;
  }

  return `${daysRemaining} days left (${dueDate})`;
}

export const ExpiringWarranties: React.FC<ExpiringWarrantiesProps> = ({
  deadlines,
  transactionLookup,
  limit = 5,
}) => {
  const visibleDeadlines = deadlines.slice(0, limit);

  if (visibleDeadlines.length === 0) {
    return (
      <EmptyState
        title="Nothing urgent right now"
        description="Upcoming return windows and warranty expirations will show up here."
      />
    );
  }

  return (
    <ul className="list-group" role="list" aria-label="Expiring warranties and return windows">
      {visibleDeadlines.map((deadline) => {
        const transaction = transactionLookup.get(deadline.transactionId);
        const label = transaction?.payee ?? deadline.itemName;

        return (
          <li key={`${deadline.entryId}-${deadline.type}`} className="list-item" role="listitem">
            <Link
              to={`/transactions/${deadline.transactionId}`}
              className="list-item__link"
              aria-label={`View ${label}`}
            >
              <div className="list-item__content">
                <p className="list-item__primary">{deadline.itemName}</p>
                <p className="list-item__secondary">
                  {deadline.type === 'return-window' ? 'Return window' : 'Warranty'} ·{' '}
                  {describeDeadline(deadline.daysRemaining, deadline.dueDate)}
                </p>
              </div>
              <div className="list-item__trailing">
                <span
                  style={{
                    display: 'inline-flex',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '999px',
                    backgroundColor:
                      deadline.daysRemaining <= 1
                        ? 'rgba(127, 29, 29, 0.12)'
                        : 'rgba(146, 64, 14, 0.12)',
                    color: deadline.daysRemaining <= 1 ? '#991b1b' : '#9a3412',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  {deadline.daysRemaining === 0 ? 'Today' : `${deadline.daysRemaining}d`}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};
