// SPDX-License-Identifier: BUSL-1.1

import type { TransactionType } from '../../kmp/bridge';

export type VoiceState = 'unsupported' | 'idle' | 'starting' | 'listening' | 'processing' | 'error';

export type VoiceIntent = 'expense' | 'income' | 'transfer' | 'split' | 'unknown';

export type VoiceField =
  | 'amount'
  | 'payee'
  | 'category'
  | 'date'
  | 'type'
  | 'account'
  | 'counterparty';

export interface VoiceFieldConfidence {
  readonly value: number;
  readonly label: 'high' | 'medium' | 'low';
}

export type VoiceFieldConfidenceMap = Partial<Record<VoiceField, VoiceFieldConfidence>>;

export interface TranscriptHighlight {
  readonly field: VoiceField;
  readonly text: string;
}

export interface VoiceTranscriptUpdate {
  readonly finalTranscript: string;
  readonly interimTranscript: string;
  readonly confidence: number;
  readonly isFinal: boolean;
}

export type VoiceRecognitionErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'language-not-supported'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'unknown';

export interface VoiceRecognitionError {
  readonly code: VoiceRecognitionErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
}

export interface ParsedVoiceTransaction {
  readonly rawText: string;
  readonly normalizedText: string;
  readonly intent: VoiceIntent;
  readonly type: TransactionType;
  readonly amountCents: number | null;
  readonly payee: string | null;
  readonly category: string | null;
  readonly date: string | null;
  readonly transferAccount: string | null;
  readonly splitWith: string | null;
  readonly note: string | null;
  readonly confidence: number;
  readonly fieldConfidences: VoiceFieldConfidenceMap;
  readonly highlights: readonly TranscriptHighlight[];
  readonly missingFields: readonly VoiceField[];
}

export interface VoiceRecognitionCallbacks {
  readonly onStateChange?: (state: VoiceState) => void;
  readonly onTranscript?: (update: VoiceTranscriptUpdate) => void;
  readonly onError?: (error: VoiceRecognitionError) => void;
}

export interface VoiceRecognitionOptions {
  readonly language?: string;
  readonly continuous?: boolean;
  readonly interimResults?: boolean;
}

export interface VoiceRecognitionController {
  readonly supported: boolean;
  start: () => boolean;
  stop: () => void;
  abort: () => void;
  updateLanguage: (language: string) => void;
  dispose: () => void;
}

export interface VoiceConfirmationDraft {
  readonly type: TransactionType;
  readonly amount: string;
  readonly payee: string;
  readonly date: string;
  readonly categoryId: string;
  readonly accountId: string;
  readonly transferAccountId: string;
  readonly counterpartyName: string;
  readonly note: string;
}
