// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for invoice pipeline and forecast utilities.
 *
 * References: issue #2169
 */

import { describe, expect, it } from 'vitest';
import {
  computeExpectedPayDate,
  computeInvoiceForecast,
  exportInvoicesCsv,
  getEffectiveInvoiceStatus,
  groupInvoicesByStatus,
  INVOICE_CSV_HEADER,
  type Invoice,
} from './invoices';

function makeInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: overrides.id ?? 'inv-1',
    clientName: overrides.clientName ?? 'Acme Studio',
    amountCents: overrides.amountCents ?? 100000,
    issueDate: overrides.issueDate ?? '2024-01-01',
    paymentTerm: overrides.paymentTerm ?? 'net-30',
    status: overrides.status ?? 'Sent',
    expectedPayDate: overrides.expectedPayDate ?? '2024-01-31',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

describe('computeExpectedPayDate', () => {
  it('adds net terms to the issue date', () => {
    expect(computeExpectedPayDate('2024-01-10', 'net-30')).toBe('2024-02-09');
    expect(computeExpectedPayDate('2024-01-10', 'net-60')).toBe('2024-03-10');
  });

  it('supports due-on-receipt and leap-year boundaries', () => {
    expect(computeExpectedPayDate('2024-02-29', 'due-on-receipt')).toBe('2024-02-29');
    expect(computeExpectedPayDate('2024-02-29', 'net-15')).toBe('2024-03-15');
  });
});

describe('getEffectiveInvoiceStatus', () => {
  it('auto-marks sent invoices overdue after expected pay date passes', () => {
    const invoice = makeInvoice({ status: 'Sent', expectedPayDate: '2024-01-31' });

    expect(getEffectiveInvoiceStatus(invoice, '2024-02-01')).toBe('Overdue');
  });

  it('does not mark draft or paid invoices overdue', () => {
    expect(
      getEffectiveInvoiceStatus(
        makeInvoice({ status: 'Draft', expectedPayDate: '2024-01-31' }),
        '2024-02-01',
      ),
    ).toBe('Draft');
    expect(
      getEffectiveInvoiceStatus(
        makeInvoice({ status: 'Paid', expectedPayDate: '2024-01-31' }),
        '2024-02-01',
      ),
    ).toBe('Paid');
  });
});

describe('groupInvoicesByStatus', () => {
  it('groups by effective status and totals each pipeline lane', () => {
    const groups = groupInvoicesByStatus(
      [
        makeInvoice({ id: 'draft', status: 'Draft', amountCents: 10000 }),
        makeInvoice({
          id: 'sent',
          status: 'Sent',
          amountCents: 20000,
          expectedPayDate: '2024-02-15',
        }),
        makeInvoice({
          id: 'late',
          status: 'Sent',
          amountCents: 30000,
          expectedPayDate: '2024-01-15',
        }),
      ],
      '2024-02-01',
    );

    expect(groups.find((group) => group.status === 'Draft')?.totalCents).toBe(10000);
    expect(groups.find((group) => group.status === 'Sent')?.totalCents).toBe(20000);
    expect(groups.find((group) => group.status === 'Overdue')?.totalCents).toBe(30000);
  });
});

describe('computeInvoiceForecast', () => {
  it('buckets outstanding invoices by expected pay date', () => {
    const forecast = computeInvoiceForecast(
      [
        makeInvoice({ id: 'past', amountCents: 10000, expectedPayDate: '2023-12-31' }),
        makeInvoice({ id: 'next30', amountCents: 20000, expectedPayDate: '2024-01-31' }),
        makeInvoice({ id: 'days60', amountCents: 30000, expectedPayDate: '2024-03-01' }),
        makeInvoice({ id: 'days90', amountCents: 40000, expectedPayDate: '2024-03-31' }),
        makeInvoice({ id: 'later', amountCents: 50000, expectedPayDate: '2024-04-01' }),
        makeInvoice({
          id: 'paid',
          status: 'Paid',
          amountCents: 60000,
          expectedPayDate: '2024-01-20',
        }),
        makeInvoice({
          id: 'draft',
          status: 'Draft',
          amountCents: 70000,
          expectedPayDate: '2024-01-20',
        }),
      ],
      '2024-01-01',
    );

    expect(forecast.find((bucket) => bucket.id === 'past-due')?.totalCents).toBe(10000);
    expect(forecast.find((bucket) => bucket.id === 'next-30')?.totalCents).toBe(20000);
    expect(forecast.find((bucket) => bucket.id === 'days-31-60')?.totalCents).toBe(30000);
    expect(forecast.find((bucket) => bucket.id === 'days-61-90')?.totalCents).toBe(40000);
    expect(forecast.find((bucket) => bucket.id === 'days-90-plus')?.totalCents).toBe(50000);
  });
});

describe('exportInvoicesCsv', () => {
  it('emits a header, one sorted row per invoice with status/bucket, and a totals row', () => {
    const csv = exportInvoicesCsv(
      [
        makeInvoice({
          id: 'a',
          clientName: 'Acme Studio',
          amountCents: 100000,
          status: 'Sent',
          expectedPayDate: '2024-01-31',
        }),
        makeInvoice({
          id: 'b',
          clientName: 'Beta Co',
          amountCents: 50000,
          status: 'Sent',
          expectedPayDate: '2024-01-10',
        }),
        makeInvoice({
          id: 'c',
          clientName: 'Ceta LLC',
          amountCents: 30000,
          status: 'Paid',
          expectedPayDate: '2024-01-05',
        }),
      ],
      '2024-01-15',
    );
    const lines = csv.split('\n');

    expect(lines[0]).toBe(INVOICE_CSV_HEADER);
    // Sorted by expected pay date: Ceta (paid, no bucket), Beta (overdue), Acme.
    expect(lines[1]).toBe('Ceta LLC,300.00,2024-01-01,Net-30,Paid,2024-01-05,');
    expect(lines[2]).toBe('Beta Co,500.00,2024-01-01,Net-30,Overdue,2024-01-10,Past due');
    expect(lines[3]).toBe('Acme Studio,1000.00,2024-01-01,Net-30,Sent,2024-01-31,Next 30 days');
    expect(lines[lines.length - 1]).toBe('Total,1800.00,,,,,');
  });

  it('quotes client names that contain commas', () => {
    const csv = exportInvoicesCsv(
      [makeInvoice({ id: 'a', clientName: 'Ramirez, Diego', amountCents: 20000 })],
      '2024-01-01',
    );

    expect(csv).toContain('"Ramirez, Diego",200.00,');
  });

  it('returns the header and a zero totals row for an empty pipeline', () => {
    expect(exportInvoicesCsv([], '2024-01-15').split('\n')).toEqual([
      INVOICE_CSV_HEADER,
      'Total,0.00,,,,,',
    ]);
  });
});
