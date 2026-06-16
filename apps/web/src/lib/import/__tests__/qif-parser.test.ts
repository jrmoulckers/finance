// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  extractCategory,
  parseQif,
  parseQifAmount,
  parseQifDate,
  parseQifRecords,
} from '../qif-parser';
import { ImportFormat } from '../types';

const SAMPLE_QIF = `!Type:Bank
D01/15/2024
T-45.67
PGrocery Store
MGrocery purchase
N1234
LFood:Groceries
C*
^
D01/16/2024
T2500.00
PSalary Deposit
MMonthly salary
LIncome:Salary
^
D01/20/2024
T-100.00
PElectric Company
LUtilities:Electric
^`;

describe('parseQif', () => {
  it('parses valid QIF content', () => {
    const result = parseQif(SAMPLE_QIF);

    expect(result.format).toBe(ImportFormat.QIF);
    expect(result.transactions).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.totalRecords).toBe(3);
  });

  it('extracts transaction details correctly', () => {
    const result = parseQif(SAMPLE_QIF);
    const txn = result.transactions[0];

    expect(txn.date).toBe('2024-01-15');
    expect(txn.amountCents).toBe(-4567);
    expect(txn.description).toBe('Grocery Store');
    expect(txn.checkNumber).toBe('1234');
    expect(txn.memo).toBe('Grocery purchase');
    expect(txn.category).toBe('Food');
  });

  it('parses credit transactions', () => {
    const result = parseQif(SAMPLE_QIF);
    expect(result.transactions[1].amountCents).toBe(250000);
    expect(result.transactions[1].description).toBe('Salary Deposit');
  });

  it('extracts categories from L lines', () => {
    const result = parseQif(SAMPLE_QIF);
    expect(result.transactions[0].category).toBe('Food');
    expect(result.transactions[1].category).toBe('Income');
    expect(result.transactions[2].category).toBe('Utilities');
  });

  it('handles QIF without type header', () => {
    const noHeader = `D01/15/2024
T-10.00
PTest
^`;
    const result = parseQif(noHeader);
    expect(result.transactions).toHaveLength(1);
    expect(result.errors.some((e) => e.message.includes('No !Type:'))).toBe(true);
  });

  it('handles credit card type', () => {
    const ccQif = `!Type:CCard
D01/15/2024
T-45.67
PRestaurant
^`;
    const result = parseQif(ccQif);
    expect(result.transactions[0].type).toBe('CREDIT_CARD');
  });

  it('reports errors for records missing date', () => {
    const noDate = `!Type:Bank
T-10.00
PTest
^`;
    const result = parseQif(noDate);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors.some((e) => e.message.includes('Missing date'))).toBe(true);
  });

  it('reports errors for records missing amount', () => {
    const noAmount = `!Type:Bank
D01/15/2024
PTest
^`;
    const result = parseQif(noAmount);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors.some((e) => e.message.includes('Missing amount'))).toBe(true);
  });

  it('handles records without trailing caret', () => {
    const noTerminator = `!Type:Bank
D01/15/2024
T-10.00
PTest`;
    const result = parseQif(noTerminator);
    expect(result.transactions).toHaveLength(1);
  });

  it('preserves account sections and mid-file account switches', () => {
    const multi = `!Account
NChecking
TBank
^
!Type:Bank
D01/15/2024
T-10.00
PCoffee
^
!Account
NCredit Card
TCCard
^
!Type:CCard
D01/16/2024
T-20.00
PStore
^`;
    const result = parseQif(multi);
    expect(result.accountId).toBe('Checking,Credit Card');
    expect(result.transactions[0].rawFields.ACCOUNT).toBe('Checking');
    expect(result.transactions[1].rawFields.ACCOUNT).toBe('Credit Card');
    expect(result.transactions[1].type).toBe('CREDIT_CARD');
  });

  it('preserves multiline memo, address, cleared status, and split lines', () => {
    const split = `!Type:Bank
D01/15/2024
T-100.00
PBig Store
MFirst memo
MSecond memo
C*
A123 Main
SFood
$-60.00
SHome
$-40.00
^`;
    const result = parseQif(split);
    expect(result.transactions[0].memo).toContain('First memo\nSecond memo\n123 Main');
    expect(result.transactions[0].rawFields.C).toBe('*');
    expect(result.transactions[0].rawFields.SPLITS).toContain('SFood');
  });
});

describe('parseQifRecords', () => {
  it('parses records separated by caret terminators', () => {
    const lines = [
      'D01/15/2024',
      'T-10.00',
      'PTest 1',
      '^',
      'D01/16/2024',
      'T20.00',
      'PTest 2',
      '^',
    ];
    const records = parseQifRecords(lines, 0);
    expect(records).toHaveLength(2);
    expect(records[0].payee).toBe('Test 1');
    expect(records[1].payee).toBe('Test 2');
  });

  it('collects address lines', () => {
    const lines = ['D01/15/2024', 'T-10.00', 'PVendor', 'A123 Main St', 'ACity, ST 12345', '^'];
    const records = parseQifRecords(lines, 0);
    expect(records[0].address).toHaveLength(2);
    expect(records[0].address[0]).toBe('123 Main St');
  });

  it('skips !-prefixed lines mid-file', () => {
    const lines = ['D01/15/2024', 'T-10.00', '!Option:AutoSwitch', 'PTest', '^'];
    const records = parseQifRecords(lines, 0);
    expect(records).toHaveLength(1);
  });
});

describe('parseQifDate', () => {
  it('parses MM/DD/YYYY format', () => {
    expect(parseQifDate('01/15/2024')).toBe('2024-01-15');
  });

  it('parses M/D/YYYY format', () => {
    expect(parseQifDate('1/5/2024')).toBe('2024-01-05');
  });

  it("parses MM/DD'YY format (apostrophe)", () => {
    expect(parseQifDate("01/15'24")).toBe('2024-01-15');
    expect(parseQifDate("06/01'99")).toBe('1999-06-01');
  });

  it('parses MM/DD/YY format', () => {
    expect(parseQifDate('01/15/24')).toBe('2024-01-15');
  });

  it('parses MM-DD-YYYY format', () => {
    expect(parseQifDate('01-15-2024')).toBe('2024-01-15');
  });

  it('returns null for invalid dates', () => {
    expect(parseQifDate('')).toBe(null);
    expect(parseQifDate('invalid')).toBe(null);
  });
});

describe('parseQifAmount', () => {
  it('parses positive amounts to cents', () => {
    expect(parseQifAmount('100.00')).toBe(10000);
  });

  it('parses negative amounts to cents', () => {
    expect(parseQifAmount('-45.67')).toBe(-4567);
  });

  it('handles thousands separators', () => {
    expect(parseQifAmount('1,234.56')).toBe(123456);
  });

  it('returns null for non-numeric', () => {
    expect(parseQifAmount('abc')).toBe(null);
  });
});

describe('extractCategory', () => {
  it('extracts primary category from subcategory', () => {
    expect(extractCategory('Food:Groceries')).toBe('Food');
  });

  it('handles transfer markers', () => {
    expect(extractCategory('[Checking]')).toBe('Checking');
  });

  it('strips class markers', () => {
    expect(extractCategory('Food/Personal')).toBe('Food');
  });

  it('returns simple category as-is', () => {
    expect(extractCategory('Utilities')).toBe('Utilities');
  });
});
