// SPDX-License-Identifier: BUSL-1.1

import type { TransactionType } from '../../kmp/bridge';
import {
  EXPLICIT_DATE_PATTERNS,
  INTENT_LEADERS,
  cleanCapturedSegment,
  findCategoryFromText,
  normalizeTranscriptText,
} from './grammar';
import type {
  ParsedVoiceTransaction,
  TranscriptHighlight,
  VoiceField,
  VoiceFieldConfidence,
  VoiceFieldConfidenceMap,
  VoiceIntent,
} from './types';

function toFieldConfidence(value: number): VoiceFieldConfidence {
  const clamped = Math.max(0, Math.min(1, value));
  return {
    value: clamped,
    label: clamped >= 0.75 ? 'high' : clamped >= 0.45 ? 'medium' : 'low',
  };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function titleCaseIfNeeded(value: string): string {
  if (!value || /[A-Z]/.test(value)) {
    return value;
  }

  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseRelativeDate(value: string, now: Date): string | null {
  if (value === 'today') {
    return formatLocalDate(now);
  }

  if (value === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatLocalDate(yesterday);
  }

  return null;
}

function parseCalendarDate(value: string, now: Date): string | null {
  const slashMatch = value.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (slashMatch) {
    const month = Number.parseInt(slashMatch[1], 10);
    const day = Number.parseInt(slashMatch[2], 10);
    let year = slashMatch[3] ? Number.parseInt(slashMatch[3], 10) : now.getFullYear();
    if (year < 100) {
      year += 2000;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const monthMatch = value.match(
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,\s*(\d{2,4}))?$/i,
  );
  if (!monthMatch) {
    return null;
  }

  const monthLookup: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  const month = monthLookup[monthMatch[1].slice(0, 3).toLowerCase()];
  const day = Number.parseInt(monthMatch[2], 10);
  let year = monthMatch[3] ? Number.parseInt(monthMatch[3], 10) : now.getFullYear();
  if (year < 100) {
    year += 2000;
  }

  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

function extractDate(
  text: string,
  now: Date,
): { date: string | null; matchedText: string | null; cleanedText: string } {
  for (const pattern of EXPLICIT_DATE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const rawValue = cleanCapturedSegment(match[1] ?? match[0]);
    const normalizedValue = rawValue.toLowerCase();
    const parsed = parseRelativeDate(normalizedValue, now) ?? parseCalendarDate(rawValue, now);
    if (!parsed) {
      continue;
    }

    return {
      date: parsed,
      matchedText: cleanCapturedSegment(match[0]),
      cleanedText: cleanCapturedSegment(text.replace(match[0], ' ')),
    };
  }

  return { date: null, matchedText: null, cleanedText: cleanCapturedSegment(text) };
}

function extractAmount(text: string): {
  amountCents: number | null;
  matchedText: string | null;
  cleanedText: string;
} {
  const amountMatch = text.match(
    /\b(\$?\s*\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:dollars?|bucks?))?(?:\s+and\s+\d{1,2}\s+cents?)?)\b/i,
  );
  if (!amountMatch) {
    return { amountCents: null, matchedText: null, cleanedText: cleanCapturedSegment(text) };
  }

  const matchedText = cleanCapturedSegment(amountMatch[1]);
  const centsMatch = matchedText.match(/(\d{1,2})\s*cents?/i);
  const numericMatch = matchedText.match(/\d[\d,]*(?:\.\d{1,2})?/);
  if (!numericMatch) {
    return { amountCents: null, matchedText: null, cleanedText: cleanCapturedSegment(text) };
  }

  const dollars = Number.parseFloat(numericMatch[0].replace(/,/g, ''));
  const cents = centsMatch ? Number.parseInt(centsMatch[1], 10) : Math.round((dollars % 1) * 100);
  const wholeDollars = centsMatch ? Math.trunc(dollars) : dollars;
  const amountCents = centsMatch
    ? Math.round(wholeDollars * 100) + cents
    : Math.round(Number.isFinite(wholeDollars) ? wholeDollars * 100 : Number.NaN);

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { amountCents: null, matchedText: null, cleanedText: cleanCapturedSegment(text) };
  }

  return {
    amountCents,
    matchedText,
    cleanedText: cleanCapturedSegment(text.replace(amountMatch[1], ' ')),
  };
}

function consume(
  text: string,
  pattern: RegExp,
): {
  value: string | null;
  matchedText: string | null;
  cleanedText: string;
} {
  const match = text.match(pattern);
  if (!match) {
    return { value: null, matchedText: null, cleanedText: cleanCapturedSegment(text) };
  }

  return {
    value: titleCaseIfNeeded(cleanCapturedSegment(match[1])),
    matchedText: cleanCapturedSegment(match[1]),
    cleanedText: cleanCapturedSegment(text.replace(match[0], ' ')),
  };
}

function detectIntent(text: string): {
  intent: VoiceIntent;
  matchedText: string | null;
  cleanedText: string;
} {
  const normalized = normalizeTranscriptText(text);
  for (const [intent, leaders] of Object.entries(INTENT_LEADERS) as Array<
    [Exclude<VoiceIntent, 'unknown'>, readonly string[]]
  >) {
    const leader = leaders.find(
      (value) => normalized.startsWith(`${value} `) || normalized === value,
    );
    if (leader) {
      return {
        intent,
        matchedText: leader,
        cleanedText: cleanCapturedSegment(text.replace(new RegExp(`^${leader}\\b`, 'i'), ' ')),
      };
    }
  }

  if (/\btransfer(?:red)?\b/i.test(text)) {
    return { intent: 'transfer', matchedText: 'transfer', cleanedText: cleanCapturedSegment(text) };
  }

  if (/\b(received|earned|payroll|salary)\b/i.test(text)) {
    return { intent: 'income', matchedText: 'received', cleanedText: cleanCapturedSegment(text) };
  }

  return { intent: 'unknown', matchedText: null, cleanedText: cleanCapturedSegment(text) };
}

function buildMissingFields(
  intent: VoiceIntent,
  amountCents: number | null,
  payee: string | null,
): VoiceField[] {
  const missing: VoiceField[] = [];
  if (amountCents === null) {
    missing.push('amount');
  }
  if (intent !== 'transfer' && !payee) {
    missing.push('payee');
  }
  return missing;
}

function buildOverallConfidence(scores: VoiceFieldConfidenceMap): number {
  const values = Object.values(scores).map((score) => score.value);
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
}

export function parseVoiceTransaction(
  input: string,
  options: { now?: Date } = {},
): ParsedVoiceTransaction {
  const now = options.now ?? new Date();
  const rawText = cleanCapturedSegment(input);
  const normalizedText = normalizeTranscriptText(rawText);

  if (!rawText) {
    return {
      rawText,
      normalizedText,
      intent: 'unknown',
      type: 'EXPENSE',
      amountCents: null,
      payee: null,
      category: null,
      date: null,
      transferAccount: null,
      splitWith: null,
      note: null,
      confidence: 0,
      fieldConfidences: {},
      highlights: [],
      missingFields: ['amount', 'payee'],
    };
  }

  const highlights: TranscriptHighlight[] = [];
  const fieldScores: VoiceFieldConfidenceMap = {};

  const intentResult = detectIntent(rawText);
  let workingText = intentResult.cleanedText;
  if (intentResult.matchedText) {
    highlights.push({ field: 'type', text: intentResult.matchedText });
    fieldScores.type = toFieldConfidence(intentResult.intent === 'unknown' ? 0.35 : 0.9);
  }

  const dateResult = extractDate(workingText, now);
  workingText = dateResult.cleanedText;
  if (dateResult.matchedText) {
    highlights.push({ field: 'date', text: dateResult.matchedText });
    fieldScores.date = toFieldConfidence(0.85);
  }

  const amountResult = extractAmount(workingText);
  workingText = amountResult.cleanedText;
  if (amountResult.matchedText) {
    highlights.push({ field: 'amount', text: amountResult.matchedText });
    fieldScores.amount = toFieldConfidence(0.96);
  }

  let payee: string | null = null;
  let category: string | null = null;
  let transferAccount: string | null = null;
  let splitWith: string | null = null;
  let note: string | null = null;

  if (intentResult.intent === 'income') {
    const sourceResult = consume(workingText, /\bfrom\s+(.+?)(?=$)/i);
    workingText = sourceResult.cleanedText;
    payee = sourceResult.value;
    if (sourceResult.matchedText) {
      highlights.push({ field: 'payee', text: sourceResult.matchedText });
      fieldScores.payee = toFieldConfidence(0.88);
    }
  } else if (intentResult.intent === 'transfer') {
    const accountResult = consume(workingText, /\bto\s+(.+?)(?=$)/i);
    workingText = accountResult.cleanedText;
    transferAccount = accountResult.value;
    payee = transferAccount ? `Transfer to ${transferAccount}` : 'Transfer';
    if (accountResult.matchedText) {
      highlights.push({ field: 'account', text: accountResult.matchedText });
      fieldScores.account = toFieldConfidence(0.86);
      fieldScores.payee = toFieldConfidence(0.78);
    }
  } else if (intentResult.intent === 'split') {
    const splitResult = consume(workingText, /\bwith\s+(.+?)(?=\s+at\b|\s+on\b|$)/i);
    workingText = splitResult.cleanedText;
    splitWith = splitResult.value;
    if (splitResult.matchedText) {
      highlights.push({ field: 'counterparty', text: splitResult.matchedText });
      fieldScores.counterparty = toFieldConfidence(0.9);
    }

    const merchantResult = consume(workingText, /\bat\s+(.+?)(?=\s+on\b|$)/i);
    workingText = merchantResult.cleanedText;
    payee = merchantResult.value;
    if (merchantResult.matchedText) {
      highlights.push({ field: 'payee', text: merchantResult.matchedText });
      fieldScores.payee = toFieldConfidence(0.88);
    }
  } else {
    const merchantResult = consume(workingText, /\bat\s+(.+?)(?=\s+on\b|$)/i);
    workingText = merchantResult.cleanedText;
    if (merchantResult.value) {
      payee = merchantResult.value;
      highlights.push({ field: 'payee', text: merchantResult.matchedText ?? merchantResult.value });
      fieldScores.payee = toFieldConfidence(0.88);
    }

    if (!payee) {
      const descriptionResult = consume(workingText, /\bfor\s+(.+?)(?=\s+on\b|$)/i);
      workingText = descriptionResult.cleanedText;
      if (descriptionResult.value) {
        payee = descriptionResult.value;
        highlights.push({
          field: 'payee',
          text: descriptionResult.matchedText ?? descriptionResult.value,
        });
        fieldScores.payee = toFieldConfidence(0.8);
      }
    }
  }

  const categoryResult = consume(workingText, /\bon\s+(.+?)(?=$)/i);
  if (categoryResult.value) {
    category =
      findCategoryFromText(categoryResult.value) ?? titleCaseIfNeeded(categoryResult.value);
    highlights.push({
      field: 'category',
      text: categoryResult.matchedText ?? categoryResult.value,
    });
    fieldScores.category = toFieldConfidence(0.84);
    workingText = categoryResult.cleanedText;
  }

  if (!category) {
    category = findCategoryFromText(rawText);
    if (category) {
      fieldScores.category = toFieldConfidence(0.68);
    }
  }

  if (!payee && workingText) {
    payee = titleCaseIfNeeded(
      cleanCapturedSegment(workingText.replace(/\b(from|to|with|for|at|on)\b/gi, ' ')),
    );
    if (payee) {
      fieldScores.payee = toFieldConfidence(0.56);
    }
  }

  if (intentResult.intent === 'split' && splitWith) {
    note = `Split expense with ${splitWith}`;
  }

  const type: TransactionType =
    intentResult.intent === 'income'
      ? 'INCOME'
      : intentResult.intent === 'transfer'
        ? 'TRANSFER'
        : 'EXPENSE';

  if (!fieldScores.type) {
    fieldScores.type = toFieldConfidence(intentResult.intent === 'unknown' ? 0.35 : 0.86);
  }

  const missingFields = buildMissingFields(intentResult.intent, amountResult.amountCents, payee);

  return {
    rawText,
    normalizedText,
    intent: intentResult.intent,
    type,
    amountCents: amountResult.amountCents,
    payee: payee || null,
    category,
    date: dateResult.date,
    transferAccount,
    splitWith,
    note,
    confidence: buildOverallConfidence(fieldScores),
    fieldConfidences: fieldScores,
    highlights,
    missingFields,
  };
}
