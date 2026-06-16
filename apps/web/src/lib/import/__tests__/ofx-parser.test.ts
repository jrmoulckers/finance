// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  extractBlocks,
  extractTagValue,
  parseOfx,
  parseOfxAmount,
  parseOfxDate,
} from '../ofx-parser';
import { ImportFormat } from '../types';

const SAMPLE_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS><CODE>0</CODE></STATUS>
<DTSERVER>20240201120000
<LANGUAGE>ENG
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STATUS><CODE>0</CODE></STATUS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>123456789
<ACCTID>9876543210
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20240101
<DTEND>20240131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-45.67
<FITID>2024011501
<NAME>GROCERY STORE
<MEMO>Purchase at store
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240116
<TRNAMT>2500.00
<FITID>2024011601
<NAME>DIRECT DEPOSIT
</STMTTRN>
<STMTTRN>
<TRNTYPE>CHECK
<DTPOSTED>20240120
<TRNAMT>-100.00
<FITID>2024012001
<NAME>CHECK 1234
<CHECKNUM>1234
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

describe('parseOfx', () => {
  it('parses valid OFX content', () => {
    const result = parseOfx(SAMPLE_OFX);

    expect(result.format).toBe(ImportFormat.OFX);
    expect(result.transactions).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.accountId).toBe('9876543210');
    expect(result.currency).toBe('USD');
    expect(result.startDate).toBe('2024-01-01');
    expect(result.endDate).toBe('2024-01-31');
  });

  it('extracts transaction details correctly', () => {
    const result = parseOfx(SAMPLE_OFX);
    const txn = result.transactions[0];

    expect(txn.date).toBe('2024-01-15');
    expect(txn.amountCents).toBe(-4567);
    expect(txn.description).toBe('GROCERY STORE');
    expect(txn.sourceId).toBe('2024011501');
    expect(txn.type).toBe('DEBIT');
    expect(txn.memo).toBe('Purchase at store');
  });

  it('parses credit transactions', () => {
    const result = parseOfx(SAMPLE_OFX);
    const txn = result.transactions[1];

    expect(txn.amountCents).toBe(250000);
    expect(txn.type).toBe('CREDIT');
  });

  it('parses check transactions with check number', () => {
    const result = parseOfx(SAMPLE_OFX);
    const txn = result.transactions[2];

    expect(txn.checkNumber).toBe('1234');
    expect(txn.type).toBe('CHECK');
  });

  it('detects QFX format with Intuit headers', () => {
    const qfx = `OFXHEADER:100
INTU.BID:12345
<OFX>
<STMTTRN>
<DTPOSTED>20240115
<TRNAMT>-10.00
<FITID>001
<NAME>TEST
</STMTTRN>
</OFX>`;
    const result = parseOfx(qfx);
    expect(result.format).toBe(ImportFormat.QFX);
  });

  it('handles content with no transactions', () => {
    const empty = `OFXHEADER:100\n<OFX></OFX>`;
    const result = parseOfx(empty);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors.some((e) => e.severity === 'warning')).toBe(true);
  });

  it('reports errors for malformed STMTTRN records', () => {
    const malformed = `<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<TRNAMT>-10.00
<FITID>001
<NAME>MISSING DATE
</STMTTRN>
</OFX>`;
    const result = parseOfx(malformed);
    expect(result.errors.some((e) => e.message.includes('Missing DTPOSTED'))).toBe(true);
  });

  it('reports errors for missing amount', () => {
    const noAmount = `<OFX>
<STMTTRN>
<DTPOSTED>20240115
<FITID>001
<NAME>NO AMOUNT
</STMTTRN>
</OFX>`;
    const result = parseOfx(noAmount);
    expect(result.errors.some((e) => e.message.includes('Missing TRNAMT'))).toBe(true);
  });

  it('keeps valid records when another record is malformed', () => {
    const partial = `<OFX>
<STMTTRN><DTPOSTED>20240115<TRNAMT>-10.00<FITID>OK<NAME>Good</STMTTRN>
<STMTTRN><TRNAMT>-2.00<NAME>Bad</STMTTRN>
</OFX>`;
    const result = parseOfx(partial);
    expect(result.transactions).toHaveLength(1);
    expect(result.errors.some((error) => error.message.includes('Missing DTPOSTED'))).toBe(true);
  });

  it('normalizes positive debit amounts from banks that omit signs', () => {
    const debit = `<OFX><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20240115</DTPOSTED><TRNAMT>45.67</TRNAMT><FITID>001</FITID><NAME>POS</NAME></STMTTRN></OFX>`;
    const result = parseOfx(debit);
    expect(result.transactions[0].amountCents).toBe(-4567);
  });
});

describe('parseOfxDate', () => {
  it('parses YYYYMMDD format', () => {
    expect(parseOfxDate('20240115')).toBe('2024-01-15');
  });

  it('parses YYYYMMDDHHMMSS format', () => {
    expect(parseOfxDate('20240115120000')).toBe('2024-01-15');
  });

  it('handles timezone bracket notation', () => {
    expect(parseOfxDate('20240115120000[-5:EST]')).toBe('2024-01-15');
  });

  it('handles fractional seconds, ISO separators, and numeric timezone suffixes', () => {
    expect(parseOfxDate('20240115120000.000[-5:EST]')).toBe('2024-01-15');
    expect(parseOfxDate('2024-01-15T12:00:00-0500')).toBe('2024-01-15');
  });

  it('returns null for too-short strings', () => {
    expect(parseOfxDate('2024')).toBe(null);
  });

  it('returns null for invalid dates', () => {
    expect(parseOfxDate('20241301')).toBe(null); // month 13
  });
});

describe('parseOfxAmount', () => {
  it('parses positive amounts to cents', () => {
    expect(parseOfxAmount('100.00')).toBe(10000);
    expect(parseOfxAmount('2500.00')).toBe(250000);
  });

  it('parses negative amounts to cents', () => {
    expect(parseOfxAmount('-45.67')).toBe(-4567);
  });

  it('returns null for non-numeric strings', () => {
    expect(parseOfxAmount('abc')).toBe(null);
  });
});

describe('extractTagValue', () => {
  it('extracts XML-style tag values', () => {
    expect(extractTagValue('<ACCTID>12345</ACCTID>', 'ACCTID')).toBe('12345');
  });

  it('extracts SGML-style tag values', () => {
    expect(extractTagValue('<ACCTID>12345\n<ACCTTYPE>CHECKING', 'ACCTID')).toBe('12345');
  });

  it('returns null for missing tags', () => {
    expect(extractTagValue('<OTHER>value', 'ACCTID')).toBe(null);
  });
});

describe('extractBlocks', () => {
  it('extracts multiple blocks', () => {
    const content = `<STMTTRN>block1</STMTTRN><STMTTRN>block2</STMTTRN>`;
    const blocks = extractBlocks(content, 'STMTTRN');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe('block1');
    expect(blocks[1]).toBe('block2');
  });

  it('handles SGML-style blocks without close tags', () => {
    const content = `<STMTTRN>
<DTPOSTED>20240115
<TRNAMT>-10.00
<STMTTRN>
<DTPOSTED>20240116
<TRNAMT>20.00`;
    const blocks = extractBlocks(content, 'STMTTRN');
    expect(blocks).toHaveLength(2);
  });
});
