// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for natural language transaction input.
 *
 * Parses text like "Coffee at Starbucks $4.50" into structured
 * transaction data with autocomplete suggestions, per-field confidence,
 * merchant history, multi-language locale-aware parsing, recent inputs,
 * and quick-fix field correction.
 *
 * Usage:
 * ```tsx
 * const { inputText, setInputText, parsedTransaction, suggestions } = useNaturalLanguageInput();
 * ```
 *
 * References: issue #322, #1142
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TransactionType } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Confidence metadata for a single parsed field. */
export interface FieldConfidence {
  readonly value: number;
  readonly label: 'high' | 'medium' | 'low';
}

/** Per-field confidence scores for parsed transaction. */
export interface ParsedFieldConfidences {
  readonly payee: FieldConfidence;
  readonly amount: FieldConfidence;
  readonly category: FieldConfidence;
  readonly date: FieldConfidence;
  readonly type: FieldConfidence;
}

export interface ParsedTransaction {
  readonly payee: string | null;
  readonly amountCents: number | null;
  readonly category: string | null;
  readonly date: string | null;
  readonly type: TransactionType;
  readonly note: string | null;
  readonly confidence: number;
  readonly fieldConfidences: ParsedFieldConfidences;
}

export interface NLSuggestion {
  readonly id: string;
  readonly text: string;
  readonly parsedTransaction: ParsedTransaction;
  /** Source of the suggestion: merchant history or common templates. */
  readonly source: 'history' | 'common';
}

/** A recent NLP input entry stored in history. */
export interface RecentNLInput {
  readonly id: string;
  readonly text: string;
  readonly parsedTransaction: ParsedTransaction;
  readonly timestamp: number;
}

/** Editable field name for quick-fix. */
export type EditableField = 'payee' | 'amount' | 'category' | 'date' | 'type';

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
  /** Recent NLP inputs history. */
  recentInputs: RecentNLInput[];
  /** Merchant names from history for suggestion chips. */
  merchantSuggestions: string[];
  /** Add current input to recent history. */
  addToHistory: () => void;
  /** Clear all recent inputs history. */
  clearHistory: () => void;
  /** Quick-fix: override a specific parsed field. */
  quickFixField: (field: EditableField, value: string) => void;
  /** The field currently being edited via quick-fix, or null. */
  editingField: EditableField | null;
  /** Set which field is being quick-fix edited. */
  setEditingField: (field: EditableField | null) => void;
  /** Current user locale for parsing. */
  locale: string;
  /** Update the locale for parsing. */
  setLocale: (locale: string) => void;
}

// ---------------------------------------------------------------------------
// Confidence helpers
// ---------------------------------------------------------------------------

function toFieldConfidence(value: number): FieldConfidence {
  const clamped = Math.max(0, Math.min(1, value));
  return {
    value: clamped,
    label: clamped >= 0.7 ? 'high' : clamped >= 0.4 ? 'medium' : 'low',
  };
}

function buildFieldConfidences(opts: {
  payee: number;
  amount: number;
  category: number;
  date: number;
  type: number;
}): ParsedFieldConfidences {
  return {
    payee: toFieldConfidence(opts.payee),
    amount: toFieldConfidence(opts.amount),
    category: toFieldConfidence(opts.category),
    date: toFieldConfidence(opts.date),
    type: toFieldConfidence(opts.type),
  };
}

// ---------------------------------------------------------------------------
// Locale-aware amount parsing
// ---------------------------------------------------------------------------

/**
 * Parse a monetary amount from text, respecting locale conventions.
 *
 * - en-US: $1,234.56 or 1234.56
 * - de-DE: 1.234,56 or 1234,56
 * - fr-FR: 1 234,56 or 1234,56
 */
