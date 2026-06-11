// SPDX-License-Identifier: BUSL-1.1

import type { VoiceIntent } from './types';

export const VOICE_TRANSACTION_EXAMPLES = [
  'Spent $45 at Whole Foods on groceries',
  'Paid 22 dollars for lunch today',
  'Received $1800 from payroll yesterday',
  'Transferred 250 to savings on 06/01',
  'Split $64 with Alex at dinner',
] as const;

export const INTENT_LEADERS: Record<Exclude<VoiceIntent, 'unknown'>, readonly string[]> = {
  expense: ['spent', 'paid', 'bought'],
  income: ['received', 'earned', 'got'],
  transfer: ['transferred', 'moved', 'sent'],
  split: ['split', 'shared'],
};

export const CATEGORY_SYNONYMS: Record<string, readonly string[]> = {
  Groceries: ['groceries', 'grocery', 'supermarket', 'whole foods', 'trader joes', 'costco'],
  Dining: ['coffee', 'breakfast', 'lunch', 'dinner', 'restaurant', 'cafe', 'takeout'],
  Transportation: ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'parking', 'transit'],
  Shopping: ['shopping', 'target', 'amazon', 'store', 'mall'],
  Entertainment: ['movie', 'movies', 'concert', 'netflix', 'spotify', 'games'],
  Utilities: ['utilities', 'electric', 'water', 'internet', 'phone', 'power'],
  Housing: ['rent', 'mortgage', 'insurance', 'home'],
  Healthcare: ['health', 'medical', 'doctor', 'pharmacy', 'dental'],
  Income: ['salary', 'payroll', 'bonus', 'refund', 'reimbursement'],
};

const MONTH_NAMES =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

export const EXPLICIT_DATE_PATTERNS = [
  new RegExp(`\\bon\\s+(${MONTH_NAMES}\\s+\\d{1,2}(?:,\\s*\\d{2,4})?)\\b`, 'i'),
  /\bon\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i,
  /\b(today|yesterday)\b/i,
] as const;

export function normalizeTranscriptText(value: string): string {
  return value.trim().toLowerCase().replace(/[!?]+/g, ' ').replace(/\s+/g, ' ');
}

export function cleanCapturedSegment(value: string): string {
  return value
    .trim()
    .replace(/^[,.;:\s]+|[,.;:\s]+$/g, '')
    .replace(/\s+/g, ' ');
}

export function findCategoryFromText(text: string): string | null {
  const normalized = normalizeTranscriptText(text);
  for (const [category, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
    if (synonyms.some((synonym) => normalized.includes(synonym))) {
      return category;
    }
  }
  return null;
}

export function buildVoicePhraseHints(): readonly string[] {
  return VOICE_TRANSACTION_EXAMPLES;
}
