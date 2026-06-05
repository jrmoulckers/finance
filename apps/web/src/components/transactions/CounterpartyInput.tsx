// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible counterparty input with autocomplete dropdown.
 *
 * Provides a combobox (text input + listbox) for entering or selecting a
 * transaction counterparty. Sources suggestions from:
 * 1. Previously used counterparty names (frequency-sorted)
 * 2. Known merchant names from the merchant store
 *
 * When a known merchant is selected, fires `onMerchantMatch` so the parent
 * can auto-fill category from the merchant's `categoryDefault`.
 *
 * Accessibility:
 * - `role="combobox"` on input, `role="listbox"` on dropdown
 * - `aria-expanded`, `aria-activedescendant` for screen readers
 * - Full keyboard navigation (Arrow Up/Down, Enter, Escape)
 *
 * @module components/transactions/CounterpartyInput
 * References: issue #1514
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { KnownMerchant, MerchantMatchResult } from '../../lib/merchants';

import './counterparty-input.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for {@link CounterpartyInput}. */
export interface CounterpartyInputProps {
  /** Current counterparty name value. */
  value: string;
  /** Called when the user types or selects a counterparty. */
  onChange: (value: string) => void;
  /** Known merchants for autocomplete suggestions. */
  merchants: readonly KnownMerchant[];
  /** Previously used counterparty names (frequency-sorted, most used first). */
  recentCounterparties?: readonly string[];
  /** Called when the selected value matches a known merchant. */
  onMerchantMatch?: (result: MerchantMatchResult | null) => void;
  /** Match result from parent-level merchant matching (for indicator display). */
  matchResult?: MerchantMatchResult | null;
  /** HTML id for the input element. */
  id?: string;
  /** Whether the input is disabled. */
  disabled?: boolean;
  /** Placeholder text. */
  placeholder?: string;
  /** IDs of helper or error text that describe the input. */
  ariaDescribedBy?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Suggestion {
  /** Display label. */
  label: string;
  /** Source type for styling/grouping. */
  source: 'merchant' | 'recent';
  /** Optional category hint. */
  category?: string;
  /** The merchant object, if from merchant source. */
  merchant?: KnownMerchant;
}

/** Build deduplicated, filtered suggestion list. */
function buildSuggestions(
  query: string,
  merchants: readonly KnownMerchant[],
  recentCounterparties: readonly string[],
): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }

  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];

  // Recent counterparties first (already frequency-sorted)
  for (const name of recentCounterparties) {
    const lower = name.toLowerCase();
    if (lower.includes(q) && !seen.has(lower)) {
      seen.add(lower);
      suggestions.push({ label: name, source: 'recent' });
    }
  }

  // Known merchants
  for (const merchant of merchants) {
    const displayName = merchant.displayName ?? merchant.name;
    const lower = displayName.toLowerCase();
    if (lower.includes(q) && !seen.has(lower)) {
      seen.add(lower);
      suggestions.push({
        label: displayName,
        source: 'merchant',
        category: merchant.categoryDefault,
        merchant,
      });
    }
  }

  return suggestions.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible combobox input for transaction counterparty selection.
 *
 * Combines free-text entry with an autocomplete dropdown sourced from
 * known merchants and recently used counterparty names.
 */
export function CounterpartyInput({
  value,
  onChange,
  merchants,
  recentCounterparties = [],
  onMerchantMatch,
  matchResult,
  id: externalId,
  disabled = false,
  placeholder = 'Enter counterparty name',
  ariaDescribedBy,
}: CounterpartyInputProps) {
  const autoId = useId();
  const inputId = externalId ?? `counterparty-${autoId}`;
  const listboxId = `${inputId}-listbox`;

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const suggestions = useMemo(
    () => buildSuggestions(value, merchants, recentCounterparties),
    [value, merchants, recentCounterparties],
  );

  const showDropdown = isOpen && suggestions.length > 0;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (!inputRef.current?.contains(target) && !listboxRef.current?.contains(target)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const handleSelect = useCallback(
    (suggestion: Suggestion) => {
      onChange(suggestion.label);
      setIsOpen(false);
      setFocusedIndex(-1);

      if (suggestion.merchant && onMerchantMatch) {
        onMerchantMatch({
          merchant: suggestion.merchant,
          matchedPattern: '',
          confidence: 1,
        });
      }
    },
    [onChange, onMerchantMatch],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      setIsOpen(true);
      setFocusedIndex(-1);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (showDropdown && focusedIndex >= 0 && focusedIndex < suggestions.length) {
          handleSelect(suggestions[focusedIndex]);
          return;
        }
        setIsOpen(false);
        setFocusedIndex(-1);
        return;
      }

      if (!showDropdown) {
        if (e.key === 'ArrowDown' && suggestions.length > 0) {
          e.preventDefault();
          setIsOpen(true);
          setFocusedIndex(0);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setFocusedIndex(-1);
          break;
      }
    },
    [showDropdown, suggestions, focusedIndex, handleSelect],
  );

  const handleFocus = useCallback(() => {
    if (value.trim()) {
      setIsOpen(true);
    }
  }, [value]);

  const activeDescendantId = focusedIndex >= 0 ? `${listboxId}-option-${focusedIndex}` : undefined;

  return (
    <div className="counterparty-input">
      <div className="counterparty-input__wrapper">
        <input
          ref={inputRef}
          id={inputId}
          className="counterparty-input__field"
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendantId}
          aria-autocomplete="list"
          aria-describedby={ariaDescribedBy}
          autoComplete="off"
        />
      </div>

      {/* Matched indicator */}
      {matchResult && value.trim() && (
        <div className="counterparty-input__matched" role="status" aria-live="polite">
          <span className="counterparty-input__matched-icon" aria-hidden="true">
            ✓
          </span>
          Matched: {matchResult.merchant.displayName ?? matchResult.merchant.name}
        </div>
      )}

      {/* Dropdown */}
      {showDropdown && (
        <ul
          ref={listboxRef}
          id={listboxId}
          className="counterparty-input__listbox"
          role="listbox"
          aria-label="Counterparty suggestions"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.source}-${suggestion.label}`}
              id={`${listboxId}-option-${index}`}
              className={`counterparty-input__option${
                index === focusedIndex ? ' counterparty-input__option--focused' : ''
              }${suggestion.label === value ? ' counterparty-input__option--selected' : ''}`}
              role="option"
              aria-selected={index === focusedIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(suggestion);
              }}
            >
              <span>{suggestion.label}</span>
              {suggestion.category && (
                <span className="counterparty-input__option-category">{suggestion.category}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
