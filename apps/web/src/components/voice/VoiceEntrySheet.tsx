// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import type { CreateTransactionInput } from '../../db/repositories/transactions';
import type { Account, Category, TransactionType } from '../../kmp/bridge';
import { createVoiceRecognition, isVoiceRecognitionSupported } from '../../lib/voice/recognition';
import { parseVoiceTransaction } from '../../lib/voice/transactionParser';
import type {
  VoiceConfirmationDraft,
  VoiceRecognitionController,
  VoiceRecognitionError,
  VoiceState,
} from '../../lib/voice/types';
import { VoiceButton } from './VoiceButton';
import { VoiceConfirmation } from './VoiceConfirmation';
import { VoiceTranscript } from './VoiceTranscript';

import '../forms/forms.css';
import './voice-entry.css';

const LAST_ACCOUNT_KEY = 'finance:voice-entry-last-account';

export interface VoiceEntrySheetProps {
  readonly isOpen: boolean;
  readonly accounts: Account[];
  readonly categories: Category[];
  readonly onClose: () => void;
  readonly onSubmit: (input: CreateTransactionInput) => Promise<void> | void;
  readonly onRequestManualEntry?: () => void;
}

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function centsToDollars(amountCents: number | null): string {
  return amountCents != null ? (amountCents / 100).toFixed(2) : '';
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function getLastAccountId(): string {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberAccountId(accountId: string): void {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
  } catch {
    // Ignore localStorage failures.
  }
}

function getDefaultAccountId(accounts: readonly Account[]): string {
  const lastAccountId = getLastAccountId();
  return accounts.find((account) => account.id === lastAccountId)?.id ?? accounts[0]?.id ?? '';
}

function matchAccountId(name: string | null, accounts: readonly Account[], excludeId = ''): string {
  if (!name) {
    return '';
  }

  const normalizedName = normalizeName(name);
  const exactMatch = accounts.find(
    (account) => account.id !== excludeId && normalizeName(account.name) === normalizedName,
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  const fuzzyMatch = accounts.find(
    (account) =>
      account.id !== excludeId &&
      (normalizeName(account.name).includes(normalizedName) ||
        normalizedName.includes(normalizeName(account.name))),
  );
  return fuzzyMatch?.id ?? '';
}

function matchCategoryId(
  name: string | null,
  categories: readonly Category[],
  type: TransactionType,
): string {
  if (!name) {
    return '';
  }

  const relevantCategories =
    type === 'INCOME' ? categories.filter((category) => category.isIncome) : categories;
  const normalizedName = normalizeName(name);
  const exactMatch = relevantCategories.find(
    (category) => normalizeName(category.name) === normalizedName,
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  const fuzzyMatch = relevantCategories.find((category) => {
    const normalizedCategory = normalizeName(category.name);
    return (
      normalizedCategory.includes(normalizedName) || normalizedName.includes(normalizedCategory)
    );
  });
  return fuzzyMatch?.id ?? '';
}

function buildDefaultDraft(accounts: readonly Account[]): VoiceConfirmationDraft {
  return {
    type: 'EXPENSE',
    amount: '',
    payee: '',
    date: todayISO(),
    categoryId: '',
    accountId: getDefaultAccountId(accounts),
    transferAccountId: '',
    counterpartyName: '',
    note: '',
  };
}

function buildDraftFromParsed(
  parsed: ReturnType<typeof parseVoiceTransaction>,
  accounts: readonly Account[],
  categories: readonly Category[],
): VoiceConfirmationDraft {
  const defaultAccountId = getDefaultAccountId(accounts);
  const accountId = defaultAccountId;
  const transferAccountId =
    parsed.type === 'TRANSFER' ? matchAccountId(parsed.transferAccount, accounts, accountId) : '';

  return {
    type: parsed.type,
    amount: centsToDollars(parsed.amountCents),
    payee:
      parsed.payee ??
      (parsed.type === 'TRANSFER'
        ? parsed.transferAccount
          ? `Transfer to ${parsed.transferAccount}`
          : 'Transfer'
        : ''),
    date: parsed.date ?? todayISO(),
    categoryId: matchCategoryId(parsed.category, categories, parsed.type),
    accountId,
    transferAccountId,
    counterpartyName: parsed.splitWith ?? '',
    note: parsed.note ?? '',
  };
}

function normalizeAmountCents(amountText: string, type: TransactionType): number | null {
  const parsed = Number.parseFloat(amountText.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  const cents = Math.round(parsed * 100);
  if (type === 'EXPENSE') {
    return -Math.abs(cents);
  }
  if (type === 'INCOME') {
    return Math.abs(cents);
  }
  return cents;
}

export function VoiceEntrySheet({
  isOpen,
  accounts,
  categories,
  onClose,
  onSubmit,
  onRequestManualEntry,
}: VoiceEntrySheetProps) {
  const supported = useMemo(() => isVoiceRecognitionSupported(), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<VoiceRecognitionController | null>(null);

  const [voiceState, setVoiceState] = useState<VoiceState>(supported ? 'idle' : 'unsupported');
  const [recognitionError, setRecognitionError] = useState<VoiceRecognitionError | null>(null);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [draft, setDraft] = useState<VoiceConfirmationDraft>(() => buildDefaultDraft(accounts));
  const [hasManualEdits, setHasManualEdits] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useFocusTrap(panelRef, { active: isOpen, restoreFocus: true });

  const combinedTranscript = [finalTranscript, interimTranscript].filter(Boolean).join(' ').trim();
  const parsedTransaction = useMemo(
    () => (combinedTranscript ? parseVoiceTransaction(combinedTranscript) : null),
    [combinedTranscript],
  );

  const resetCapture = useCallback(() => {
    recognitionRef.current?.abort();
    setVoiceState(supported ? 'idle' : 'unsupported');
    setRecognitionError(null);
    setFinalTranscript('');
    setInterimTranscript('');
    setDraft(buildDefaultDraft(accounts));
    setHasManualEdits(false);
    setSubmitError(null);
    setSubmitting(false);
  }, [accounts, supported]);

  useEffect(() => {
    if (!isOpen) {
      recognitionRef.current?.dispose();
      recognitionRef.current = null;
      return;
    }

    resetCapture();

    if (!supported) {
      return;
    }

    const language = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
    recognitionRef.current = createVoiceRecognition(
      {
        onStateChange: setVoiceState,
        onTranscript: (update) => {
          setFinalTranscript(update.finalTranscript);
          setInterimTranscript(update.interimTranscript);
          setRecognitionError(null);
        },
        onError: (error) => {
          setRecognitionError(error);
          if (!error.recoverable) {
            setInterimTranscript('');
          }
        },
      },
      { language },
    );

    return () => {
      recognitionRef.current?.dispose();
      recognitionRef.current = null;
    };
  }, [isOpen, resetCapture, supported]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!parsedTransaction || hasManualEdits) {
      return;
    }

    setDraft(buildDraftFromParsed(parsedTransaction, accounts, categories));
  }, [accounts, categories, hasManualEdits, parsedTransaction]);

  const handleStart = useCallback(() => {
    if (!supported) {
      return;
    }

    setRecognitionError(null);
    setSubmitError(null);
    setHasManualEdits(false);
    setFinalTranscript('');
    setInterimTranscript('');
    recognitionRef.current?.start();
  }, [supported]);

  const handleStop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const handleDraftChange = useCallback((patch: Partial<VoiceConfirmationDraft>) => {
    setHasManualEdits(true);
    setDraft((currentDraft) => ({ ...currentDraft, ...patch }));
  }, []);

  const handleConfirm = useCallback(async () => {
    const selectedAccount = accounts.find((account) => account.id === draft.accountId);
    if (!selectedAccount) {
      setSubmitError('Choose the account to save this transaction into.');
      return;
    }

    if (!draft.payee.trim()) {
      setSubmitError('Add a payee or description before saving.');
      return;
    }

    const normalizedAmount = normalizeAmountCents(draft.amount, draft.type);
    if (normalizedAmount === null) {
      setSubmitError('Enter a valid amount before saving.');
      return;
    }

    if (draft.type === 'TRANSFER' && !draft.transferAccountId) {
      setSubmitError('Choose the destination account for this transfer.');
      return;
    }

    if (draft.type === 'TRANSFER' && draft.transferAccountId === draft.accountId) {
      setSubmitError('Transfers need a different destination account.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const input: CreateTransactionInput = {
      householdId: selectedAccount.householdId,
      accountId: selectedAccount.id,
      type: draft.type,
      amount: { amount: normalizedAmount },
      currency: selectedAccount.currency,
      payee: draft.payee.trim(),
      date: draft.date || todayISO(),
      categoryId: draft.type === 'TRANSFER' ? null : draft.categoryId || null,
      note: draft.note.trim() || null,
      transferAccountId: draft.type === 'TRANSFER' ? draft.transferAccountId : null,
      counterpartyName: draft.counterpartyName.trim() || null,
    };

    try {
      rememberAccountId(draft.accountId);
      await onSubmit(input);
      onClose();
      resetCapture();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save the voice entry.');
    } finally {
      setSubmitting(false);
    }
  }, [accounts, draft, onClose, onSubmit, resetCapture]);

  const handleClose = useCallback(() => {
    resetCapture();
    onClose();
  }, [onClose, resetCapture]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="voice-entry-sheet" role="presentation">
      <button
        type="button"
        className="voice-entry-sheet__backdrop"
        aria-label="Close voice transaction entry"
        onClick={handleClose}
      />
      <div
        ref={panelRef}
        className="voice-entry-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-entry-title"
      >
        <header className="voice-entry-sheet__header">
          <div>
            <h2 id="voice-entry-title" className="voice-entry-sheet__title">
              Voice transaction entry
            </h2>
            <p className="voice-entry-sheet__subtitle">
              Capture a transaction locally with your browser microphone.
            </p>
          </div>
          <button
            type="button"
            className="voice-entry-sheet__close"
            aria-label="Close voice transaction entry"
            onClick={handleClose}
          >
            ×
          </button>
        </header>

        {!supported ? (
          <section className="voice-entry-sheet__fallback" aria-label="Voice fallback">
            <p>This browser does not expose the Web Speech API, so voice capture is unavailable.</p>
            {onRequestManualEntry && (
              <button type="button" className="add-button" onClick={onRequestManualEntry}>
                Use manual entry instead
              </button>
            )}
          </section>
        ) : (
          <>
            <div className="voice-entry-sheet__controls">
              <VoiceButton
                supported={supported}
                state={voiceState}
                onStart={handleStart}
                onStop={handleStop}
              />
              <p className="voice-entry-sheet__hint">
                Supports “spent”, “paid”, “received”, “transferred”, and “split” phrases.
              </p>
            </div>

            <VoiceTranscript
              finalTranscript={finalTranscript}
              interimTranscript={interimTranscript}
              parsedTransaction={parsedTransaction}
              state={voiceState}
              errorMessage={recognitionError?.message ?? null}
            />

            {parsedTransaction && combinedTranscript && (
              <VoiceConfirmation
                draft={draft}
                parsedTransaction={parsedTransaction}
                accounts={accounts}
                categories={categories}
                errorMessage={submitError}
                submitting={submitting}
                onChange={handleDraftChange}
                onConfirm={handleConfirm}
                onRetry={resetCapture}
                onUseManualEntry={onRequestManualEntry}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
