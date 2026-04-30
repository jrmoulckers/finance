// SPDX-License-Identifier: BUSL-1.1

/**
 * Natural Language Transaction Input component.
 *
 * Text input that parses "Coffee at Starbucks $4.50" into a
 * structured transaction, with autocomplete suggestions.
 *
 * References: issue #322
 */

import { useCallback, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

import { useNaturalLanguageInput } from '../../hooks/useNaturalLanguageInput';

import './NaturalLanguageInput.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NaturalLanguageInputProps {
  /** Called when the user submits a valid parsed transaction. */
  onSubmit: (parsed: {
    payee: string;
    amountCents: number;
    category: string | null;
    date: string | null;
    type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  }) => void;
  /** Placeholder text for the input. */
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NaturalLanguageInput({
  onSubmit,
  placeholder = 'Type a transaction, e.g. "Coffee at Starbucks $4.50"',
}: NaturalLanguageInputProps) {
  const {
    inputText,
    setInputText,
    parsedTransaction,
    suggestions,
    parsing,
    validationErrors,
    acceptSuggestion,
    clearInput,
    isValid,
  } = useNaturalLanguageInput();

  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const formatCents = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();

      if (!isValid || !parsedTransaction?.payee || !parsedTransaction.amountCents) {
        return;
      }

      onSubmit({
        payee: parsedTransaction.payee,
        amountCents: parsedTransaction.amountCents,
        category: parsedTransaction.category,
        date: parsedTransaction.date,
        type: parsedTransaction.type,
      });

      clearInput();
      setShowSuggestions(false);
    },
    [isValid, parsedTransaction, onSubmit, clearInput],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!showSuggestions || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
      } else if (e.key === 'Enter' && selectedSuggestion >= 0) {
        e.preventDefault();
        acceptSuggestion(suggestions[selectedSuggestion]!);
        setShowSuggestions(false);
        setSelectedSuggestion(-1);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
        setSelectedSuggestion(-1);
      }
    },
    [showSuggestions, suggestions, selectedSuggestion, acceptSuggestion],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setInputText(value);
      setShowSuggestions(true);
      setSelectedSuggestion(-1);
    },
    [setInputText],
  );

  const confidenceLevel =
    parsedTransaction?.confidence != null
      ? parsedTransaction.confidence >= 0.7
        ? 'high'
        : parsedTransaction.confidence >= 0.4
          ? 'medium'
          : 'low'
      : null;

  return (
    <div className="nl-input-wrapper">
      <form onSubmit={handleSubmit} noValidate className="nl-input-form">
        <div className="nl-input-container">
          <label htmlFor="nl-transaction-input" className="nl-input-label">
            Quick Add Transaction
          </label>
          <div className="nl-input-field-wrapper">
            <input
              ref={inputRef}
              id="nl-transaction-input"
              className="nl-input-field"
              type="text"
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder={placeholder}
              autoComplete="off"
              role="combobox"
              aria-expanded={showSuggestions && suggestions.length > 0}
              aria-controls="nl-suggestions-list"
              aria-activedescendant={
                selectedSuggestion >= 0 ? `nl-suggestion-${selectedSuggestion}` : undefined
              }
              aria-label="Natural language transaction input"
            />
            {inputText && (
              <button
                type="button"
                className="nl-input-clear"
                onClick={() => {
                  clearInput();
                  inputRef.current?.focus();
                }}
                aria-label="Clear input"
              >
                ×
              </button>
            )}
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <ul
              id="nl-suggestions-list"
              className="nl-suggestions"
              role="listbox"
              aria-label="Transaction suggestions"
            >
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.id}
                  id={`nl-suggestion-${index}`}
                  className={`nl-suggestion-item ${
                    index === selectedSuggestion ? 'nl-suggestion-item--selected' : ''
                  }`}
                  role="option"
                  aria-selected={index === selectedSuggestion}
                  onMouseDown={() => {
                    acceptSuggestion(suggestion);
                    setShowSuggestions(false);
                  }}
                >
                  {suggestion.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          className="nl-input-submit"
          disabled={!isValid || parsing}
          aria-label="Add transaction"
        >
          {parsing ? '…' : 'Add'}
        </button>
      </form>

      {/* Parsed preview */}
      {parsedTransaction && inputText.trim() && (
        <div
          className="nl-parsed-preview"
          aria-live="polite"
          aria-label="Parsed transaction preview"
        >
          <div className="nl-parsed-preview__fields">
            {parsedTransaction.payee && (
              <span className="nl-parsed-tag nl-parsed-tag--payee">
                📍 {parsedTransaction.payee}
              </span>
            )}
            {parsedTransaction.amountCents != null && (
              <span className="nl-parsed-tag nl-parsed-tag--amount">
                💰 {formatCents(parsedTransaction.amountCents)}
              </span>
            )}
            {parsedTransaction.category && (
              <span className="nl-parsed-tag nl-parsed-tag--category">
                🏷️ {parsedTransaction.category}
              </span>
            )}
            {parsedTransaction.date && (
              <span className="nl-parsed-tag nl-parsed-tag--date">📅 {parsedTransaction.date}</span>
            )}
            <span className="nl-parsed-tag nl-parsed-tag--type">
              {parsedTransaction.type === 'INCOME'
                ? '📈'
                : parsedTransaction.type === 'TRANSFER'
                  ? '🔄'
                  : '📉'}{' '}
              {parsedTransaction.type}
            </span>
          </div>

          {confidenceLevel && (
            <div
              className={`nl-confidence nl-confidence--${confidenceLevel}`}
              aria-label={`Parse confidence: ${confidenceLevel}`}
            >
              <span
                className="nl-confidence__bar"
                style={{ width: `${(parsedTransaction.confidence ?? 0) * 100}%` }}
              />
              <span className="nl-confidence__text">
                {Math.round((parsedTransaction.confidence ?? 0) * 100)}% match
              </span>
            </div>
          )}

          {validationErrors.length > 0 && (
            <ul className="nl-validation-errors" role="alert" aria-label="Validation errors">
              {validationErrors.map((err, i) => (
                <li key={i} className="nl-validation-error">
                  {err}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
