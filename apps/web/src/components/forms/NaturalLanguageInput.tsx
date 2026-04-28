// SPDX-License-Identifier: BUSL-1.1

/**
 * Natural language transaction input component.
 *
 * Provides a single text input that parses free-text like
 * "coffee at starbucks $5.50" into structured transaction data.
 * Shows a live preview of the parsed result as the user types.
 *
 * Accessibility:
 *   - Descriptive label and placeholder
 *   - aria-describedby for parse preview
 *   - Keyboard: Enter to submit, Escape to clear
 *   - role="status" for live parse feedback
 *
 * References: issue #322
 */

import React, { useCallback, useMemo, useState } from 'react';
import { parseNaturalLanguageTransaction, type ParsedTransaction } from '../../lib/nlParser';
import { centsFromDollars } from '../../kmp/bridge';
import type { CreateTransactionInput } from '../../db/repositories/transactions';
import type { Account, Category } from '../../kmp/bridge';

import '../../styles/nl-input.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NaturalLanguageInputProps {
  /** Available accounts for default assignment. */
  accounts: Account[];
  /** Available categories for matching category hints. */
  categories: Category[];
  /** Callback when a transaction is submitted. */
  onSubmit: (input: CreateTransactionInput) => void;
  /** Optional default account ID. */
  defaultAccountId?: string;
  /** Optional default household ID. */
  householdId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchCategory(hint: string | null, categories: Category[]): string | null {
  if (!hint) return null;
  const lower = hint.toLowerCase();
  return categories.find((c) => c.name.toLowerCase().includes(lower))?.id ?? null;
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High confidence';
  if (confidence >= 0.5) return 'Medium confidence';
  return 'Low confidence';
}

function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.8) return 'nl-input__confidence--high';
  if (confidence >= 0.5) return 'nl-input__confidence--medium';
  return 'nl-input__confidence--low';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NaturalLanguageInput: React.FC<NaturalLanguageInputProps> = ({
  accounts,
  categories,
  onSubmit,
  defaultAccountId,
  householdId = 'default',
}) => {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const parsed: ParsedTransaction | null = useMemo(() => {
    if (!input.trim()) return null;
    return parseNaturalLanguageTransaction(input);
  }, [input]);

  const accountId = defaultAccountId ?? accounts[0]?.id ?? '';
  const matchedCategoryId = parsed ? matchCategory(parsed.categoryHint, categories) : null;
  const matchedCategoryName = matchedCategoryId
    ? categories.find((c) => c.id === matchedCategoryId)?.name
    : null;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!parsed || parsed.amount === null || !accountId) return;

      const txInput: CreateTransactionInput = {
        householdId,
        accountId,
        categoryId: matchedCategoryId,
        type: parsed.type,
        amount: centsFromDollars(parsed.amount),
        payee: parsed.payee || null,
        date: parsed.date,
      };

      onSubmit(txInput);
      setInput('');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    },
    [parsed, accountId, householdId, matchedCategoryId, onSubmit],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setInput('');
    }
  }, []);

  const canSubmit = parsed !== null && parsed.amount !== null && accountId !== '';

  return (
    <form className="nl-input" onSubmit={handleSubmit}>
      <div className="nl-input__field">
        <label htmlFor="nl-transaction-input" className="nl-input__label">
          Quick add transaction
        </label>
        <input
          id="nl-transaction-input"
          type="text"
          className="nl-input__text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='e.g. "coffee at starbucks $5.50"'
          autoComplete="off"
          aria-describedby="nl-parse-preview"
        />
      </div>

      {/* Live parse preview */}
      {parsed && (
        <div id="nl-parse-preview" className="nl-input__preview" role="status" aria-live="polite">
          <div className="nl-input__preview-row">
            {parsed.amount !== null && (
              <span className="nl-input__preview-tag nl-input__preview-tag--amount">
                ${parsed.amount.toFixed(2)}
              </span>
            )}
            {parsed.payee && (
              <span className="nl-input__preview-tag nl-input__preview-tag--payee">
                {parsed.payee}
              </span>
            )}
            <span className="nl-input__preview-tag nl-input__preview-tag--type">{parsed.type}</span>
            <span className="nl-input__preview-tag nl-input__preview-tag--date">{parsed.date}</span>
            {matchedCategoryName && (
              <span className="nl-input__preview-tag nl-input__preview-tag--category">
                {matchedCategoryName}
              </span>
            )}
          </div>
          <div className="nl-input__preview-meta">
            <span
              className={`nl-input__confidence ${getConfidenceClass(parsed.confidence)}`}
              aria-label={`Parse confidence: ${getConfidenceLabel(parsed.confidence)}`}
            >
              {getConfidenceLabel(parsed.confidence)}
            </span>
          </div>
        </div>
      )}

      <button
        type="submit"
        className="nl-input__submit"
        disabled={!canSubmit}
        aria-label="Add transaction from natural language input"
      >
        Add
      </button>

      {submitted && (
        <div className="nl-input__success" role="status" aria-live="polite">
          Transaction added!
        </div>
      )}
    </form>
  );
};

export default NaturalLanguageInput;
