// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDataImportWizard } from '../useDataImportWizard';

const mockCreateTransaction = vi.fn();

vi.mock('../useTransactions', () => ({
  useTransactions: () => ({
    transactions: [],
    createTransaction: mockCreateTransaction,
  }),
}));

const SAMPLE_CSV = `Date,Description,Amount,Category
2024-01-15,"Grocery, Store
Main",-45.67,Food
2024-01-16,Salary,2500.00,Income`;

const SAMPLE_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM><ACCTID>9876543210</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-45.67
<FITID>2024011501
<NAME>GROCERY STORE
<MEMO>Purchase at store
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

const SAMPLE_QFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
INTU.BID:12345
<OFX>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240116
<TRNAMT>2500.00
<FITID>QFX-1
<NAME>DIRECT DEPOSIT
</STMTTRN>
</OFX>`;

const SAMPLE_QIF = `!Type:Bank
D01/17/2024
T-12.34
PCoffee Shop
MMorning coffee
LFood:Coffee
^
D01/18/2024
T100.00
PRefund
^`;

function file(content: string, name: string): File {
  return new File([content], name, { type: 'text/plain' });
}

describe('useDataImportWizard upload parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTransaction.mockReturnValue({ id: 'created' });
  });

  it('parses robust CSV with quoted commas and newlines', async () => {
    const { result } = renderHook(() => useDataImportWizard());

    await act(async () => {
      await result.current.uploadFile(file(SAMPLE_CSV, 'transactions.csv'));
    });

    expect(result.current.step).toBe('mapping');
    expect(result.current.detectedFormat).toBe('wellsfargo');
    expect(result.current.csvRows).toHaveLength(2);
    expect(result.current.csvRows[0][1]).toBe('Grocery, Store\nMain');
    expect(result.current.columnMappings.some((m) => m.mappedField === 'amount')).toBe(true);
  });

  it('parses OFX transactions into the wizard preview flow', async () => {
    const { result } = renderHook(() => useDataImportWizard());

    await act(async () => {
      await result.current.uploadFile(file(SAMPLE_OFX, 'checking.ofx'));
      result.current.setSelectedAccountId('account-1');
      result.current.setSelectedHouseholdId('household-1');
    });

    act(() => result.current.goToPreview());

    await waitFor(() => expect(result.current.step).toBe('preview'));
    expect(result.current.detectedFormat).toBe('ofx');
    expect(result.current.previewRows[0].parsed).toMatchObject({
      date: '2024-01-15',
      payee: 'GROCERY STORE',
      amountCents: -4567,
      note: 'Purchase at store',
    });
    expect(result.current.previewRows[0].values.externalReferenceId).toBe('2024011501');
  });

  it('uses the OFX parser for QFX files', async () => {
    const { result } = renderHook(() => useDataImportWizard());

    await act(async () => {
      await result.current.uploadFile(file(SAMPLE_QFX, 'quicken.qfx'));
    });

    expect(result.current.detectedFormat).toBe('qfx');
    expect(result.current.csvRows[0]).toContain('DIRECT DEPOSIT');
    expect(result.current.csvRows[0]).toContain('QFX-1');
  });

  it('parses QIF line-based records with optional missing fields', async () => {
    const { result } = renderHook(() => useDataImportWizard());

    await act(async () => {
      await result.current.uploadFile(file(SAMPLE_QIF, 'quicken.qif'));
    });

    expect(result.current.detectedFormat).toBe('qif');
    expect(result.current.csvRows).toHaveLength(2);
    expect(result.current.csvRows[0]).toEqual([
      '2024-01-17',
      'Coffee Shop',
      '-12.34',
      'Food',
      'Morning coffee',
      'BANK',
      '',
      '',
    ]);
    expect(result.current.csvRows[1][4]).toBe('');
  });

  it('commits parsed preview rows through createTransaction', async () => {
    const { result } = renderHook(() => useDataImportWizard());

    await act(async () => {
      await result.current.uploadFile(file(SAMPLE_OFX, 'checking.ofx'));
      result.current.setSelectedAccountId('account-1');
      result.current.setSelectedHouseholdId('household-1');
    });
    act(() => result.current.goToPreview());

    await act(async () => {
      await result.current.startImport();
    });

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        householdId: 'household-1',
        payee: 'GROCERY STORE',
        amount: { amount: 4567 },
        type: 'EXPENSE',
        externalReferenceId: '2024011501',
      }),
    );
    expect(result.current.result?.imported).toBe(1);
  });

  it('surfaces malformed OFX records as clear errors', async () => {
    const { result } = renderHook(() => useDataImportWizard());

    await act(async () => {
      await result.current.uploadFile(
        file('<OFX><STMTTRN><TRNAMT>-1.00</STMTTRN></OFX>', 'bad.ofx'),
      );
    });

    expect(result.current.step).toBe('upload');
    expect(result.current.error).toMatch(/No transactions were found|Missing DTPOSTED/);
  });
});
