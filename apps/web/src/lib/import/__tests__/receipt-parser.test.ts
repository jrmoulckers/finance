// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { parseReceiptText } from '../receipt-parser';

const simpleReceipt = `Simple Market
2026-05-26
Organic Apples 3.99
Whole Milk 4.49
Sourdough Bread 5.25
Subtotal 13.73
Tax 2.35
Total $16.08`;

describe('parseReceiptText', () => {
  it('extracts merchant, date, total and itemized lines', () => {
    const receipt = parseReceiptText(simpleReceipt);

    expect(receipt).toMatchObject({
      merchant: 'Simple Market',
      date: '2026-05-26',
      total: 1608,
      currency: 'USD',
      rawText: simpleReceipt,
      confidence: 100,
    });
    expect(receipt.lineItems).toHaveLength(3);
    expect(receipt.lineItems[0]).toMatchObject({
      description: 'Organic Apples',
      total: 399,
      suggestedCategory: 'Groceries',
      categoryAccepted: false,
    });
  });

  it('maps category suggestions to supplied category ids', () => {
    const receipt = parseReceiptText(simpleReceipt, {
      categories: [
        { id: 'cat-grocery', name: 'Groceries' },
        { id: 'cat-dining', name: 'Restaurants' },
      ],
    });

    expect(receipt.lineItems[0].suggestedCategoryId).toBe('cat-grocery');
  });

  it('normalises OCR confidence values', () => {
    const receipt = parseReceiptText(simpleReceipt, { ocrConfidence: 0.82 });

    expect(receipt.confidence).toBe(82);
  });
});
