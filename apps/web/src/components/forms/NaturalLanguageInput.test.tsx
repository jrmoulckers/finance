// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNaturalLanguageInput } from '../../hooks/useNaturalLanguageInput';
import type { UseNaturalLanguageInputResult } from '../../hooks/useNaturalLanguageInput';
import { NaturalLanguageInput } from './NaturalLanguageInput';

vi.mock('../../hooks/useNaturalLanguageInput', () => ({
  useNaturalLanguageInput: vi.fn(),
}));

const mockedHook = vi.mocked(useNaturalLanguageInput);

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
            },
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
        },
      }),
    );

    render(<NaturalLanguageInput onSubmit={onSubmit} />);

    expect(screen.getByText('80% match')).toBeInTheDocument();
  });
});
