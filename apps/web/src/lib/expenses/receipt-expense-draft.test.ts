// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the receipt → expense draft engine (#2183).
 *
 * Verifies OCR-result → draft mapping, per-bucket subtotal math (exact cents),
 * reconciliation mismatch detection, attachment handling, and serialisation to
 * the transactions data path.
 */

import { describe, expect, it } from 'vitest';

import type { ExtractedReceiptLineItem, ExtractedReceiptText } from '../import';
import {
  assignLineItemBucket,
  attachReceiptImage,
  buildReceiptAttachmentStorageKey,
  classifyLineItemBucket,
  computeBucketSubtotals,
  computeMappedTotalCents,
  createReceiptExpenseDraft,
  draftToTransactionCustomFields,
  draftToTransactionTags,
  reconcileDraft,
  toggleLineItemIncluded,
  type ReceiptAttachmentRef,
} from './receipt-expense-draft';

function makeLineItem(overrides: Partial<ExtractedReceiptLineItem> = {}): ExtractedReceiptLineItem {
  return {
    description: 'Item',
    total: 100,
    quantity: null,
    suggestedCategory: null,
    suggestedCategoryId: null,
    categoryAccepted: false,
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<ExtractedReceiptText> = {}): ExtractedReceiptText {
  return {
    merchant: 'Restaurant Depot',
    date: '2026-02-14',
    total: 5000,
    currency: 'USD',
    lineItems: [],
    rawText: 'RESTAURANT DEPOT\n...',
    confidence: 82,
    ...overrides,
  };
}

describe('createReceiptExpenseDraft', () => {
  it('maps an OCR result into an editable draft with integer cents', () => {
    const receipt = makeReceipt({
      lineItems: [
        makeLineItem({ description: 'Chicken breast 10lb', total: 3200 }),
        makeLineItem({ description: 'Paper cups 100ct', total: 1800 }),
      ],
    });

    const draft = createReceiptExpenseDraft(receipt);

    expect(draft.merchant).toBe('Restaurant Depot');
    expect(draft.dateIso).toBe('2026-02-14');
    expect(draft.totalCents).toBe(5000);
    expect(draft.currencyCode).toBe('USD');
    expect(draft.lineItems).toHaveLength(2);
    expect(draft.lineItems[0]).toMatchObject({
      description: 'Chicken breast 10lb',
      amountCents: 3200,
      bucket: 'COGS',
      included: true,
    });
    expect(draft.lineItems[1].bucket).toBe('supplies');
    expect(draft.attachment).toBeNull();
  });

  it('falls back to the provided date and empty merchant when OCR is missing fields', () => {
    const receipt = makeReceipt({ merchant: null, date: null, total: null });
    const draft = createReceiptExpenseDraft(receipt, { fallbackDateIso: '2026-06-23' });

    expect(draft.merchant).toBe('');
    expect(draft.dateIso).toBe('2026-06-23');
    expect(draft.totalCents).toBe(0);
  });

  it('clamps negative or fractional cents to non-negative integers', () => {
    const receipt = makeReceipt({
      total: -50,
      lineItems: [makeLineItem({ description: 'x', total: 12.6 })],
    });
    const draft = createReceiptExpenseDraft(receipt);
    expect(draft.totalCents).toBe(0);
    expect(draft.lineItems[0].amountCents).toBe(13);
  });
});

describe('classifyLineItemBucket', () => {
  it('routes ingredient keywords to COGS', () => {
    expect(classifyLineItemBucket(makeLineItem({ description: 'Ground beef' }))).toBe('COGS');
  });

  it('routes packaging keywords to supplies', () => {
    expect(classifyLineItemBucket(makeLineItem({ description: 'Napkin pack' }))).toBe('supplies');
  });

  it('routes bulk markers without other hints to inventory', () => {
    expect(classifyLineItemBucket(makeLineItem({ description: 'Case of widgets' }))).toBe(
      'inventory',
    );
  });

  it('uses the parser category hint when no keyword matches', () => {
    expect(
      classifyLineItemBucket(
        makeLineItem({ description: 'Mystery', suggestedCategory: 'Groceries' }),
      ),
    ).toBe('COGS');
    expect(
      classifyLineItemBucket(
        makeLineItem({ description: 'Mystery', suggestedCategory: 'Household' }),
      ),
    ).toBe('supplies');
  });

  it('defaults to other', () => {
    expect(classifyLineItemBucket(makeLineItem({ description: 'Unknown thing' }))).toBe('other');
  });
});

describe('computeBucketSubtotals', () => {
  it('sums included line items per bucket with exact cents', () => {
    const receipt = makeReceipt({
      total: 6000,
      lineItems: [
        makeLineItem({ description: 'Beef', total: 2500 }),
        makeLineItem({ description: 'Onion', total: 500 }),
        makeLineItem({ description: 'Cups', total: 1200 }),
        makeLineItem({ description: 'Case widget', total: 1800 }),
      ],
    });
    const draft = createReceiptExpenseDraft(receipt);

    const subtotals = computeBucketSubtotals(draft);
    expect(subtotals.COGS).toBe(3000);
    expect(subtotals.supplies).toBe(1200);
    expect(subtotals.inventory).toBe(1800);
    expect(subtotals.other).toBe(0);
  });

  it('excludes line items that are toggled off', () => {
    const receipt = makeReceipt({
      lineItems: [
        makeLineItem({ description: 'Beef', total: 2500 }),
        makeLineItem({ description: 'Onion', total: 500 }),
      ],
    });
    let draft = createReceiptExpenseDraft(receipt);
    draft = toggleLineItemIncluded(draft, 1, false);

    const subtotals = computeBucketSubtotals(draft);
    expect(subtotals.COGS).toBe(2500);
    expect(computeMappedTotalCents(draft)).toBe(2500);
  });

  it('reflects a re-assigned bucket', () => {
    const receipt = makeReceipt({
      lineItems: [makeLineItem({ description: 'Beef', total: 2500 })],
    });
    let draft = createReceiptExpenseDraft(receipt);
    draft = assignLineItemBucket(draft, 0, 'inventory');

    const subtotals = computeBucketSubtotals(draft);
    expect(subtotals.COGS).toBe(0);
    expect(subtotals.inventory).toBe(2500);
  });
});

describe('reconcileDraft', () => {
  it('reports balanced when mapped line items equal the receipt total', () => {
    const receipt = makeReceipt({
      total: 3000,
      lineItems: [
        makeLineItem({ description: 'Beef', total: 2500 }),
        makeLineItem({ description: 'Onion', total: 500 }),
      ],
    });
    const draft = createReceiptExpenseDraft(receipt);

    const result = reconcileDraft(draft);
    expect(result.mappedTotalCents).toBe(3000);
    expect(result.receiptTotalCents).toBe(3000);
    expect(result.differenceCents).toBe(0);
    expect(result.isBalanced).toBe(true);
    expect(result.status).toBe('balanced');
  });

  it('flags an under-mapped mismatch', () => {
    const receipt = makeReceipt({
      total: 5000,
      lineItems: [makeLineItem({ description: 'Beef', total: 2500 })],
    });
    const draft = createReceiptExpenseDraft(receipt);

    const result = reconcileDraft(draft);
    expect(result.differenceCents).toBe(-2500);
    expect(result.isBalanced).toBe(false);
    expect(result.status).toBe('under');
  });

  it('flags an over-mapped mismatch', () => {
    const receipt = makeReceipt({
      total: 1000,
      lineItems: [
        makeLineItem({ description: 'Beef', total: 800 }),
        makeLineItem({ description: 'Onion', total: 400 }),
      ],
    });
    const draft = createReceiptExpenseDraft(receipt);

    const result = reconcileDraft(draft);
    expect(result.differenceCents).toBe(200);
    expect(result.status).toBe('over');
  });

  it('honours a tolerance', () => {
    const receipt = makeReceipt({
      total: 1000,
      lineItems: [makeLineItem({ description: 'Beef', total: 1002 })],
    });
    const draft = createReceiptExpenseDraft(receipt);

    expect(reconcileDraft(draft, 5).status).toBe('balanced');
    expect(reconcileDraft(draft, 0).status).toBe('over');
  });

  it('reports unmapped when no line items are included', () => {
    const receipt = makeReceipt({ total: 1000, lineItems: [] });
    const draft = createReceiptExpenseDraft(receipt);

    const result = reconcileDraft(draft);
    expect(result.status).toBe('unmapped');
    expect(result.isBalanced).toBe(false);
  });
});

describe('attachments', () => {
  it('builds a storage key from template literals', () => {
    expect(buildReceiptAttachmentStorageKey('abc-123', 'receipt.jpg')).toBe(
      'receipts/abc-123/receipt.jpg',
    );
  });

  it('falls back to a derived name when the file name is blank', () => {
    expect(buildReceiptAttachmentStorageKey('abc-123', '  ')).toBe(
      'receipts/abc-123/receipt-abc-123',
    );
  });

  it('attaches and serialises the receipt image reference', () => {
    const receipt = makeReceipt({
      lineItems: [makeLineItem({ description: 'Beef', total: 2500 })],
    });
    const attachment: ReceiptAttachmentRef = {
      url: 'blob:mock-url',
      fileName: 'receipt.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      storageKey: buildReceiptAttachmentStorageKey('draft-1', 'receipt.jpg'),
      altText: 'Receipt photo from Restaurant Depot',
    };
    const draft = attachReceiptImage(createReceiptExpenseDraft(receipt), attachment);

    expect(draft.attachment).toEqual(attachment);

    const fields = draftToTransactionCustomFields(draft);
    expect(fields.receiptImageUrl).toBe('blob:mock-url');
    expect(fields.receiptImageStorageKey).toBe('receipts/draft-1/receipt.jpg');
    expect(fields.receiptAltText).toBe('Receipt photo from Restaurant Depot');
    expect(fields.receiptUploadStatus).toBe('cached');
  });
});

describe('serialisation to the transactions data path', () => {
  it('produces bucket tags for every non-empty bucket', () => {
    const receipt = makeReceipt({
      lineItems: [
        makeLineItem({ description: 'Beef', total: 2500 }),
        makeLineItem({ description: 'Cups', total: 1000 }),
        makeLineItem({ description: 'Case widget', total: 800 }),
      ],
    });
    const draft = createReceiptExpenseDraft(receipt);

    const tags = draftToTransactionTags(draft);
    expect(tags).toContain('receipt');
    expect(tags).toContain('pnl:cogs');
    expect(tags).toContain('supplies');
    expect(tags).toContain('inventory');
  });

  it('serialises included line items with their buckets and subtotals', () => {
    const receipt = makeReceipt({
      total: 3500,
      lineItems: [
        makeLineItem({ description: 'Beef', total: 2500 }),
        makeLineItem({ description: 'Cups', total: 1000 }),
      ],
    });
    const draft = createReceiptExpenseDraft(receipt);

    const fields = draftToTransactionCustomFields(draft);
    const items = JSON.parse(fields.receiptLineItems) as Array<{ bucket: string }>;
    expect(items).toHaveLength(2);
    expect(items[0].bucket).toBe('COGS');

    const subtotals = JSON.parse(fields.receiptBucketSubtotals) as Record<string, number>;
    expect(subtotals.COGS).toBe(2500);
    expect(subtotals.supplies).toBe(1000);
    expect(fields.receiptReconciliationStatus).toBe('balanced');
    expect(fields.receiptReconciliationDifferenceCents).toBe('0');
  });
});
