// SPDX-License-Identifier: BUSL-1.1

/**
 * Receipt → expense draft engine (#2183).
 *
 * Pure, side-effect-free functions that turn an on-device OCR receipt result
 * into an editable **expense draft** for a food-truck (or any small business)
 * workflow. Each extracted line item can be mapped to a cost bucket from
 * { COGS, inventory, supplies, other } so the itemised data is usable for
 * margin / profit-and-loss math later.
 *
 * Money rules:
 *   - **Every monetary value is an integer number of cents** (e.g. $12.34 →
 *     1234). No floats are stored or returned.
 *
 * This module performs no I/O. The receipt image is referenced by an opaque
 * URL/key the caller supplies (object-URL, data-URL, or an attachment-store
 * key) — the bytes themselves are never read here.
 */

import type { ExtractedReceiptLineItem, ExtractedReceiptText } from '../import';

// ── Buckets ────────────────────────────────────────────────────────────────

/** The cost buckets a receipt line item can be mapped into. */
export type CogsBucket = 'COGS' | 'inventory' | 'supplies' | 'other';

/** Stable, ordered list of every bucket (drives UI controls + iteration). */
export const COGS_BUCKETS: readonly CogsBucket[] = ['COGS', 'inventory', 'supplies', 'other'];

/** Human-readable label for a bucket (screen-reader / control text). */
export const COGS_BUCKET_LABELS: Readonly<Record<CogsBucket, string>> = {
  COGS: 'Cost of goods (COGS)',
  inventory: 'Inventory',
  supplies: 'Supplies',
  other: 'Other',
};

/**
 * Tags applied to the saved expense for each bucket that carries a subtotal.
 * `COGS` maps to the `pnl:cogs` marker the profit-and-loss engine already
 * understands, so receipts feed straight into margin math. `other` carries no
 * marker (it falls back to the default expense bucket).
 */
const BUCKET_TAGS: Readonly<Record<CogsBucket, string | null>> = {
  COGS: 'pnl:cogs',
  inventory: 'inventory',
  supplies: 'supplies',
  other: null,
};

// ── Draft model ──────────────────────────────────────────────────────────────

/** A single, editable line item on the expense draft. */
export interface ReceiptDraftLineItem {
  readonly description: string;
  /** Line amount in integer cents (always ≥ 0). */
  readonly amountCents: number;
  readonly quantity: number | null;
  /** The cost bucket this line is mapped into. */
  readonly bucket: CogsBucket;
  /** Whether this line is included in the saved expense + reconciliation. */
  readonly included: boolean;
}

/** Reference to the receipt image attached to the draft. */
export interface ReceiptAttachmentRef {
  /** Object-URL, data-URL, or remote URL the image can be displayed from. */
  readonly url: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Deterministic storage key (built from template literals). */
  readonly storageKey: string;
  /** Accessible description used as the image alt text or control label. */
  readonly altText: string;
}

/** A reviewable expense draft built from an OCR receipt result. */
export interface ReceiptExpenseDraft {
  readonly merchant: string;
  /** ISO-8601 local date (YYYY-MM-DD). */
  readonly dateIso: string;
  /** Receipt grand total in integer cents (always ≥ 0). */
  readonly totalCents: number;
  readonly currencyCode: string | null;
  readonly lineItems: readonly ReceiptDraftLineItem[];
  readonly attachment: ReceiptAttachmentRef | null;
  readonly rawText: string;
  /** OCR confidence 0–100. */
  readonly confidence: number;
}

/** Per-bucket subtotal map in integer cents. */
export type BucketSubtotals = Readonly<Record<CogsBucket, number>>;

/** Whether mapped line items add up to the receipt total. */
export type ReconciliationStatus = 'balanced' | 'over' | 'under' | 'unmapped';

/** Result of comparing mapped line items against the receipt total. */
export interface ReconciliationResult {
  /** Sum of included line items, integer cents. */
  readonly mappedTotalCents: number;
  /** Receipt grand total, integer cents. */
  readonly receiptTotalCents: number;
  /** mappedTotal − receiptTotal (signed, integer cents). */
  readonly differenceCents: number;
  /** True when |difference| ≤ tolerance. */
  readonly isBalanced: boolean;
  readonly status: ReconciliationStatus;
}

// ── Storage key (template-literal only — gitleaks-safe) ──────────────────────

const RECEIPT_ATTACHMENT_NAMESPACE = 'receipts';

/**
 * Builds a deterministic storage key for a receipt image. The key is assembled
 * entirely from template literals so no secret-looking string literal is
 * introduced.
 */