function parseLocaleAmount(text: string, locale: string): number | null {
  // Detect locale grouping/decimal conventions
  const isCommaDecimal =
    locale.startsWith('de') ||
    locale.startsWith('fr') ||
    locale.startsWith('es') ||
    locale.startsWith('pt') ||
    locale.startsWith('it') ||
    locale.startsWith('nl');

  let amountMatch: RegExpMatchArray | null;

  if (isCommaDecimal) {
    // Match patterns like 1.234,56 or 1234,56 or €42,99
    amountMatch = text.match(/[€$£¥]?\s?([\d.\s]+,\d{1,2})/);
    if (amountMatch) {
      const cleaned = amountMatch[1].replace(/[.\s]/g, '').replace(',', '.');
      const val = parseFloat(cleaned);
      if (!Number.isNaN(val) && val > 0) return val;
    }
  }

  // Standard: $1,234.56 or 1234.56
  amountMatch = text.match(/[€$£¥]?\s?([\d,]+\.?\d{0,2})/);
  if (amountMatch) {
    const cleaned = amountMatch[1].replace(/,/g, '');
    const val = parseFloat(cleaned);
    if (!Number.isNaN(val) && val > 0) return val;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parser (enhanced with per-field confidence & locale support)
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
 * - "Kaffee bei Starbucks 4,50€" (locale-aware)
 */
export function parseTransactionText(text: string, locale = 'en-US'): ParsedTransaction {
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
      fieldConfidences: buildFieldConfidences({
        payee: 0,
        amount: 0,
        category: 0,
        date: 0,
        type: 0.3,
      }),
    };
  }

  let payee: string | null = null;
  let amountCents: number | null = null;
  let category: string | null = null;
  let date: string | null = null;
  let type: TransactionType = 'EXPENSE';
  const note: string | null = null;
  let confidence = 0;

  let payeeConf = 0;
  let amountConf = 0;
  let categoryConf = 0;
  let dateConf = 0;
  let typeConf = 0.3;

  // Extract amount (locale-aware)
  const parsedAmount = parseLocaleAmount(trimmed, locale);
  if (parsedAmount !== null) {
    amountCents = Math.round(parsedAmount * 100);
    confidence += 0.4;
    amountConf = 0.9;
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
    dateConf = 0.85;
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
    typeConf = 0.9;
  } else if (lowerText.includes('transfer') || lowerText.includes('move')) {
    type = 'TRANSFER';
    confidence += 0.1;
    typeConf = 0.85;
  }

  // Extract payee: "at <payee>" pattern
  const atMatch = trimmed.match(/\bat\s+([A-Za-z][\w\s&'.,-]*?)(?:\s*\$|\s*\d+[.,]|\s*$)/i);
  if (atMatch) {
    payee = atMatch[1].trim();
    confidence += 0.3;
    payeeConf = 0.9;
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
      categoryConf = 0.75;
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
      payeeConf = 0.4;
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
    fieldConfidences: buildFieldConfidences({
      payee: payeeConf,
      amount: amountConf,
      category: categoryConf,
      date: dateConf,
      type: typeConf,
    }),
  };
}

// ---------------------------------------------------------------------------
// Suggestions (enhanced with merchant history)
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

function generateSuggestions(
  text: string,
  merchantHistory: string[],
  locale: string,
): NLSuggestion[] {
  if (text.length < 2) return [];

  const lower = text.toLowerCase();
  const results: NLSuggestion[] = [];

  // Merchant history suggestions first (higher priority)
  const merchantMatches = merchantHistory
    .filter((m) => m.toLowerCase().includes(lower))
    .slice(0, 3);

  for (const [i, merchant] of merchantMatches.entries()) {
    results.push({
      id: `merchant-${i}`,
      text: merchant,
      parsedTransaction: parseTransactionText(merchant, locale),
      source: 'history',
    });
  }

  // Common suggestions
  const commonMatches = COMMON_TRANSACTIONS.filter((t) => t.toLowerCase().includes(lower)).slice(
    0,
    5 - results.length,
  );

  for (const [i, t] of commonMatches.entries()) {
    results.push({
      id: `suggestion-${i}`,
      text: t,
      parsedTransaction: parseTransactionText(t, locale),
      source: 'common',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Recent history storage key
// ---------------------------------------------------------------------------

const HISTORY_STORAGE_KEY = 'finance-nl-recent-inputs';
const MERCHANT_STORAGE_KEY = 'finance-nl-merchants';
const MAX_RECENT_INPUTS = 20;
const MAX_MERCHANTS = 50;

function loadRecentInputs(): RecentNLInput[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as RecentNLInput[];
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveRecentInputs(inputs: RecentNLInput[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(inputs.slice(0, MAX_RECENT_INPUTS)));
  } catch {
    // Ignore storage errors
  }
}

function loadMerchants(): string[] {
  try {
    const stored = localStorage.getItem(MERCHANT_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as string[];
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveMerchants(merchants: string[]): void {
  try {
    localStorage.setItem(MERCHANT_STORAGE_KEY, JSON.stringify(merchants.slice(0, MAX_MERCHANTS)));
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNaturalLanguageInput(): UseNaturalLanguageInputResult {
  const [inputText, setInputTextRaw] = useState('');
  const [parsedTransaction, setParsedTransaction] = useState<ParsedTransaction | null>(null);
  const [suggestions, setSuggestions] = useState<NLSuggestion[]>([]);
  const [parsing, setParsing] = useState(false);
  const [recentInputs, setRecentInputs] = useState<RecentNLInput[]>(loadRecentInputs);
  const [merchantHistory, setMerchantHistory] = useState<string[]>(loadMerchants);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [locale, setLocale] = useState<string>(
    typeof navigator !== 'undefined' ? navigator.language : 'en-US',
  );

  // Quick-fix overrides (manual corrections for individual fields)
  const overridesRef = useRef<Partial<Record<EditableField, string>>>({});

  const setInputText = useCallback((text: string) => {
    setInputTextRaw(text);
    overridesRef.current = {};
    setEditingField(null);
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
      let result = parseTransactionText(inputText, locale);

      // Apply quick-fix overrides
      const overrides = overridesRef.current;
      if (Object.keys(overrides).length > 0) {
        result = {
          ...result,
          ...(overrides.payee !== undefined ? { payee: overrides.payee } : {}),
          ...(overrides.amount !== undefined
            ? { amountCents: Math.round(parseFloat(overrides.amount) * 100) || null }
            : {}),
          ...(overrides.category !== undefined ? { category: overrides.category } : {}),
          ...(overrides.date !== undefined ? { date: overrides.date } : {}),
          ...(overrides.type !== undefined ? { type: overrides.type as TransactionType } : {}),
        };
      }

      setParsedTransaction(result);
      setSuggestions(generateSuggestions(inputText, merchantHistory, locale));
      setParsing(false);
    }, 150);

    return () => clearTimeout(timer);
  }, [inputText, locale, merchantHistory]);

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
    overridesRef.current = {};
    setEditingField(null);
  }, []);

  const clearInput = useCallback(() => {
    setInputTextRaw('');
    setParsedTransaction(null);
    setSuggestions([]);
    overridesRef.current = {};
    setEditingField(null);
  }, []);

  const addToHistory = useCallback(() => {
    if (!parsedTransaction || !inputText.trim()) return;

    const entry: RecentNLInput = {
      id: crypto.randomUUID(),
      text: inputText,
      parsedTransaction,
      timestamp: Date.now(),
    };

    setRecentInputs((prev) => {
      const updated = [entry, ...prev.filter((r) => r.text !== inputText)].slice(
        0,
        MAX_RECENT_INPUTS,
      );
      saveRecentInputs(updated);
      return updated;
    });

    // Add merchant to history
    if (parsedTransaction.payee) {
      const payee = parsedTransaction.payee;
      setMerchantHistory((prev) => {
        if (prev.includes(payee)) return prev;
        const updated = [payee, ...prev].slice(0, MAX_MERCHANTS);
        saveMerchants(updated);
        return updated;
      });
    }
  }, [parsedTransaction, inputText]);

  const clearHistory = useCallback(() => {
    setRecentInputs([]);
    saveRecentInputs([]);
  }, []);

  const quickFixField = useCallback(
    (field: EditableField, value: string) => {
      overridesRef.current = { ...overridesRef.current, [field]: value };
      setEditingField(null);

      // Re-parse with overrides applied
      if (inputText.trim()) {
        let result = parseTransactionText(inputText, locale);
        const overrides = overridesRef.current;
        result = {
          ...result,
          ...(overrides.payee !== undefined ? { payee: overrides.payee } : {}),
          ...(overrides.amount !== undefined
            ? { amountCents: Math.round(parseFloat(overrides.amount) * 100) || null }
            : {}),
          ...(overrides.category !== undefined ? { category: overrides.category } : {}),
          ...(overrides.date !== undefined ? { date: overrides.date } : {}),
          ...(overrides.type !== undefined ? { type: overrides.type as TransactionType } : {}),
        };
        setParsedTransaction(result);
      }
    },
    [inputText, locale],
  );

  /** Merchant names matching current input for suggestion chips. */
  const merchantSuggestions = useMemo(() => {
    if (inputText.length < 2) return [];
    const lower = inputText.toLowerCase();
    return merchantHistory.filter((m) => m.toLowerCase().includes(lower)).slice(0, 5);
  }, [inputText, merchantHistory]);

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
    recentInputs,
    merchantSuggestions,
    addToHistory,
    clearHistory,
    quickFixField,
    editingField,
    setEditingField,
    locale,
    setLocale,
  };
}
