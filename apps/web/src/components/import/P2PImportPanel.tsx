// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible Venmo / Cash App (P2P) import surface.
 *
 * Presentational component: all state and persistence live in the
 * {@link useP2PImport} hook, which the page wires in. It previews parsed rows,
 * shows the spending / reimbursement / transfer classification with a text
 * label *and* an icon (never color alone), lets the user override each row, and
 * confirms the net (budget-affecting) totals before saving.
 *
 * Accessibility:
 *   - Labeled file input and account selector
 *   - Preview table with a caption and `scope="col"` headers
 *   - Classification uses text + icon (no color-only signaling)
 *   - Per-row override is a keyboard-navigable native `<select>`
 *   - Summary and status updates use `aria-live="polite"`; errors use `role="alert"`
 */

import React, { useId, useMemo } from 'react';

import { formatCurrency } from '../../lib/currency';
import { buildImportableTransactions } from '../../lib/p2p-import';
import type {
  P2PClassification,
  P2PClassifiedRow,
  P2PImportPlan,
  P2POverride,
} from '../../lib/p2p-import-types';
import { AppIcon, type IconName } from '../icons';
import { FileDropZone } from './FileDropZone';

import './p2p-import-panel.css';

export interface P2PImportAccountOption {
  readonly id: string;
  readonly name: string;
}

export interface P2PImportSaveSummary {
  readonly created: number;
  readonly excluded: number;
  readonly failed: number;
}

export interface P2PImportPanelProps {
  fileName: string | null;
  plan: P2PImportPlan | null;
  overrides: Readonly<Record<number, P2POverride>>;
  parseError: string | null;
  accounts: readonly P2PImportAccountOption[];
  selectedAccountId: string | null;
  importing: boolean;
  saveResult: P2PImportSaveSummary | null;
  onLoadFile: (file: File) => void;
  onSetOverride: (index: number, override: P2POverride | null) => void;
  onSelectAccount: (id: string) => void;
  onConfirmImport: () => void;
  onReset: () => void;
}

const CLASSIFICATION_META: Record<
  P2PClassification,
  { label: string; icon: IconName; description: string }
> = {
  spending: {
    label: 'Spending',
    icon: 'shopping-cart',
    description: 'Counts toward your budget and cash-flow.',
  },
  reimbursement: {
    label: 'Reimbursement',
    icon: 'refresh',
    description: 'Excluded from budget so it cannot distort your spending.',
  },
  transfer: {
    label: 'Transfer',
    icon: 'bank',
    description: 'Money moved between accounts — excluded from spending.',
  },
};

const OVERRIDE_OPTIONS: readonly { value: '' | P2POverride; label: string }[] = [
  { value: '', label: 'Auto (suggested)' },
  { value: 'spending', label: 'Spending' },
  { value: 'split-with-friends', label: 'Split with friends' },
  { value: 'roommate-reimbursement', label: 'Roommate reimbursement' },
  { value: 'transfer', label: 'Transfer' },
];

function formatCents(cents: number): string {
  return formatCurrency(cents, { signDisplay: 'always' });
}

function formatPlain(cents: number): string {
  return formatCurrency(Math.abs(cents));
}

