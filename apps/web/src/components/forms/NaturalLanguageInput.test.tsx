// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNaturalLanguageInput } from '../../hooks/useNaturalLanguageInput';
import type { UseNaturalLanguageInputResult } from '../../hooks/useNaturalLanguageInput';
import { NaturalLanguageInput } from './NaturalLanguageInput';

vi.mock('../../hooks/useNaturalLanguageInput', () => ({
  useNaturalLanguageInput: vi.fn(),
}));

const mockedHook = vi.mocked(useNaturalLanguageInput);

const defaultFieldConfidences = {
  payee: { value: 0.9, label: 'high' as const },
  amount: { value: 0.9, label: 'high' as const },
  category: { value: 0.75, label: 'high' as const },
  date: { value: 0, label: 'low' as const },
  type: { value: 0.3, label: 'low' as const },
};

function mockResult(
  overrides: Partial<UseNaturalLanguageInputResult> = {},
): UseNaturalLanguageInputResult {
  return {
    inputText: '',
    setInputText: vi.fn(),
    parsedTransaction: null,
    suggestions: [],
    parsing: false,
    validationErrors: [],
    acceptSuggestion: vi.fn(),
    clearInput: vi.fn(),
    isValid: false,
    recentInputs: [],
    merchantSuggestions: [],
    addToHistory: vi.fn(),
    clearHistory: vi.fn(),
    quickFixField: vi.fn(),
    editingField: null,
    setEditingField: vi.fn(),
    locale: 'en-US',
    setLocale: vi.fn(),
    ...overrides,
  };
}

describe('NaturalLanguageInput', () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the input field', () => {
    mockedHook.mockReturnValue(mockResult());

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByLabelText(/quick add transaction/i)).toBeInTheDocument();
  });

  it('shows parsed transaction preview when data is available', () => {
    mockedHook.mockReturnValue(
      mockResult({
        inputText: 'Coffee at Starbucks $4.50',
        parsedTransaction: {
          payee: 'Starbucks',
          amountCents: 450,
          category: 'Dining',
          date: null,
          type: 'EXPENSE',
          note: null,
          confidence: 0.8,
          fieldConfidences: defaultFieldConfidences,
        },
        isValid: true,
      }),
    );

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    expect(screen.getByText(/starbucks/i)).toBeInTheDocument();
    expect(screen.getByText(/\$4\.50/)).toBeInTheDocument();
    expect(screen.getByText(/dining/i)).toBeInTheDocument();
  });

  it('shows suggestions when available', () => {
    mockedHook.mockReturnValue(
      mockResult({
        inputText: 'coffee',
        suggestions: [
          {
            id: 'suggestion-0',
            text: 'Coffee at Starbucks $4.50',
            parsedTransaction: {
              payee: 'Starbucks',
              amountCents: 450,
              category: 'Dining',
              date: null,
              type: 'EXPENSE',
              note: null,
              confidence: 0.8,
              fieldConfidences: defaultFieldConfidences,
            },
            source: 'common',
          },
        ],
      }),
    );

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    // The combobox should indicate it has expanded suggestions
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-controls', 'nl-suggestions-list');
  });

  it('shows validation errors', () => {
    mockedHook.mockReturnValue(
      mockResult({
        inputText: 'something',
        parsedTransaction: {
          payee: null,
          amountCents: null,
          category: null,
          date: null,
          type: 'EXPENSE',
          note: null,
          confidence: 0.1,
          fieldConfidences: buildLowConfidences(),
        },
        validationErrors: ['Amount is required.', 'Payee could not be detected.'],
      }),
    );

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    expect(screen.getByText('Amount is required.')).toBeInTheDocument();
    expect(screen.getByText('Payee could not be detected.')).toBeInTheDocument();
  });

  it('disables submit button when not valid', () => {
    mockedHook.mockReturnValue(mockResult({ isValid: false }));

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    expect(screen.getByRole('button', { name: /add transaction/i })).toBeDisabled();
  });

  it('shows clear button when input has text', () => {
    mockedHook.mockReturnValue(mockResult({ inputText: 'test' }));

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    expect(screen.getByRole('button', { name: /clear input/i })).toBeInTheDocument();
  });

  it('shows confidence indicator', () => {
    mockedHook.mockReturnValue(
      mockResult({
        inputText: 'Coffee at Starbucks $4.50',
        parsedTransaction: {
          payee: 'Starbucks',
          amountCents: 450,
          category: 'Dining',
          date: null,
          type: 'EXPENSE',
          note: null,
          confidence: 0.8,
          fieldConfidences: defaultFieldConfidences,
        },
      }),
    );

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    expect(screen.getByText('80% match')).toBeInTheDocument();
  });

  it('renders the locale picker', () => {
    mockedHook.mockReturnValue(mockResult());

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    expect(screen.getByRole('button', { name: /current locale/i })).toBeInTheDocument();
  });

  it('shows per-field confidence indicators on parsed tags', () => {
    mockedHook.mockReturnValue(
      mockResult({
        inputText: 'Coffee at Starbucks $4.50',
        parsedTransaction: {
          payee: 'Starbucks',
          amountCents: 450,
          category: 'Dining',
          date: null,
          type: 'EXPENSE',
          note: null,
          confidence: 0.8,
          fieldConfidences: defaultFieldConfidences,
        },
      }),
    );

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    // Parsed tags are clickable buttons for quick-fix
    const payeeButton = screen.getByRole('button', { name: /payee.*starbucks/i });
    expect(payeeButton).toBeInTheDocument();

    const amountButton = screen.getByRole('button', { name: /amount.*\$4\.50/i });
    expect(amountButton).toBeInTheDocument();
  });

  it('shows merchant suggestion chips', () => {
    mockedHook.mockReturnValue(
      mockResult({
        inputText: 'coffee',
        merchantSuggestions: ['Starbucks', "Peet's Coffee"],
      }),
    );

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    expect(screen.getByRole('button', { name: /use merchant: starbucks/i })).toBeInTheDocument();
  });

  it('shows history badge on history-sourced suggestions', () => {
    mockedHook.mockReturnValue(
      mockResult({
        inputText: 'coffee',
        suggestions: [
          {
            id: 'merchant-0',
            text: 'Coffee at Starbucks $4.50',
            parsedTransaction: {
              payee: 'Starbucks',
              amountCents: 450,
              category: 'Dining',
              date: null,
              type: 'EXPENSE',
              note: null,
              confidence: 0.8,
              fieldConfidences: defaultFieldConfidences,
            },
            source: 'history',
          },
        ],
      }),
    );

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    // Focus the input to show suggestions dropdown
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);

    expect(screen.getByLabelText('From history')).toBeInTheDocument();
  });
});

function buildLowConfidences() {
  return {
    payee: { value: 0, label: 'low' as const },
    amount: { value: 0, label: 'low' as const },
    category: { value: 0, label: 'low' as const },
    date: { value: 0, label: 'low' as const },
    type: { value: 0.3, label: 'low' as const },
  };
}
