// SPDX-License-Identifier: BUSL-1.1

/**
 * Natural Language Transaction Input component.
 *
 * Enhanced text input that parses "Coffee at Starbucks $4.50" into a
 * structured transaction, with:
 * - Inline parsing preview with per-field confidence indicators
 * - Suggestion chips (merchant history + common templates)
 * - Multi-language locale-aware input
 * - Quick-fix UI (click a parsed tag to correct it)
 * - Recent NLP inputs history
 * - Full WCAG 2.2 AA keyboard + screen reader accessibility
 *
 * References: issue #322, #1142
 */

import { useCallback, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

import { useNaturalLanguageInput } from '../../hooks/useNaturalLanguageInput';
import type { EditableField } from '../../hooks/useNaturalLanguageInput';

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
    recentInputs,
    merchantSuggestions,
    addToHistory,
    clearHistory,
    quickFixField,
    editingField,
    setEditingField,
    locale,
    setLocale,
  } = useNaturalLanguageInput();

  const inputRef = useRef<HTMLInputElement>(null);
  const quickFixRef = useRef<HTMLInputElement>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [showLocaleMenu, setShowLocaleMenu] = useState(false);

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

      addToHistory();
      clearInput();
      setShowSuggestions(false);
      setShowRecent(false);
    },
    [isValid, parsedTransaction, onSubmit, clearInput, addToHistory],
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
      setShowRecent(false);
    },
    [setInputText],
  );

  /** Handle quick-fix: user clicks a parsed tag to edit it. */
  const handleQuickFixSubmit = useCallback(
    (field: EditableField, value: string) => {
      quickFixField(field, value);
    },
    [quickFixField],
  );

  /** Start editing a field via quick-fix. */
  const startQuickFix = useCallback(
    (field: EditableField) => {
      setEditingField(field);
      // Focus the inline edit input after render
      requestAnimationFrame(() => quickFixRef.current?.focus());
    },
    [setEditingField],
  );

  const confidenceLevel =
    parsedTransaction?.confidence != null
      ? parsedTransaction.confidence >= 0.7
        ? 'high'
        : parsedTransaction.confidence >= 0.4
          ? 'medium'
          : 'low'
      : null;

  /** Supported locales for the locale picker. */
  const SUPPORTED_LOCALES = [
    { code: 'en-US', label: 'English (US)' },
    { code: 'en-GB', label: 'English (UK)' },
    { code: 'de-DE', label: 'Deutsch' },
    { code: 'fr-FR', label: 'Français' },
    { code: 'es-ES', label: 'Español' },
    { code: 'pt-BR', label: 'Português' },
  ];

  return (
    <div className="nl-input-wrapper">
      <form onSubmit={handleSubmit} noValidate className="nl-input-form">
        <div className="nl-input-container">
          <div className="nl-input-label-row">
            <label htmlFor="nl-transaction-input" className="nl-input-label">
              Quick Add Transaction
            </label>

            {/* Locale picker */}
            <div className="nl-locale-picker">
              <button
                type="button"
                className="nl-locale-button"
                onClick={() => setShowLocaleMenu((v) => !v)}
                aria-label={`Current locale: ${locale}. Click to change.`}
                aria-expanded={showLocaleMenu}
                aria-haspopup="listbox"
              >
                🌐 {locale}
              </button>
              {showLocaleMenu && (
                <ul className="nl-locale-menu" role="listbox" aria-label="Select input locale">
                  {SUPPORTED_LOCALES.map((loc) => (
                    <li
                      key={loc.code}
                      role="option"
                      aria-selected={locale === loc.code}
                      className={`nl-locale-option ${locale === loc.code ? 'nl-locale-option--active' : ''}`}
                      onMouseDown={() => {
                        setLocale(loc.code);
                        setShowLocaleMenu(false);
                      }}
                    >
                      {loc.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="nl-input-field-wrapper">
            <input
              ref={inputRef}
              id="nl-transaction-input"
              className="nl-input-field"
              type="text"
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setShowSuggestions(true);
                if (!inputText) setShowRecent(true);
              }}
              onBlur={() =>
                setTimeout(() => {
                  setShowSuggestions(false);
                  setShowRecent(false);
                  setShowLocaleMenu(false);
                }, 200)
              }
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
                  <span className="nl-suggestion-text">{suggestion.text}</span>
                  {suggestion.source === 'history' && (
                    <span className="nl-suggestion-badge" aria-label="From history">
                      🕐
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Recent inputs dropdown (shown when input is empty and focused) */}
          {showRecent && !inputText && recentInputs.length > 0 && (
            <div className="nl-recent-panel" role="region" aria-label="Recent inputs">
              <div className="nl-recent-header">
                <span className="nl-recent-title">Recent</span>
                <button
                  type="button"
                  className="nl-recent-clear"
                  onMouseDown={() => clearHistory()}
                  aria-label="Clear recent inputs history"
                >
                  Clear
                </button>
              </div>
              <ul className="nl-recent-list" role="list" aria-label="Recent transaction inputs">
                {recentInputs.slice(0, 5).map((recent) => (
                  <li
                    key={recent.id}
                    className="nl-recent-item"
                    role="listitem"
                    onMouseDown={() => {
                      setInputText(recent.text);
                      setShowRecent(false);
                    }}
                  >
                    <span className="nl-recent-item__text">{recent.text}</span>
                    <span className="nl-recent-item__time" aria-hidden="true">
                      {new Date(recent.timestamp).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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

      {/* Merchant suggestion chips */}
      {merchantSuggestions.length > 0 && inputText.length >= 2 && (
        <div
          className="nl-merchant-chips"
          role="region"
          aria-label="Merchant suggestions from history"
        >
          {merchantSuggestions.map((merchant) => (
            <button
              key={merchant}
              type="button"
              className="nl-merchant-chip"
              onClick={() => handleInputChange(`${inputText} at ${merchant}`)}
              aria-label={`Use merchant: ${merchant}`}
            >
              {merchant}
            </button>
          ))}
        </div>
      )}

      {/* Parsed preview with per-field confidence + quick-fix */}
      {parsedTransaction && inputText.trim() && (
        <div
          className="nl-parsed-preview"
          aria-live="polite"
          aria-label="Parsed transaction preview"
        >
          <div className="nl-parsed-preview__fields">
            {parsedTransaction.payee && (
              <ParsedTag
                field="payee"
                icon="📍"
                label={parsedTransaction.payee}
                confidence={parsedTransaction.fieldConfidences.payee}
                editingField={editingField}
                quickFixRef={quickFixRef}
                onStartEdit={startQuickFix}
                onSubmitFix={handleQuickFixSubmit}
                onCancelEdit={() => setEditingField(null)}
              />
            )}
            {parsedTransaction.amountCents != null && (
              <ParsedTag
                field="amount"
                icon="💰"
                label={formatCents(parsedTransaction.amountCents)}
                confidence={parsedTransaction.fieldConfidences.amount}
                editingField={editingField}
                quickFixRef={quickFixRef}
                onStartEdit={startQuickFix}
                onSubmitFix={handleQuickFixSubmit}
                onCancelEdit={() => setEditingField(null)}
              />
            )}
            {parsedTransaction.category && (
              <ParsedTag
                field="category"
                icon="🏷️"
                label={parsedTransaction.category}
                confidence={parsedTransaction.fieldConfidences.category}
                editingField={editingField}
                quickFixRef={quickFixRef}
                onStartEdit={startQuickFix}
                onSubmitFix={handleQuickFixSubmit}
                onCancelEdit={() => setEditingField(null)}
              />
            )}
            {parsedTransaction.date && (
              <ParsedTag
                field="date"
                icon="📅"
                label={parsedTransaction.date}
                confidence={parsedTransaction.fieldConfidences.date}
                editingField={editingField}
                quickFixRef={quickFixRef}
                onStartEdit={startQuickFix}
                onSubmitFix={handleQuickFixSubmit}
                onCancelEdit={() => setEditingField(null)}
              />
            )}
            <ParsedTag
              field="type"
              icon={
                parsedTransaction.type === 'INCOME'
                  ? '📈'
                  : parsedTransaction.type === 'TRANSFER'
                    ? '🔄'
                    : '📉'
              }
              label={parsedTransaction.type}
              confidence={parsedTransaction.fieldConfidences.type}
              editingField={editingField}
              quickFixRef={quickFixRef}
              onStartEdit={startQuickFix}
              onSubmitFix={handleQuickFixSubmit}
              onCancelEdit={() => setEditingField(null)}
            />
          </div>

          {confidenceLevel && (
            <div
              className={`nl-confidence nl-confidence--${confidenceLevel}`}
              role="meter"
              aria-valuenow={Math.round((parsedTransaction.confidence ?? 0) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Parse confidence: ${Math.round((parsedTransaction.confidence ?? 0) * 100)}%`}
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

// ---------------------------------------------------------------------------
// ParsedTag sub-component (quick-fix enabled)
// ---------------------------------------------------------------------------

interface ParsedTagProps {
  field: EditableField;
  icon: string;
  label: string;
  confidence: { value: number; label: string };
  editingField: EditableField | null;
  quickFixRef: React.RefObject<HTMLInputElement | null>;
  onStartEdit: (field: EditableField) => void;
  onSubmitFix: (field: EditableField, value: string) => void;
  onCancelEdit: () => void;
}

function ParsedTag({
  field,
  icon,
  label,
  confidence,
  editingField,
  quickFixRef,
  onStartEdit,
  onSubmitFix,
  onCancelEdit,
}: ParsedTagProps) {
  const isEditing = editingField === field;
  const [editValue, setEditValue] = useState(label);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmitFix(field, editValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelEdit();
    }
  };

  if (isEditing) {
    return (
      <span className={`nl-parsed-tag nl-parsed-tag--${field} nl-parsed-tag--editing`}>
        <span aria-hidden="true">{icon}</span>
        <input
          ref={quickFixRef}
          className="nl-quickfix-input"
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            onSubmitFix(field, editValue);
          }}
          aria-label={`Edit ${field} value`}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`nl-parsed-tag nl-parsed-tag--${field} nl-parsed-tag--clickable`}
      onClick={() => {
        setEditValue(label);
        onStartEdit(field);
      }}
      aria-label={`${field}: ${label} (${confidence.label} confidence, ${Math.round(confidence.value * 100)}%). Click to edit.`}
      title={`Click to correct ${field}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <span
        className={`nl-field-confidence nl-field-confidence--${confidence.label}`}
        aria-hidden="true"
      />
    </button>
  );
}
