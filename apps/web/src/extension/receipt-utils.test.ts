// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  detectAmountFromText,
  detectDateFromText,
  extractMerchantFromHostname,
  validateReceiptForm,
  dollarsToCents,
} from './receipt-utils';

describe('receipt-utils', () => {
  describe('detectAmountFromText', () => {
    it('detects "Total: $42.50" pattern', () => {
      expect(detectAmountFromText('Your order\nTotal: $42.50\nThank you')).toBe('42.5');
    });

    it('detects "Amount: 100.00" pattern', () => {
      expect(detectAmountFromText('Amount: 100.00')).toBe('100');
    });

    it('detects "Order Total: $1,234.56" with comma', () => {
      expect(detectAmountFromText('Order Total: $1,234.56')).toBe('1234.56');
    });

    it('detects "Grand Total: 25.99" pattern', () => {
      expect(detectAmountFromText('Grand Total: 25.99')).toBe('25.99');
    });

    it('detects "Payment: $9.99" pattern', () => {
      expect(detectAmountFromText('Payment: $9.99')).toBe('9.99');
    });

    it('returns undefined when no amount found', () => {
      expect(detectAmountFromText('No amounts here')).toBeUndefined();
    });

    it('rejects amounts of 0 or negative', () => {
      expect(detectAmountFromText('Total: $0.00')).toBeUndefined();
    });

    it('rejects amounts over 1M', () => {
      expect(detectAmountFromText('Total: $2000000.00')).toBeUndefined();
    });
  });

  describe('detectDateFromText', () => {
    it('detects ISO date format (2025-01-15)', () => {
      expect(detectDateFromText('Date: 2025-01-15')).toBe('2025-01-15');
    });

    it('detects US date format (1/15/2025)', () => {
      const result = detectDateFromText('Date: 1/15/2025');
      expect(result).toBeDefined();
    });

    it('detects written date format (January 15, 2025)', () => {
      const result = detectDateFromText('Date: January 15, 2025');
      expect(result).toBeDefined();
    });

    it('detects abbreviated date (Jan 15, 2025)', () => {
      const result = detectDateFromText('Jan 15, 2025');
      expect(result).toBeDefined();
    });

    it('returns undefined when no date found', () => {
      expect(detectDateFromText('No dates here')).toBeUndefined();
    });
  });

  describe('extractMerchantFromHostname', () => {
    it('extracts from www.amazon.com', () => {
      expect(extractMerchantFromHostname('www.amazon.com')).toBe('Amazon');
    });

    it('extracts from starbucks.com', () => {
      expect(extractMerchantFromHostname('starbucks.com')).toBe('Starbucks');
    });

    it('extracts from shop.example.co.uk', () => {
      expect(extractMerchantFromHostname('shop.example.co.uk')).toBe('Shop');
    });

    it('capitalizes first letter', () => {
      expect(extractMerchantFromHostname('walmart.com')).toBe('Walmart');
    });

    it('returns undefined for single-part hostname', () => {
      expect(extractMerchantFromHostname('localhost')).toBeUndefined();
    });
  });

  describe('validateReceiptForm', () => {
    it('returns no errors for valid input', () => {
      const errors = validateReceiptForm({
        payee: 'Amazon',
        amount: '42.50',
        date: '2025-01-15',
        category: 'shopping',
        note: '',
      });
      expect(errors).toEqual({});
    });

    it('returns error for empty payee', () => {
      const errors = validateReceiptForm({
        payee: '',
        amount: '42.50',
        date: '',
        category: '',
        note: '',
      });
      expect(errors.payee).toBe('Payee is required');
    });

    it('returns error for whitespace-only payee', () => {
      const errors = validateReceiptForm({
        payee: '   ',
        amount: '42.50',
        date: '',
        category: '',
        note: '',
      });
      expect(errors.payee).toBe('Payee is required');
    });

    it('returns error for empty amount', () => {
      const errors = validateReceiptForm({
        payee: 'Store',
        amount: '',
        date: '',
        category: '',
        note: '',
      });
      expect(errors.amount).toBe('Enter a valid amount greater than 0');
    });

    it('returns error for zero amount', () => {
      const errors = validateReceiptForm({
        payee: 'Store',
        amount: '0',
        date: '',
        category: '',
        note: '',
      });
      expect(errors.amount).toBe('Enter a valid amount greater than 0');
    });

    it('returns error for negative amount', () => {
      const errors = validateReceiptForm({
        payee: 'Store',
        amount: '-5',
        date: '',
        category: '',
        note: '',
      });
      expect(errors.amount).toBe('Enter a valid amount greater than 0');
    });

    it('returns error for non-numeric amount', () => {
      const errors = validateReceiptForm({
        payee: 'Store',
        amount: 'abc',
        date: '',
        category: '',
        note: '',
      });
      expect(errors.amount).toBe('Enter a valid amount greater than 0');
    });

    it('returns both errors when both fields are invalid', () => {
      const errors = validateReceiptForm({
        payee: '',
        amount: '',
        date: '',
        category: '',
        note: '',
      });
      expect(errors.payee).toBeDefined();
      expect(errors.amount).toBeDefined();
    });
  });

  describe('dollarsToCents', () => {
    it('converts $42.50 to 4250 cents', () => {
      expect(dollarsToCents('42.50')).toBe(4250);
    });

    it('converts $1.99 to 199 cents', () => {
      expect(dollarsToCents('1.99')).toBe(199);
    });

    it('converts $100 to 10000 cents', () => {
      expect(dollarsToCents('100')).toBe(10000);
    });

    it('handles floating point precision', () => {
      expect(dollarsToCents('19.99')).toBe(1999);
    });

    it('converts $0.01 to 1 cent', () => {
      expect(dollarsToCents('0.01')).toBe(1);
    });

    it('converts large amount correctly', () => {
      expect(dollarsToCents('1234.56')).toBe(123456);
    });
  });
});
