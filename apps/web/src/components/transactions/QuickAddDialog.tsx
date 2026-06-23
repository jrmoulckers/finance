// SPDX-License-Identifier: BUSL-1.1

/**
 * Quick Add dialog body — the compact bottom-sheet form opened by the
 * {@link QuickAddTransaction} FAB.
 *
 * Lazy-loaded (default export) so it lands in its own async chunk and does not
 * weigh down the chronically-saturated Transactions route chunk.
 *
 * One-thumb expense capture:
 *   - Instant presets (cash, coffee, lunch, transit) prefill a category plus a
 *     sensible, user-adjustable default amount.
 *   - Remembered last-used account/category as defaults.
 *   - Payee is optional/skippable for true on-the-go capture.
 *
 * All money values are integer cents — never floats. Expenses are stored as
 * negative cents, matching the existing Voice/quick paths.
 *
 * References: issue #2167
 * @module components/transactions/QuickAddDialog
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FC, type FormEvent } from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import type { CreateTransactionInput } from '../../db/repositories/transactions';
import type { Account, Category } from '../../kmp/bridge';
import {
  QUICK_ADD_PRESETS,
  centsToDollars,
  dollarsToCents,
  loadQuickAddDefaults,
  resolvePresetCategoryId,
  saveQuickAddDefaults,
  todayISO,
  type QuickAddPreset,
} from '../../lib/transactions/quick-add-defaults';

const PRESET_EMOJI: Record<QuickAddPreset['id'], string> = {
  cash: '💵',
  coffee: '☕',
  lunch: '🍔',
  transit: '🚌',
};

export interface QuickAddDialogProps {
  /** Available accounts; the remembered or first account is selected by default. */
  accounts: Account[];
  /** Available categories used for presets and the category quick-pick. */
  categories: Category[];
  /** Create a transaction through the page's existing data path. */
  onCreate: (input: CreateTransactionInput) => void | Promise<void>;
  /** Close the dialog (restores focus to the FAB). */
  onClose: () => void;
  /** Id wired to the dialog heading via `aria-labelledby`. */
  titleId: string;
}