export const P2PImportPanel: React.FC<P2PImportPanelProps> = ({
  fileName,
  plan,
  overrides,
  parseError,
  accounts,
  selectedAccountId,
  importing,
  saveResult,
  onLoadFile,
  onSetOverride,
  onSelectAccount,
  onConfirmImport,
  onReset,
}) => {
  const accountSelectId = useId();
  const summaryId = useId();

  const anchorByMember = useMemo(() => {
    const map = new Map<number, P2PClassifiedRow>();
    if (plan === null) return map;
    const byIndex = new Map(plan.rows.map((row) => [row.index, row]));
    for (const group of plan.groups) {
      const anchor = byIndex.get(group.anchorIndex);
      if (!anchor) continue;
      for (const memberIndex of group.memberIndices) {
        map.set(memberIndex, anchor);
      }
    }
    return map;
  }, [plan]);

  const groupByAnchor = useMemo(() => {
    const map = new Map<number, P2PImportPlan['groups'][number]>();
    if (plan === null) return map;
    for (const group of plan.groups) {
      map.set(group.anchorIndex, group);
    }
    return map;
  }, [plan]);

  const importableCount = useMemo(
    () => (plan === null ? 0 : buildImportableTransactions(plan).length),
    [plan],
  );

  const canImport =
    plan !== null && selectedAccountId !== null && importableCount > 0 && !importing;

  return (
    <section className="p2p-import" aria-labelledby="p2p-import-heading">
      <h2 id="p2p-import-heading" className="p2p-import__title">
        Venmo &amp; Cash App Import
      </h2>
      <p className="p2p-import__intro">
        Import a Venmo or Cash App activity export (.csv). We detect likely reimbursements — money
        friends pay you back or your roommate share — and keep them out of your budget so your
        spending stays accurate. Connecting a live account is not available here; export a CSV from
        the Venmo or Cash App website first.
      </p>

      <div className="p2p-import__controls">
        <div className="p2p-import__account">
          <label htmlFor={accountSelectId} className="p2p-import__label">
            Import into account
          </label>
          <select
            id={accountSelectId}
            className="form-select"
            value={selectedAccountId ?? ''}
            onChange={(event) => onSelectAccount(event.target.value)}
            aria-required="true"
          >
            <option value="" disabled>
              Select an account
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <FileDropZone
          accept=".csv"
          onFile={onLoadFile}
          inputLabel="Choose a Venmo or Cash App CSV file to import"
          hint={fileName ? `Selected: ${fileName}` : '.csv files up to 10 MB'}
        />
      </div>

      {parseError !== null && (
        <p className="p2p-import__error" role="alert">
          <AppIcon name="alert-triangle" />
          {parseError}
        </p>
      )}

      {plan !== null && (
        <>
          <div
            className="p2p-import__summary"
            role="group"
            aria-labelledby={summaryId}
            aria-live="polite"
          >
            <h3 id={summaryId} className="p2p-import__summary-title">
              Import summary ({plan.provider})
            </h3>
            <dl className="p2p-import__stats">
              <div className="p2p-import__stat">
                <dt>Net spending to import</dt>
                <dd>{formatPlain(plan.summary.netSpendingCents)}</dd>
              </div>
              <div className="p2p-import__stat">
                <dt>Reimbursements excluded</dt>
                <dd>{formatPlain(plan.summary.excludedFromBudgetCents)}</dd>
              </div>
              <div className="p2p-import__stat">
                <dt>Reimbursement rows</dt>
                <dd>{plan.summary.reimbursementCount}</dd>
              </div>
              <div className="p2p-import__stat">
                <dt>Transfers</dt>
                <dd>{plan.summary.transferCount}</dd>
              </div>
              {plan.summary.feesCents > 0 && (
                <div className="p2p-import__stat">
                  <dt>Provider fees</dt>
                  <dd>{formatPlain(plan.summary.feesCents)}</dd>
                </div>
              )}
            </dl>
            <p className="p2p-import__summary-note">
              {plan.summary.netGroupCount > 0
                ? `${plan.summary.netGroupCount} spend${
                    plan.summary.netGroupCount === 1 ? '' : 's'
                  } netted against reimbursements. `
                : ''}
              {importableCount} net transaction{importableCount === 1 ? '' : 's'} will be saved;
              reimbursements and transfers are excluded from your budget.
            </p>
          </div>

          <div className="p2p-import__table-wrapper">
            <table className="p2p-import__table">
              <caption className="p2p-import__caption">
                Parsed P2P activity with suggested classification. Use the &ldquo;Treat as&rdquo;
                control to correct any row.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Counterparty</th>
                  <th scope="col">Note</th>
                  <th scope="col" className="p2p-import__amount-col">
                    Amount
                  </th>
                  <th scope="col">Classification</th>
                  <th scope="col">Treat as</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((row) => {
                  const meta = CLASSIFICATION_META[row.effectiveClassification];
                  const overrideValue = overrides[row.index] ?? '';
                  const group = groupByAnchor.get(row.index);
                  const anchor = anchorByMember.get(row.index);
                  return (
                    <tr key={row.index}>
                      <td>{row.date}</td>
                      <td>{row.counterparty || '—'}</td>
                      <td>{row.note || '—'}</td>
                      <td className="p2p-import__amount-col">
                        {formatCents(row.amountCents)}
                        {row.feeCents > 0 && (
                          <span className="p2p-import__fee">
                            {' '}
                            + {formatPlain(row.feeCents)} fee
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="p2p-import__class">
                          <AppIcon name={meta.icon} />
                          <span className="p2p-import__class-label">{meta.label}</span>
                          {row.override !== null && (
                            <span className="p2p-import__class-tag"> (overridden)</span>
                          )}
                        </span>
                        <span className="p2p-import__reason">
                          {group
                            ? `Net ${formatPlain(group.netSpendingCents)} after ${formatPlain(
                                group.reimbursedCents,
                              )} reimbursed.`
                            : anchor
                              ? `Reimburses ${anchor.note || anchor.counterparty || 'a spend'}.`
                              : (row.reasons[0] ?? meta.description)}
                        </span>
                      </td>
                      <td>
                        <label className="sr-only" htmlFor={`p2p-override-${row.index}`}>
                          Treat the {formatPlain(row.amountCents)} {row.counterparty || 'P2P'} entry
                          on {row.date} as
                        </label>
                        <select
                          id={`p2p-override-${row.index}`}
                          className="form-select p2p-import__override"
                          value={overrideValue}
                          onChange={(event) =>
                            onSetOverride(
                              row.index,
                              event.target.value === ''
                                ? null
                                : (event.target.value as P2POverride),
                            )
                          }
                        >
                          {OVERRIDE_OPTIONS.map((option) => (
                            <option key={option.value || 'auto'} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {plan.errors.length > 0 && (
            <div className="p2p-import__errors">
              <h3 className="p2p-import__errors-title">Skipped rows ({plan.errors.length})</h3>
              <table className="p2p-import__table">
                <caption className="sr-only">Rows that could not be parsed</caption>
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.errors.map((error, index) => (
                    <tr key={`${error.line}-${index}`}>
                      <td>{error.line}</td>
                      <td>{error.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="p2p-import__actions">
            <button type="button" className="form-button form-button--secondary" onClick={onReset}>
              Start over
            </button>
            <button
              type="button"
              className="form-button form-button--primary"
              onClick={onConfirmImport}
              disabled={!canImport}
              aria-disabled={!canImport}
            >
              {importing
                ? 'Importing…'
                : `Import ${importableCount} net transaction${importableCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}

      <div className="p2p-import__status" role="status" aria-live="polite">
        {saveResult !== null &&
          `Imported ${saveResult.created} net transaction${
            saveResult.created === 1 ? '' : 's'
          }. ${saveResult.excluded} reimbursement or transfer row${
            saveResult.excluded === 1 ? '' : 's'
          } excluded from your budget.${
            saveResult.failed > 0 ? ` ${saveResult.failed} failed.` : ''
          }`}
      </div>
    </section>
  );
};

export default P2PImportPanel;