export function buildReceiptAttachmentStorageKey(draftId: string, fileName: string): string {
  const safeName = fileName.trim().length > 0 ? fileName.trim() : `receipt-${draftId}`;
  return `${RECEIPT_ATTACHMENT_NAMESPACE}/${draftId}/${safeName}`;
}

// ── Classification ───────────────────────────────────────────────────────────

const SUPPLY_KEYWORDS: readonly string[] = [
  'cup',
  'lid',
  'napkin',
  'straw',
  'plate',
  'fork',
  'spoon',
  'knife',
  'utensil',
  'bag',
  'container',
  'foil',
  'wrap',
  'glove',
  'towel',
  'soap',
  'cleaner',
  'sanitizer',
  'detergent',
  'label',
];

const COGS_KEYWORDS: readonly string[] = [
  'produce',
  'meat',
  'chicken',
  'beef',
  'pork',
  'fish',
  'seafood',
  'cheese',
  'milk',
  'egg',
  'flour',
  'sugar',
  'oil',
  'sauce',
  'spice',
  'bun',
  'bread',
  'tortilla',
  'vegetable',
  'tomato',
  'onion',
  'lettuce',
  'beverage',
  'soda',
  'coffee',
  'beans',
  'rice',
  'dairy',
];

const INVENTORY_KEYWORDS: readonly string[] = [
  'case',
  'bulk',
  'carton',
  'crate',
  'pallet',
  'wholesale',
  'pack',
];

function matchesKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

/**
 * Suggests a default bucket for an extracted line item. Supplies and COGS
 * content win over a generic bulk/inventory marker, then the parser's category
 * hint is consulted, finally falling back to `other`.
 */
export function classifyLineItemBucket(item: ExtractedReceiptLineItem): CogsBucket {
  const text = item.description.toLowerCase();
  if (matchesKeyword(text, SUPPLY_KEYWORDS)) return 'supplies';
  if (matchesKeyword(text, COGS_KEYWORDS)) return 'COGS';
  if (matchesKeyword(text, INVENTORY_KEYWORDS)) return 'inventory';

  const category = item.suggestedCategory?.toLowerCase() ?? '';
  if (category === 'groceries' || category === 'restaurants') return 'COGS';
  if (category === 'household') return 'supplies';
  return 'other';
}

// ── Draft construction + edits (immutable) ───────────────────────────────────

