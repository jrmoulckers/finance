// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for natural language transaction input.
 *
 * Parses text like "Coffee at Starbucks $4.50" into structured
 * transaction data with autocomplete suggestions.
 *
 * Usage:
 * ```tsx
 * const { inputText, setInputText, parsedTransaction, suggestions } = useNaturalLanguageInput();
 * ```
 *
 * References: issue #322
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { TransactionType } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedTransaction {
  readonly payee: string | null;
  readonly amountCents: number | null;
  readonly category: string | null;
  readonly date: string | null;
  readonly type: TransactionType;
  readonly note: string | null;
  readonly confidence: number;
}

export interface NLSuggestion {
  readonly id: string;
  readonly text: string;
  readonly parsedTransaction: ParsedTransaction;
}

export interface UseNaturalLanguageInputResult {
  /** The current raw input text. */
  inputText: string;
  /** Update the input text and trigger re-parsing. */
  setInputText: (text: string) => void;
  /** The parsed transaction from the current input. */
  parsedTransaction: ParsedTransaction | null;
  /** Autocomplete suggestions based on input. */
  suggestions: NLSuggestion[];
  /** Whether parsing is in progress. */
  parsing: boolean;
  /** Validation errors for the parsed transaction. */
  validationErrors: string[];
  /** Accept a suggestion and update the input. */
  acceptSuggestion: (suggestion: NLSuggestion) => void;
  /** Clear the input. */
  clearInput: () => void;
  /** Whether the parsed transaction has enough data to submit. */
  isValid: boolean;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a natural language string into structured transaction data.
 *
 * Supports patterns like:
 * - "Coffee at Starbucks $4.50"
 * - "$25 groceries at Walmart"
 * - "Lunch 12.99"
 * - "Income $3000 salary"
 * - "Transfer $500 to savings"
 * - "Gas $45.00 01/15"
 */
export function parseTransactionText(text: string): ParsedTransaction {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      payee: null,
      amountCents: null,
      category: null,
      date: null,
      type: 'EXPENSE',
      note: null,
      confidence: 0,
    };
  }

  let payee: string | null = null;
  let amountCents: number | null = null;
  let category: string | null = null;
  let date: string | null = null;
  let type: TransactionType = 'EXPENSE';
  const note: string | null = null;
  let confidence = 0;

  // Extract amount: $4.50, 4.50, $1,234.56
  const amountMatch = trimmed.match(/\$?([\d,]+\.?\d{0,2})/);
  if (amountMatch) {
    const amountStr = amountMatch[1].replace(/,/g, '');
    const parsed = parseFloat(amountStr);
    if (!Number.isNaN(parsed) && parsed > 0) {
      amountCents = Math.round(parsed * 100);
      confidence += 0.4;
    }
  }

  // Extract date: MM/DD, MM-DD, MM/DD/YYYY
  const dateMatch = trimmed.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (dateMatch) {
    const month = dateMatch[1].padStart(2, '0');
    const day = dateMatch[2].padStart(2, '0');
    const year = dateMatch[3]
      ? dateMatch[3].length === 2
        ? `20${dateMatch[3]}`
        : dateMatch[3]
      : new Date().getFullYear().toString();
    date = `${year}-${month}-${day}`;
    confidence += 0.1;
  }

  // Detect type
  const lowerText = trimmed.toLowerCase();
  if (
    lowerText.includes('income') ||
    lowerText.includes('salary') ||
    lowerText.includes('deposit')
  ) {
    type = 'INCOME';
    confidence += 0.1;
  } else if (lowerText.includes('transfer') || lowerText.includes('move')) {
    type = 'TRANSFER';
    confidence += 0.1;
  }

  // Extract payee: "at <payee>" pattern
  const atMatch = trimmed.match(/\bat\s+([A-Za-z][\w\s&'.,-]*?)(?:\s*\$|\s*\d+[.,]|\s*$)/i);
  if (atMatch) {
    payee = atMatch[1].trim();
    confidence += 0.3;
  }

  // Category detection from common keywords
  const categoryKeywords: Record<string, string[]> = {
    Groceries: ['grocery', 'groceries', 'supermarket', 'walmart', 'costco', 'aldi', 'trader'],
    Dining: ['coffee', 'lunch', 'dinner', 'restaurant', 'starbucks', 'cafe', 'food', 'eat'],
    Transportation: ['gas', 'fuel', 'uber', 'lyft', 'parking', 'transit'],
    Utilities: ['electric', 'water', 'internet', 'phone', 'cable', 'utility'],
    Shopping: ['amazon', 'target', 'shop', 'buy', 'purchase', 'store'],
    Entertainment: ['movie', 'netflix', 'spotify', 'game', 'concert', 'ticket'],
    Healthcare: ['doctor', 'pharmacy', 'hospital', 'medical', 'dental', 'health'],
    Housing: ['rent', 'mortgage', 'insurance', 'repair'],
  };

  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((kw) => lowerText.includes(kw))) {
      category = cat;
      confidence += 0.1;
      break;
    }
  }

  // If no payee found via "at" pattern, try to extract from remaining text
  if (!payee) {
    const withoutAmount = trimmed.replace(/\$?[\d,]+\.?\d{0,2}/, '').trim();
    const withoutDate = withoutAmount.replace(/\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?/, '').trim();
    const withoutKeywords = withoutDate
      .replace(/\b(at|for|from|to|income|salary|deposit|transfer|move)\b/gi, '')
      .trim();

    if (withoutKeywords.length > 0 && withoutKeywords.length < 50) {
      payee = withoutKeywords;
      confidence += 0.1;
    }
  }

  confidence = Math.min(confidence, 1.0);

  return {
    payee,
    amountCents,
    category,
    date,
    type,
    note,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

const COMMON_TRANSACTIONS = [
  'Coffee at Starbucks $4.50',
  'Groceries at Walmart $85.00',
  'Lunch at Chipotle $12.50',
  'Gas station $45.00',
  'Amazon purchase $29.99',
  'Netflix subscription $15.99',
  'Electric bill $120.00',
  'Rent payment $1,500.00',
];

function generateSuggestions(text: string): NLSuggestion[] {
  if (text.length < 2) return [];

  const lower = text.toLowerCase();
  return COMMON_TRANSACTIONS.filter((t) => t.toLowerCase().includes(lower))
    .slice(0, 5)
    .map((t, i) => ({
      id: `suggestion-${i}`,
      text: t,
      parsedTransaction: parseTransactionText(t),
    }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNaturalLanguageInput(): UseNaturalLanguageInputResult {
  const [inputText, setInputTextRaw] = useState('');
  const [parsedTransaction, setParsedTransaction] = useState<ParsedTransaction | null>(null);
  const [suggestions, setSuggestions] = useState<NLSuggestion[]>([]);
  const [parsing, setParsing] = useState(false);

  const setInputText = useCallback((text: string) => {
    setInputTextRaw(text);
  }, []);

  // Parse on input change with debounce
  useEffect(() => {
    if (!inputText.trim()) {
      setParsedTransaction(null);
      setSuggestions([]);
      return;
    }

    setParsing(true);
    const timer = setTimeout(() => {
      const result = parseTransactionText(inputText);
      setParsedTransaction(result);
      setSuggestions(generateSuggestions(inputText));
      setParsing(false);
    }, 150);

    return () => clearTimeout(timer);
  }, [inputText]);

  const validationErrors = useMemo(() => {
    if (!parsedTransaction) return [];
    const errors: string[] = [];
    if (!parsedTransaction.amountCents) errors.push('Amount is required.');
    if (!parsedTransaction.payee) errors.push('Payee could not be detected.');
    return errors;
  }, [parsedTransaction]);

  const isValid = parsedTransaction !== null && validationErrors.length === 0;

  const acceptSuggestion = useCallback((suggestion: NLSuggestion) => {
    setInputTextRaw(suggestion.text);
    setParsedTransaction(suggestion.parsedTransaction);
    setSuggestions([]);
  }, []);

  const clearInput = useCallback(() => {
    setInputTextRaw('');
    setParsedTransaction(null);
    setSuggestions([]);
  }, []);

  return {
    inputText,
    setInputText,
    parsedTransaction,
    suggestions,
    parsing,
    validationErrors,
    acceptSuggestion,
    clearInput,
    isValid,
  };
}
