// SPDX-License-Identifier: BUSL-1.1

import React, { useState } from 'react';
import { CurrencyDisplay, EmptyState } from '../components/common';
interface Acct {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment';
  balance: number;
  inst: string;
}
export const AccountsPage: React.FC = () => {
  const [sel, setSel] = useState<string | null>(null);
  const accts: Acct[] = [
    { id: 'a1', name: 'Primary Checking', type: 'checking', balance: 4520, inst: 'Chase' },
    { id: 'a2', name: 'Emergency Fund', type: 'savings', balance: 15000, inst: 'Ally' },
    { id: 'a3', name: 'Travel Card', type: 'credit', balance: -1250, inst: 'Amex' },
    { id: 'a4', name: 'Brokerage', type: 'investment', balance: 12500, inst: 'Fidelity' },
  ];
  const labels: Record<Acct['type'], string> = {
    checking: 'Checking',
    savings: 'Savings',
    credit: 'Credit Cards',
    investment: 'Investments',
  };
  const order: Acct['type'][] = ['checking', 'savings', 'credit', 'investment'];
  const groups = order
    .map((t) => ({ type: t, label: labels[t], accts: accts.filter((a) => a.type === t) }))
    .filter((g) => g.accts.length > 0);
  const s = sel ? accts.find((a) => a.id === sel) : null;
  if (s)
    return (
      <>
        <button
          type="button"
          className="icon-button"
          onClick={() => setSel(null)}
          aria-label="Back"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2>{s.name}</h2>
        <article className="card" aria-label="Account details">
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)' }}>
            <div>
              <dt className="card__title">Balance</dt>
              <dd className="card__value">
                <CurrencyDisplay amount={s.balance} colorize />
              </dd>
            </div>
            <div>
              <dt className="card__title">Institution</dt>
              <dd>{s.inst}</dd>
            </div>
          </dl>
        </article>
      </>
    );
  const tot = accts.reduce((s, a) => s + a.balance, 0);
  return (
    <>
      <h2
        style={{
          fontSize: 'var(--type-scale-headline-font-size)',
          fontWeight: 'var(--type-scale-headline-font-weight)',
          marginBottom: 'var(--spacing-2)',
        }}
      >
        Accounts
      </h2>
      <p
        style={{ marginBottom: 'var(--spacing-6)', color: 'var(--semantic-text-secondary)' }}
        aria-live="polite"
      >
        Net worth: <CurrencyDisplay amount={tot} colorize />
      </p>
      {accts.length === 0 ? (
        <EmptyState title="No accounts yet" description="Add your first account." />
      ) : (
        groups.map((g) => {
          const gt = g.accts.reduce((s, a) => s + a.balance, 0);
          return (
            <section key={g.type} className="page-section" aria-label={g.label}>
              <div className="page-section__header">
                <h3 className="page-section__title">{g.label}</h3>
                <CurrencyDisplay amount={gt} colorize />
              </div>
              <div className="card">
                <ul className="list-group" role="list">
                  {g.accts.map((a) => (
                    <li key={a.id} role="listitem">
                      <button
                        type="button"
                        className="list-item"
                        style={{
                          width: '100%',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onClick={() => setSel(a.id)}
                        aria-label={a.name}
                      >
                        <div className="list-item__content">
                          <p className="list-item__primary">{a.name}</p>
                          <p className="list-item__secondary">{a.inst}</p>
                        </div>
                        <div className="list-item__trailing">
                          <CurrencyDisplay amount={a.balance} colorize />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })
      )}
    </>
  );
};
export default AccountsPage;
