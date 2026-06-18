// SPDX-License-Identifier: BUSL-1.1

import {
  findReceiptDuplicate,
  mapReceiptOcrToDraft,
  stubReceiptOcrProvider,
  suggestReceiptCategory,
  validateReceiptSave,
} from './receiptOcr';

const rawReceipt = `Fresh Market
2026-03-12
Milk 3.49
Bread 4.25
Tax 0.62
Total 8.36`;

describe('receipt OCR extraction to transaction', () => {
  it('uses a local stub provider and maps receipt text to a transaction draft', async () => {
    const ocr = await stubReceiptOcrProvider.extract(rawReceipt);
    const draft = mapReceiptOcrToDraft(ocr, { providerName: stubReceiptOcrProvider.name });
    expect(draft).toMatchObject({
      merchant: 'Fresh Market',
      date: '2026-03-12',
      amountCents: 836,
      currency: 'USD',
      taxCents: 62,
      category: 'Groceries',
    });
    expect(draft.lineItems).toHaveLength(2);
    expect(draft.metadata.receiptRawText).toContain('Fresh Market');
    expect(draft.metadata.provider).toBe('stub-local-receipt-text');
  });

  it('prefers prior user category choices over keyword rules', () => {
    const suggestion = suggestReceiptCategory({
      merchant: 'Fresh Market',
      priorChoices: [{ merchant: 'fresh market', category: 'Household', tags: ['shared'] }],
    });
    expect(suggestion).toEqual({ category: 'Household', tags: ['shared'], confidence: 0.95 });
  });

  it('detects likely duplicate receipt transactions', () => {
    const warning = findReceiptDuplicate(
      { merchant: 'Fresh Market', date: '2026-03-13', amountCents: 836 },
      [{ id: 'existing', merchant: 'Fresh Market', date: '2026-03-12', amountCents: 830 }],
    );
    expect(warning?.transactionId).toBe('existing');
    expect(warning?.score).toBeGreaterThan(0.7);
  });

  it('requires review confirmation before save and persists accepted metadata', async () => {
    const draft = mapReceiptOcrToDraft(await stubReceiptOcrProvider.extract(rawReceipt));
    expect(() => validateReceiptSave(draft, { confirmed: false })).toThrow(/confirmed/u);
    const saved = validateReceiptSave(draft, {
      confirmed: true,
      acceptedLineItems: [draft.lineItems[0]],
      category: 'Groceries',
    });
    expect(saved.metadata.acceptedLineItems).toHaveLength(1);
    expect(saved.category).toBe('Groceries');
  });
});
