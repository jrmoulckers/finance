// SPDX-License-Identifier: BUSL-1.1

import React, { useState, useMemo } from 'react';
import { CurrencyDisplay, EmptyState } from '../components/common';
interface Txn {
  id: string;
  desc: string;
  cat: string;
  amount: number;
  date: string;
  acct: string;
}
export const TransactionsPage: React.FC = () => {
  const [q, setQ] = useState('');
  const [f, setF] = useState('All');
  const txns: Txn[] = [
    {
      id: '1',
      desc: 'Grocery Store',
      cat: 'Food',
      amount: -67.42,
      date: '2025-03-06',
      acct: 'Checking',
    },
    {
      id: '2',
      desc: 'Monthly Salary',
      cat: 'Income',
      amount: 4500,
      date: '2025-03-06',
      acct: 'Checking',
    },
    {
      id: '3',
      desc: 'Electric Bill',
      cat: 'Utilities',
      amount: -124,
      date: '2025-03-05',
      acct: 'Checking',
    },
    {
      id: '4',
      desc: 'Coffee Shop',
      cat: 'Dining',
      amount: -5.75,
      date: '2025-03-05',
      acct: 'Checking',
    },
    {
      id: '5',
      desc: 'Gas Station',
      cat: 'Transport',
      amount: -48.3,
      date: '2025-03-05',
      acct: 'Checking',
    },
  ];
  const cats = useMemo(() => ['All', ...new Set(txns.map((t) => t.cat))], []);
  const filtered = useMemo(() => {
    let r = txns;
    if (f !== 'All') r = r.filter((t) => t.cat === f);
    if (q.trim()) {
      const ql = q.toLowerCase();
      r = r.filter((t) => t.desc.toLowerCase().includes(ql));
    }
    return r;
  }, [q, f]);
  const grouped = useMemo(() => {
    const m = new Map<string, Txn[]>();
    for (const t of filtered) {
      const a = m.get(t.date);
      if (a) a.push(t);
      else m.set(t.date, [t]);
    }
    return Array.from(m, ([d, ts]) => ({
      date: d,
      label: new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
      txns: ts,
    }));
  }, [filtered]);
  return (
    <>
      <h2
        style={{
          fontSize: 'var(--type-scale-headline-font-size)',
          fontWeight: 'var(--type-scale-headline-font-weight)',
          marginBottom: 'var(--spacing-4)',
        }}
      >
        Transactions
      </h2>
      <div className="search-bar" role="search">
        <input
          type="search"
          className="search-bar__input"
          placeholder="Search..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search transactions"
        />
      </div>
      <div
        className="filter-chips"
        role="group"
        aria-label="Category filter"
        style={{ marginBottom: 'var(--spacing-4)' }}
      >
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            className={`filter-chip${f === c ? ' filter-chip--active' : ''}`}
            onClick={() => setF(c)}
            aria-pressed={f === c}
          >
            {c}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No transactions found" description="Try adjusting your search." />
      ) : (
        <div>
          {grouped.map((g) => (
            <section key={g.date} className="page-section" aria-label={g.label}>
              <h3 className="list-group__header">{g.label}</h3>
              <div className="card">
                <ul className="list-group" role="list">
                  {g.txns.map((t) => (
                    <li key={t.id} className="list-item" role="listitem">
                      <div className="list-item__content">
                        <p className="list-item__primary">{t.desc}</p>
                        <p className="list-item__secondary">
                          {t.cat} &middot; {t.acct}
                        </p>
                      </div>
                      <div className="list-item__trailing">
                        <CurrencyDisplay amount={t.amount} colorize showSign />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
};
export default TransactionsPage;
