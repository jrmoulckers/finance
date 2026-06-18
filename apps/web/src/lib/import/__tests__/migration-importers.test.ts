// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildMigrationPreflight, createMigrationPreflight } from '../migration-importers';
import { parseImportFile } from '../format-detector';

describe('createMigrationPreflight', () => {
  it('preserves Mint account, category, labels, notes, and original description', () => {
    const mint = `Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels,Notes
01/15/2024,Whole Foods,WHOLE FOODS #123,45.67,debit,Groceries,Amex Gold,"food, reimbursable",Paper receipt`;

    const preflight = createMigrationPreflight('mint.csv', mint);

    expect(preflight.source).toBe('mint');
    expect(preflight.summary.transactionCount).toBe(1);
    expect(preflight.accounts).toEqual(['Amex Gold']);
    expect(preflight.categories).toEqual(['Groceries']);
    expect(preflight.tags).toEqual(['food', 'reimbursable']);
    expect(preflight.transactions[0].originalDescription).toBe('WHOLE FOODS #123');
    expect(preflight.transactions[0].note).toBe('Paper receipt');
  });

  it('preserves YNAB account, category, memo, flag, and cleared status', () => {
    const ynab = `Account,Flag,Date,Payee,Category Group/Category,Memo,Outflow,Inflow,Cleared
Checking,Blue,2024-01-16,Payroll,Income: Salary,January paycheck,,2500.00,Cleared`;

    const preflight = createMigrationPreflight('ynab.csv', ynab);

    expect(preflight.source).toBe('ynab');
    expect(preflight.accounts).toEqual(['Checking']);
    expect(preflight.categories).toEqual(['Income: Salary']);
    expect(preflight.tags).toEqual(['Blue']);
    expect(preflight.transactions[0].clearedStatus).toBe('cleared');
  });

  it('preserves Quicken QIF account sections and cleared status', () => {
    const qif = `!Account
NChecking
^
!Type:Bank
D01/17/2024
T-12.34
PCoffee Shop
C*
LRestaurants:Coffee
^
!Account
NSavings
^
!Type:Bank
D01/18/2024
T100.00
PInterest
CX
LInterest
^`;

    const preflight = createMigrationPreflight('quicken.qif', qif);

    expect(preflight.source).toBe('quicken-qif');
    expect(preflight.accounts).toEqual(['Checking', 'Savings']);
    expect(preflight.transactions.map((transaction) => transaction.clearedStatus)).toEqual([
      '*',
      'X',
    ]);
  });

  it('counts duplicate source transaction IDs in QFX/OFX results', () => {
    const qfx = `OFXHEADER:100
INTU.BID:12345
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20240115<TRNAMT>-10.00<FITID>dup-1<NAME>Coffee</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20240116<TRNAMT>-10.00<FITID>dup-1<NAME>Coffee</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

    const preflight = buildMigrationPreflight(parseImportFile('download.qfx', qfx));

    expect(preflight.source).toBe('quicken-qfx');
    expect(preflight.summary.sourceIdCount).toBe(2);
    expect(preflight.summary.duplicateSourceIdCount).toBe(1);
  });
});