/** Compact, accessible quick-add expense form. */
const QuickAddDialog: FC<QuickAddDialogProps> = ({
  accounts,
  categories,
  onCreate,
  onClose,
  titleId,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const spendingCategories = useMemo(
    () => categories.filter((category) => !category.isIncome),
    [categories],
  );

  const [amountText, setAmountText] = useState('');
  const [payee, setPayee] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [activePreset, setActivePreset] = useState<QuickAddPreset['id'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Trap focus inside the sheet and restore focus to the opener on unmount.
  useFocusTrap(sheetRef, { active: true, restoreFocus: true });

  // Seed remembered defaults and focus the amount field on open.
  useEffect(() => {
    const defaults = loadQuickAddDefaults();
    const validAccount =
      accounts.find((account) => account.id === defaults.accountId) ?? accounts[0];
    setAccountId(validAccount?.id ?? '');

    const validCategory = spendingCategories.find(
      (category) => category.id === defaults.categoryId,
    );
    setCategoryId(validCategory?.id ?? '');

    const frame = requestAnimationFrame(() => amountRef.current?.focus());
    return () => cancelAnimationFrame(frame);
    // Seed once on mount; subsequent edits are user-driven.
  }, []);

  const applyPreset = useCallback(
    (preset: QuickAddPreset) => {
      setAmountText(centsToDollars(preset.defaultCents));
      setCategoryId(resolvePresetCategoryId(preset, spendingCategories) ?? '');
      setActivePreset(preset.id);
      setError(null);
      requestAnimationFrame(() => amountRef.current?.focus());
    },
    [spendingCategories],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      const cents = dollarsToCents(amountText);
      if (cents <= 0) {
        setError('Enter an amount greater than zero.');
        amountRef.current?.focus();
        return;
      }

      const selectedAccount = accounts.find((account) => account.id === accountId);
      if (!selectedAccount) {
        setError('Select an account.');
        return;
      }

      // Expenses are stored as negative cents (integer math only).
      const signedAmount = -Math.abs(cents);
      const resolvedCategoryId = categoryId || null;

      const input: CreateTransactionInput = {
        householdId: selectedAccount.householdId,
        accountId: selectedAccount.id,
        type: 'EXPENSE',
        amount: { amount: signedAmount },
        currency: selectedAccount.currency,
        payee: payee.trim() || null,
        date: todayISO(),
        categoryId: resolvedCategoryId,
        note: null,
      };

      setSaving(true);
      setError(null);

      try {
        await Promise.resolve(onCreate(input));
        saveQuickAddDefaults({ accountId: selectedAccount.id, categoryId: resolvedCategoryId });
        onClose();
      } catch (caught) {
        setSaving(false);
        setError(caught instanceof Error ? caught.message : 'Could not save. Please try again.');
      }
    },
    [accountId, accounts, amountText, categoryId, onClose, onCreate, payee],
  );

  const amountErrorId = `${titleId}-amount-error`;
  const hasError = Boolean(error);

  return (
    <div role="presentation" onKeyDown={handleKeyDown}>
      <div className="quick-add-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={sheetRef}
        className="quick-add-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="quick-add-sheet"
      >
        <div className="quick-add-sheet__header">
          <h2 id={titleId} className="quick-add-sheet__title">
            Quick add expense
          </h2>
          <button
            type="button"
            className="quick-add-sheet__close"
            onClick={onClose}
            aria-label="Close quick add"
            data-testid="quick-add-close"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {/* Instant presets */}
        <div
          className="quick-add-presets"
          role="group"
          aria-label="Instant presets"
          data-testid="quick-add-presets"
        >
          {QUICK_ADD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="quick-add-preset"
              onClick={() => applyPreset(preset)}
              aria-pressed={activePreset === preset.id}
              data-testid={`quick-add-preset-${preset.id}`}
            >
              <span className="quick-add-preset__emoji" aria-hidden="true">
                {PRESET_EMOJI[preset.id]}
              </span>
              {preset.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="quick-add-error" role="alert" data-testid="quick-add-error">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Amount */}
          <div className="quick-add-field">
            <label className="quick-add-field__label" htmlFor={`${titleId}-amount`}>
              Amount
            </label>
            <input
              ref={amountRef}
              id={`${titleId}-amount`}
              className="quick-add-input quick-add-input--amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amountText}
              onChange={(event) => {
                setAmountText(event.target.value);
                setActivePreset(null);
                setError(null);
              }}
              aria-required="true"
              aria-invalid={hasError}
              aria-describedby={hasError ? amountErrorId : undefined}
              data-testid="quick-add-amount"
            />
            {hasError && (
              <span id={amountErrorId} hidden>
                {error}
              </span>
            )}
          </div>

          {/* Payee (optional / skippable) */}
          <div className="quick-add-field">
            <label className="quick-add-field__label" htmlFor={`${titleId}-payee`}>
              Payee <span className="quick-add-field__optional">(optional)</span>
            </label>
            <input
              id={`${titleId}-payee`}
              className="quick-add-input"
              type="text"
              autoComplete="off"
              placeholder="Skip for on-the-go capture"
              value={payee}
              onChange={(event) => setPayee(event.target.value)}
              data-testid="quick-add-payee"
            />
          </div>

          {/* Category quick-pick */}
          <div className="quick-add-field">
            <label className="quick-add-field__label" htmlFor={`${titleId}-category`}>
              Category <span className="quick-add-field__optional">(optional)</span>
            </label>
            <select
              id={`${titleId}-category`}
              className="quick-add-select"
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setActivePreset(null);
              }}
              data-testid="quick-add-category"
            >
              <option value="">Skip category</option>
              {spendingCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* Account (hidden when only one is available) */}
          {accounts.length > 1 && (
            <div className="quick-add-field">
              <label className="quick-add-field__label" htmlFor={`${titleId}-account`}>
                Account
              </label>
              <select
                id={`${titleId}-account`}
                className="quick-add-select"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                data-testid="quick-add-account"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="quick-add-actions">
            <button
              type="button"
              className="quick-add-btn quick-add-btn--cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="quick-add-btn quick-add-btn--save"
              disabled={saving}
              aria-busy={saving}
              data-testid="quick-add-save"
            >
              {saving ? 'Saving…' : 'Save expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickAddDialog;
