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

// ---------------------------------------------------------------------------
// Voice-input transaction-entry QA matrix (#2504, follow-up to #2277)
//
// Transaction entry and correction must work across the mainstream voice tools.
// Each case pins the two behaviours the follow-up calls out: activation by the
// control's spoken (visible) label, and error correction that does not lose
// focus. Encoding the matrix in code lets the entry/correction helpers above be
// asserted against every tool in CI, and doubles as the QA run sheet.
// ---------------------------------------------------------------------------

export type VoiceInputTool =
  'windows-voice-access' | 'macos-voice-control' | 'dragon' | 'ios-dictation' | 'android-dictation';

export interface VoiceInputQaCase {
  tool: VoiceInputTool;
  platform: string;
  activationCommand: string;
  activationField: DictationField;
  correctionCommand: string;
  correctionField: DictationField;
  correctionValue: string;
  expectation: string;
}

export function getVoiceInputTools(): VoiceInputTool[] {
  return [
    'windows-voice-access',
    'macos-voice-control',
    'dragon',
    'ios-dictation',
    'android-dictation',
  ];
}

export function buildVoiceInputQaMatrix(): VoiceInputQaCase[] {
  return [
    {
      tool: 'windows-voice-access',
      platform: 'Windows 11 Voice Access',
      activationCommand: 'Click Payee',
      activationField: 'payee',
      correctionCommand: 'Correct amount to twelve dollars',
      correctionField: 'amount',
      correctionValue: '12.00',
      expectation: 'Spoken visible label focuses the field; correction keeps focus on amount.',
    },
    {
      tool: 'macos-voice-control',
      platform: 'macOS Voice Control',
      activationCommand: 'Click Amount',
      activationField: 'amount',
      correctionCommand: 'Replace with fifteen dollars fifty',
      correctionField: 'amount',
      correctionValue: '15.50',
      expectation: 'Number overlay and label activation both reach the field without focus loss.',
    },
    {
      tool: 'dragon',
      platform: 'Dragon NaturallySpeaking',
      activationCommand: 'Click Category',
      activationField: 'category',
      correctionCommand: 'Select groceries',
      correctionField: 'category',
      correctionValue: 'Groceries',
      expectation:
        'Full-text control name matches the visible label; correction announces the change.',
    },
    {
      tool: 'ios-dictation',
      platform: 'iOS dictation',
      activationCommand: 'Tap Note then dictate',
      activationField: 'note',
      correctionCommand: 'Dictate corrected note',
      correctionField: 'note',
      correctionValue: 'Lunch with client',
      expectation:
        'Dictation appends to the focused field; re-dictation corrects without losing focus.',
    },
    {
      tool: 'android-dictation',
      platform: 'Android (Gboard voice typing)',
      activationCommand: 'Focus Date then speak',
      activationField: 'date',
      correctionCommand: 'Speak today',
      correctionField: 'date',
      correctionValue: 'Today',
      expectation: 'Voice typing fills the focused field; correction keeps focus on date.',
    },
  ];
}