function normaliseCents(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/** Builds an editable expense draft from an on-device OCR receipt result. */
export function createReceiptExpenseDraft(
  ocr: ExtractedReceiptText,
  options: { readonly fallbackDateIso?: string } = {},
): ReceiptExpenseDraft {
  const fallbackDate = options.fallbackDateIso ?? new Date().toISOString().slice(0, 10);
  const lineItems: ReceiptDraftLineItem[] = ocr.lineItems.map((item) => ({
    description: item.description,
    amountCents: normaliseCents(item.total),
    quantity: item.quantity,
    bucket: classifyLineItemBucket(item),
    included: true,
  }));

  return {
    merchant: ocr.merchant ?? '',
    dateIso: ocr.date ?? fallbackDate,
    totalCents: normaliseCents(ocr.total),
    currencyCode: ocr.currency,
    lineItems,
    attachment: null,
    rawText: ocr.rawText,
    confidence: Math.min(100, Math.max(0, Math.round(ocr.confidence))),
  };
}

function replaceLineItem(
  draft: ReceiptExpenseDraft,
  index: number,
  update: (item: ReceiptDraftLineItem) => ReceiptDraftLineItem,
): ReceiptExpenseDraft {
  if (index < 0 || index >= draft.lineItems.length) return draft;
  return {
    ...draft,
    lineItems: draft.lineItems.map((item, itemIndex) =>
      itemIndex === index ? update(item) : item,
    ),
  };
}

/** Returns a new draft with the line item at `index` mapped to `bucket`. */
export function assignLineItemBucket(
  draft: ReceiptExpenseDraft,
  index: number,
  bucket: CogsBucket,
): ReceiptExpenseDraft {
  return replaceLineItem(draft, index, (item) => ({ ...item, bucket }));
}

/** Returns a new draft toggling (or setting) whether a line item is included. */
export function toggleLineItemIncluded(
  draft: ReceiptExpenseDraft,
  index: number,
  included?: boolean,
): ReceiptExpenseDraft {
  return replaceLineItem(draft, index, (item) => ({
    ...item,
    included: included ?? !item.included,
  }));
}

/** Returns a new draft with the receipt image attached. */
export function attachReceiptImage(
  draft: ReceiptExpenseDraft,
  attachment: ReceiptAttachmentRef,
): ReceiptExpenseDraft {
  return { ...draft, attachment };
}

/** Returns a new draft with the receipt image removed. */
export function detachReceiptImage(draft: ReceiptExpenseDraft): ReceiptExpenseDraft {
  return { ...draft, attachment: null };
}

/** Returns a new draft with an updated merchant name. */
export function setDraftMerchant(
  draft: ReceiptExpenseDraft,
  merchant: string,
): ReceiptExpenseDraft {
  return { ...draft, merchant };
}

/** Returns a new draft with an updated grand total (clamped to ≥ 0 cents). */
export function setDraftTotalCents(
  draft: ReceiptExpenseDraft,
  totalCents: number,
): ReceiptExpenseDraft {
  return { ...draft, totalCents: normaliseCents(totalCents) };
}

/** Returns a new draft with an updated ISO date. */
export function setDraftDate(draft: ReceiptExpenseDraft, dateIso: string): ReceiptExpenseDraft {
  return { ...draft, dateIso };
}

// ── Subtotals + reconciliation ───────────────────────────────────────────────

/** Computes the included subtotal (integer cents) for each bucket. */
export function computeBucketSubtotals(draft: ReceiptExpenseDraft): BucketSubtotals {
  const subtotals: Record<CogsBucket, number> = {
    COGS: 0,
    inventory: 0,
    supplies: 0,
    other: 0,
  };
  for (const item of draft.lineItems) {
    if (item.included) {
      subtotals[item.bucket] += item.amountCents;
    }
  }
  return subtotals;
}

/** Sum of all included line items, in integer cents. */
export function computeMappedTotalCents(draft: ReceiptExpenseDraft): number {
  return draft.lineItems.reduce((sum, item) => (item.included ? sum + item.amountCents : sum), 0);
}

/**
 * Compares mapped line items against the receipt total. A non-zero
 * `differenceCents` is surfaced so the UI can flag a mismatch. `toleranceCents`
 * defaults to 0 (exact match required).
 */
export function reconcileDraft(
  draft: ReceiptExpenseDraft,
  toleranceCents = 0,
): ReconciliationResult {
  const mappedTotalCents = computeMappedTotalCents(draft);
  const receiptTotalCents = draft.totalCents;
  const differenceCents = mappedTotalCents - receiptTotalCents;
  const tolerance = Math.max(0, Math.round(toleranceCents));
  const isBalanced = Math.abs(differenceCents) <= tolerance;

  const hasMappedItems = draft.lineItems.some((item) => item.included);
  let status: ReconciliationStatus;
  if (!hasMappedItems) {
    status = 'unmapped';
  } else if (isBalanced) {
    status = 'balanced';
  } else if (differenceCents > 0) {
    status = 'over';
  } else {
    status = 'under';
  }

  return {
    mappedTotalCents,
    receiptTotalCents,
    differenceCents,
    isBalanced: hasMappedItems && isBalanced,
    status,
  };
}

// ── Serialisation for the transactions data path ─────────────────────────────

/**
 * Tags for the saved expense: always `receipt`, plus a marker for each bucket
 * that carries a subtotal so downstream margin math can find the line items.
 */
export function draftToTransactionTags(draft: ReceiptExpenseDraft): string[] {
  const subtotals = computeBucketSubtotals(draft);
  const tags = ['receipt'];
  for (const bucket of COGS_BUCKETS) {
    const tag = BUCKET_TAGS[bucket];
    if (tag !== null && subtotals[bucket] > 0) {
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * Serialises the reviewed draft into the transaction `customFields` map (all
 * string values) so the expense persists its itemisation, bucket subtotals,
 * reconciliation status, and receipt-image reference.
 */
export function draftToTransactionCustomFields(draft: ReceiptExpenseDraft): Record<string, string> {
  const reconciliation = reconcileDraft(draft);
  const subtotals = computeBucketSubtotals(draft);
  const includedItems = draft.lineItems.filter((item) => item.included);

  const fields: Record<string, string> = {
    receiptRawText: draft.rawText,
    receiptLineItems: JSON.stringify(
      includedItems.map((item) => ({
        description: item.description,
        amountCents: item.amountCents,
        quantity: item.quantity,
        bucket: item.bucket,
      })),
    ),
    receiptBucketSubtotals: JSON.stringify(subtotals),
    receiptReconciliationStatus: reconciliation.status,
    receiptReconciliationDifferenceCents: String(reconciliation.differenceCents),
    receiptMappedTotalCents: String(reconciliation.mappedTotalCents),
  };

  if (draft.attachment !== null) {
    fields.receiptImageUrl = draft.attachment.url;
    fields.receiptImageName = draft.attachment.fileName;
    fields.receiptImageStorageKey = draft.attachment.storageKey;
    fields.receiptAltText = draft.attachment.altText;
    fields.receiptUploadStatus = 'cached';
  }

  return fields;
}
