// SPDX-License-Identifier: BUSL-1.1

/**
 * Hook that drives the Venmo / Cash App (P2P) import surface.
 *
 * It owns the parsed {@link P2PImportPlan}, user overrides, the selected
 * destination account, and the save action. All data access goes through the
 * {@link useTransactions} and {@link useAccounts} hooks — components never
 * touch repositories directly. Reimbursements and transfers are excluded from
 * the saved (budget-affecting) transactions so they cannot distort budgets,
 * cash-flow, or insights.
 *
 * References: issue #2158
 */

import { useCallback, useMemo, useState } from 'react';

import type { SyncId } from '../kmp/bridge';
import { applyOverrides, buildImportableTransactions, buildP2PImportPlan } from '../lib/p2p-import';
import type { P2PImportPlan, P2POverride } from '../lib/p2p-import-types';
import { useAccounts } from './useAccounts';
import { useTransactions } from './useTransactions';

const MAX_P2P_CSV_BYTES = 10 * 1024 * 1024; // 10 MB

export interface P2PImportSaveResult {
  /** Net spending transactions written to the ledger. */
  readonly created: number;
  /** Reimbursements + transfers intentionally excluded from the budget. */
  readonly excluded: number;
  /** Rows that failed to save. */
  readonly failed: number;
}

export interface UseP2PImportResult {
  fileName: string | null;
  plan: P2PImportPlan | null;
  overrides: Readonly<Record<number, P2POverride>>;
  parseError: string | null;
  selectedAccountId: string | null;
  importing: boolean;
  saveResult: P2PImportSaveResult | null;
  loadFile: (file: File) => Promise<void>;
  setOverride: (index: number, override: P2POverride | null) => void;
  setSelectedAccountId: (id: string) => void;
  confirmImport: () => void;
  reset: () => void;
}

export function useP2PImport(): UseP2PImportResult {
  const { accounts } = useAccounts();
  const { createTransaction } = useTransactions();

  const [fileName, setFileName] = useState<string | null>(null);
  const [basePlan, setBasePlan] = useState<P2PImportPlan | null>(null);
  const [overrides, setOverrides] = useState<Record<number, P2POverride>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [saveResult, setSaveResult] = useState<P2PImportSaveResult | null>(null);

  // Recompute the plan with the current overrides without re-parsing the file.
  const plan = useMemo<P2PImportPlan | null>(() => {
    if (basePlan === null) return null;
    if (Object.keys(overrides).length === 0) return basePlan;
    return applyOverrides(basePlan, overrides);
  }, [basePlan, overrides]);

  const loadFile = useCallback(async (file: File): Promise<void> => {
    setSaveResult(null);
    setOverrides({});

    if (file.size > MAX_P2P_CSV_BYTES) {
      setParseError('File is too large. Please choose a CSV under 10 MB.');
      setBasePlan(null);
      setFileName(null);
      return;
    }

    try {
      const content = await file.text();
      const nextPlan = buildP2PImportPlan(content);
      if (nextPlan.provider === null) {
        setParseError(
          'This file does not look like a Venmo or Cash App export. Expected date, note, and amount columns.',
        );
        setBasePlan(null);
        setFileName(file.name);
        return;
      }
      setParseError(null);
      setBasePlan(nextPlan);
      setFileName(file.name);
    } catch {
      setParseError('Could not read the selected file.');
      setBasePlan(null);
      setFileName(null);
    }
  }, []);

  const setOverride = useCallback((index: number, override: P2POverride | null): void => {
    setSaveResult(null);
    setOverrides((prev) => {
      const next = { ...prev };
      if (override === null) {
        delete next[index];
      } else {
        next[index] = override;
      }
      return next;
    });
  }, []);

  const confirmImport = useCallback((): void => {
    if (plan === null || selectedAccountId === null || importing) return;

    const account = accounts.find((candidate) => candidate.id === selectedAccountId);
    if (account === undefined) {
      setParseError('Select a valid destination account before importing.');
      return;
    }

    setImporting(true);
    const importable = buildImportableTransactions(plan);

    let created = 0;
    let failed = 0;

    for (const transaction of importable) {
      const tags = transaction.isNetted ? ['p2p-import', 'net-of-reimbursement'] : ['p2p-import'];
      const noteSuffix = transaction.isNetted
        ? ` (net of ${formatReimbursed(transaction.reimbursedCents)} reimbursed)`
        : '';
      const result = createTransaction({
        householdId: account.householdId as SyncId,
        accountId: account.id,
        type: 'EXPENSE',
        amount: { amount: Math.abs(transaction.amountCents) },
        payee: transaction.payee || null,
        note: `${transaction.note || 'P2P payment'}${noteSuffix}`.trim(),
        date: transaction.date,
        tags,
      });
      if (result !== null) {
        created += 1;
      } else {
        failed += 1;
      }
    }

    const excluded = plan.summary.reimbursementCount + plan.summary.transferCount;
    setSaveResult({ created, excluded, failed });
    setImporting(false);
  }, [accounts, createTransaction, importing, plan, selectedAccountId]);

  const reset = useCallback((): void => {
    setFileName(null);
    setBasePlan(null);
    setOverrides({});
    setParseError(null);
    setSaveResult(null);
    setImporting(false);
  }, []);

  return {
    fileName,
    plan,
    overrides,
    parseError,
    selectedAccountId,
    importing,
    saveResult,
    loadFile,
    setOverride,
    setSelectedAccountId,
    confirmImport,
    reset,
  };
}

function formatReimbursed(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  return `$${dollars.toFixed(2)}`;
}
