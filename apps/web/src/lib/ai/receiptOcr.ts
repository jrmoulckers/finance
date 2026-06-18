// SPDX-License-Identifier: BUSL-1.1

export interface ReceiptOcrRawResult {
  readonly rawText: string;
  readonly confidence: number;
  readonly source: 'local-ocr' | 'stub';
}

export interface ReceiptOcrProvider<Input = unknown> {
  readonly name: string;
  extract(input: Input): Promise<ReceiptOcrRawResult>;
}

export interface ReceiptLineItem {
  readonly description: string;
  readonly amountCents: number;
  readonly confidence: number;
}

export interface ReceiptTransactionDraft {
  readonly merchant: string;
  readonly date: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly taxCents?: number;
  readonly tipCents?: number;
  readonly category: string;
  readonly tags: readonly string[];
  readonly lineItems: readonly ReceiptLineItem[];
  readonly duplicateWarning?: ReceiptDuplicateWarning;
  readonly metadata: {
    readonly receiptOcrConfidence: number;
    readonly receiptRawText: string;
    readonly acceptedLineItems: readonly ReceiptLineItem[];
    readonly provider: string;
  };
}

export interface ReceiptTransaction {
  readonly id: string;
  readonly merchant: string;
  readonly date: string;
  readonly amountCents: number;
  readonly category?: string;
}

export interface ReceiptDuplicateWarning {
  readonly transactionId: string;
  readonly reason: string;
  readonly score: number;
}

export interface ReceiptCategoryMemory {
  readonly merchant: string;
  readonly category: string;
  readonly tags?: readonly string[];
}

export interface ReceiptReviewDecision {
  readonly confirmed: boolean;
  readonly merchant?: string;
  readonly date?: string;
  readonly amountCents?: number;
  readonly category?: string;
  readonly acceptedLineItems?: readonly ReceiptLineItem[];
}

const KEYWORD_CATEGORIES: readonly {
  readonly category: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
}[] = [
  { category: 'Groceries', keywords: ['grocery', 'market', 'produce', 'milk', 'bread', 'apple'] },
  { category: 'Dining', keywords: ['restaurant', 'cafe', 'coffee', 'burger', 'pizza', 'tip'] },
  { category: 'Fuel', keywords: ['fuel', 'gas', 'shell', 'chevron'] },
  { category: 'Health', keywords: ['pharmacy', 'rx', 'clinic'] },
  { category: 'Shopping', keywords: ['target', 'walmart', 'store'] },
];

export const stubReceiptOcrProvider: ReceiptOcrProvider<string> = {
  name: 'stub-local-receipt-text',
  async extract(input: string): Promise<ReceiptOcrRawResult> {
    return { rawText: input, confidence: input.trim().length > 0 ? 0.65 : 0, source: 'stub' };
  },
};

export function mapReceiptOcrToDraft(
  ocr: ReceiptOcrRawResult,
  options: {
    readonly recentTransactions?: readonly ReceiptTransaction[];
    readonly priorChoices?: readonly ReceiptCategoryMemory[];
    readonly providerName?: string;
    readonly defaultDate?: string;
  } = {},
): ReceiptTransactionDraft {
  const lines = ocr.rawText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const merchant = extractMerchant(lines) || 'Unknown merchant';
  const date =
    extractDate(ocr.rawText) ?? options.defaultDate ?? new Date().toISOString().slice(0, 10);
  const currency = /\b(?:cad|c\$)\b/iu.test(ocr.rawText) ? 'CAD' : 'USD';
  const taxCents = extractLabelAmount(ocr.rawText, ['tax']);
  const tipCents = extractLabelAmount(ocr.rawText, ['tip', 'gratuity']);
  const total =
    extractLabelAmount(ocr.rawText, ['total', 'amount due', 'paid']) ??
    Math.max(0, ...extractMoneyValues(ocr.rawText));
  const lineItems = extractLineItems(lines, total, taxCents, tipCents);
  const suggestion = suggestReceiptCategory({
    merchant,
    lineItems,
    priorChoices: options.priorChoices,
  });
  const duplicateWarning = findReceiptDuplicate(
    { merchant, date, amountCents: total },
    options.recentTransactions ?? [],
  );

  return {
    merchant,
    date,
    amountCents: total,
    currency,
    taxCents,
    tipCents,
    category: suggestion.category,
    tags: suggestion.tags,
    lineItems,
    duplicateWarning,
    metadata: {
      receiptOcrConfidence: ocr.confidence,
      receiptRawText: ocr.rawText,
      acceptedLineItems: lineItems,
      provider: options.providerName ?? ocr.source,
    },
  };
}

