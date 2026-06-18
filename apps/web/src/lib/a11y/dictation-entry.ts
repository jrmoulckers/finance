// SPDX-License-Identifier: BUSL-1.1

export interface DictationControlInput {
  id: string;
  visibleLabel: string;
  context?: string;
  hint?: string;
}

export interface DictationControlProps {
  id: string;
  name: string;
  label: string;
  'aria-label': string;
  'aria-describedby'?: string;
}

export interface TransactionDictationDraft {
  payee?: string;
  amount?: string;
  date?: string;
  category?: string;
  note?: string;
}

export type DictationField = keyof TransactionDictationDraft;

export interface DictationCorrectionResult {
  draft: TransactionDictationDraft;
  focusField: DictationField;
  announcement: string;
}

function normalizeSpeechText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function buildDictationControlProps(input: DictationControlInput): DictationControlProps {
  const label = normalizeSpeechText(input.visibleLabel);
  const context = input.context ? normalizeSpeechText(input.context) : '';
  const hint = input.hint ? normalizeSpeechText(input.hint) : '';
  const ariaLabel = context ? `${label}, ${context}` : label;

  return {
    id: input.id,
    name: input.id,
    label,
    'aria-label': ariaLabel,
    ...(hint ? { 'aria-describedby': `${input.id}-hint` } : {}),
  };
}

export function buildDictationParsingFeedback(input: {
  parsedFields: readonly DictationField[];
  missingFields?: readonly DictationField[];
  suggestions?: readonly string[];
}): string {
  const parsed = input.parsedFields.length > 0 ? input.parsedFields.join(', ') : 'no fields';
  const missing =
    input.missingFields && input.missingFields.length > 0
      ? ` Missing: ${input.missingFields.join(', ')}.`
      : ' All required fields are present.';
  const suggestions =
    input.suggestions && input.suggestions.length > 0
      ? ` Suggestions: ${input.suggestions.map(normalizeSpeechText).join('; ')}.`
      : '';

  return normalizeSpeechText(`Parsed ${parsed}.${missing}${suggestions}`);
}

export function applyDictationCorrection(
  draft: TransactionDictationDraft,
  field: DictationField,
  value: string,
): DictationCorrectionResult {
  const normalizedValue = normalizeSpeechText(value);
  return {
    draft: {
      ...draft,
      [field]: normalizedValue,
    },
    focusField: field,
    announcement: normalizeSpeechText(
      `${field} updated to ${normalizedValue}. Focus remains on ${field}.`,
    ),
  };
}
