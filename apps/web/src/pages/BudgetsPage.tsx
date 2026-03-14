// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { CurrencyDisplay, EmptyState } from '../components/common';
interface Bud {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  icon: string;
}
export const BudgetsPage: React.FC = () => {
  const cats: Bud[] = [
    { id: 'b1', name: 'Food', budgeted: 600, spent: 423.5, icon: '🛒' },
    { id: 'b2', name: 'Housing', budgeted: 1200, spent: 1200, icon: '🏠' },
    { id: 'b3', name: 'Transport', budgeted: 300, spent: 187.3, icon: '🚗' },
    { id: 'b4', name: 'Entertainment', budgeted: 150, spent: 142.99, icon: '🎬' },
    { id: 'b5', name: 'Dining Out', budgeted: 200, spent: 47.75, icon: '🍽️' },
    { id: 'b6', name: 'Utilities', budgeted: 250, spent: 209, icon: '⚡' },
  ];
  const tb = cats.reduce((s, c) => s + c.budgeted, 0),
    ts = cats.reduce((s, c) => s + c.spent, 0),
    tr = tb - ts;
  return (
    <>
      <h2
        style={{
          fontSize: 'var(--type-scale-headline-font-size)',
          fontWeight: 'var(--type-scale-headline-font-weight)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        Budgets
      </h2>
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
                <CurrencyDisplay amount={tb} />
              </p>
            </div>
            <div>
              <p className="card__title">Spent</p>
              <p className="card__value">
                <CurrencyDisplay amount={ts} />
              </p>
            </div>
            <div>
              <p className="card__title">Remaining</p>
              <p className="card__value">
                <CurrencyDisplay amount={tr} colorize />
              </p>
            </div>
          </div>
        </div>
      </section>
      {cats.length === 0 ? (
        <EmptyState title="No budgets" description="Create your first budget." />
      ) : (
        <section aria-label="Budget categories">
          <div className="card-grid card-grid--2">
            {cats.map((c) => {
              const p = Math.round((c.spent / c.budgeted) * 100),
                rem = c.budgeted - c.spent,
                st = p > 90 ? 'negative' : p > 75 ? 'warning' : 'positive',
                r = 36,
                circ = 2 * Math.PI * r,
                off = circ - (Math.min(p, 100) / 100) * circ;
              return (
                <article
                  key={c.id}
                  className="card"
                  aria-label={`${c.name}: ${p}% used`}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}
                >
                  <div
                    className="progress-ring"
                    role="progressbar"
                    aria-valuenow={Math.min(p, 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
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
                        r={r}
                        strokeWidth="8"
                      />
                      <circle
                        className={`progress-ring__fill progress-ring__fill--${st}`}
                        cx="44"
                        cy="44"
                        r={r}
                        strokeWidth="8"
                        strokeDasharray={circ}
                        strokeDashoffset={off}
                      />
                    </svg>
                    <span className="progress-ring__label" aria-hidden="true">
                      {p}%
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                      <span aria-hidden="true">{c.icon}</span> {c.name}
                    </p>
                    <p
                      style={{
                        fontSize: 'var(--type-scale-caption-font-size)',
                        color: 'var(--semantic-text-secondary)',
                      }}
                    >
                      <CurrencyDisplay amount={c.spent} /> of{' '}
                      <CurrencyDisplay amount={c.budgeted} />
                    </p>
                    <p
                      style={{
                        fontSize: 'var(--type-scale-caption-font-size)',
                        color:
                          rem >= 0
                            ? 'var(--semantic-status-positive)'
                            : 'var(--semantic-status-negative)',
                      }}
                    >
                      {rem >= 0 ? (
                        <>
                          <CurrencyDisplay amount={rem} /> left
                        </>
                      ) : (
                        <>
                          <CurrencyDisplay amount={Math.abs(rem)} /> over
                        </>
                      )}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
};
export default BudgetsPage;