export function suggestReceiptCategory(input: {
  readonly merchant: string;
  readonly lineItems?: readonly ReceiptLineItem[];
  readonly priorChoices?: readonly ReceiptCategoryMemory[];
}): { readonly category: string; readonly tags: readonly string[]; readonly confidence: number } {
  const merchantKey = normalize(input.merchant);
  const prior = input.priorChoices?.find((choice) => normalize(choice.merchant) === merchantKey);
  if (prior) return { category: prior.category, tags: prior.tags ?? [], confidence: 0.95 };

  const searchable =
    `${input.merchant} ${(input.lineItems ?? []).map((item) => item.description).join(' ')}`.toLowerCase();
  const match = KEYWORD_CATEGORIES.find((entry) =>
    entry.keywords.some((keyword) => searchable.includes(keyword)),
  );
  return {
    category: match?.category ?? 'Uncategorized',
    tags: match?.tags ?? [],
    confidence: match ? 0.72 : 0.25,
  };
}

export function findReceiptDuplicate(
  draft: Pick<ReceiptTransactionDraft, 'merchant' | 'date' | 'amountCents'>,
  recentTransactions: readonly ReceiptTransaction[],
): ReceiptDuplicateWarning | undefined {
  const draftMerchant = normalize(draft.merchant);
  let best: ReceiptDuplicateWarning | undefined;
  for (const transaction of recentTransactions) {
    const days = Math.abs(daysBetween(transaction.date, draft.date));
    const amountDelta = Math.abs(transaction.amountCents - draft.amountCents);
    const merchantMatches =
      normalize(transaction.merchant) === draftMerchant ||
      normalize(transaction.merchant).includes(draftMerchant) ||
      draftMerchant.includes(normalize(transaction.merchant));
    if (!merchantMatches || days > 3 || amountDelta > 100) continue;
    const score =
      1 - Math.min(0.6, days * 0.15) - Math.min(0.3, amountDelta / Math.max(1, draft.amountCents));
    if (!best || score > best.score) {
      best = {
        transactionId: transaction.id,
        reason: 'Similar merchant, date, and amount already exist',
        score: Number(score.toFixed(2)),
      };
    }
  }
  return best;
}

export function validateReceiptSave(
  draft: ReceiptTransactionDraft,
  decision: ReceiptReviewDecision,
): ReceiptTransactionDraft {
  if (!decision.confirmed)
    throw new Error('Receipt transaction must be reviewed and confirmed before saving.');
  const merchant = (decision.merchant ?? draft.merchant).trim();
  const date = decision.date ?? draft.date;
  const amountCents = decision.amountCents ?? draft.amountCents;
  if (!merchant || merchant === 'Unknown merchant')
    throw new Error('Merchant is required before saving.');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date))
    throw new Error('A valid transaction date is required before saving.');
  if (!Number.isFinite(amountCents) || amountCents <= 0)
    throw new Error('A positive transaction amount is required before saving.');
  const acceptedLineItems = decision.acceptedLineItems ?? draft.lineItems;
  return {
    ...draft,
    merchant,
    date,
    amountCents,
    category: decision.category ?? draft.category,
    lineItems: acceptedLineItems,
    metadata: { ...draft.metadata, acceptedLineItems },
  };
}

function extractMerchant(lines: readonly string[]): string | undefined {
  return lines
    .find((line) => !/\d/u.test(line) && line.length >= 2)
    ?.replace(/receipt|invoice/giu, '')
    .trim();
}

function extractDate(text: string): string | undefined {
  const isoMatch = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/u);
  if (isoMatch)
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  const usMatch = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/u);
  if (!usMatch) return undefined;
  return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
}

function extractMoneyValues(text: string): number[] {
  return [...text.matchAll(/(?:[$€£]\s*)?(\d{1,5}(?:,\d{3})*\.\d{2})\b/gu)].map((match) =>
    Math.round(Number(match[1].replaceAll(',', '')) * 100),
  );
}

function extractLabelAmount(text: string, labels: readonly string[]): number | undefined {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|');
  const match = text.match(
    new RegExp(`(?:${escaped})\\s*[:#-]?\\s*(?:[$€£]\\s*)?(\\d{1,5}(?:,\\d{3})*\\.\\d{2})`, 'iu'),
  );
  return match ? Math.round(Number(match[1].replaceAll(',', '')) * 100) : undefined;
}

function extractLineItems(
  lines: readonly string[],
  total: number,
  tax?: number,
  tip?: number,
): ReceiptLineItem[] {
  const excluded = new Set([total, tax ?? -1, tip ?? -1]);
  return lines.flatMap((line) => {
    const match = line.match(/^(.+?)\s+(?:[$€£]\s*)?(\d{1,4}(?:,\d{3})*\.\d{2})$/u);
    if (!match) return [];
    const amountCents = Math.round(Number(match[2].replaceAll(',', '')) * 100);
    if (excluded.has(amountCents) || /total|tax|tip|subtotal/iu.test(match[1])) return [];
    return [{ description: match[1].trim(), amountCents, confidence: 0.7 }];
  });
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function daysBetween(left: string, right: string): number {
  return Math.round((Date.parse(left) - Date.parse(right)) / 86_400_000);
}
