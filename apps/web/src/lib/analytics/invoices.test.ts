// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for invoice pipeline and forecast utilities.
 *
 * References: issue #2169
 */

import { describe, expect, it } from 'vitest';
import {
  applyInvoiceEdit,
  computeExpectedPayDate,
  computeInvoiceForecast,
  exportInvoicesCsv,
  FOLLOW_UP_STALE_DAYS,
  getEffectiveInvoiceStatus,
  getInvoicesNeedingFollowUp,
  groupInvoicesByStatus,
  INVOICE_CSV_HEADER,
  invoiceNeedsFollowUp,
  recordInvoiceContact,
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
    lastContactedDate: overrides.lastContactedDate,
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

describe('applyInvoiceEdit', () => {
  it('recomputes the expected pay date from the edited issue date and term', () => {
    const invoice = makeInvoice({ issueDate: '2024-01-01', paymentTerm: 'net-30' });

    const updated = applyInvoiceEdit(
      invoice,
      {
        clientName: 'Acme Studio',
        amountCents: 100000,
        issueDate: '2024-03-01',
        paymentTerm: 'net-15',
        status: 'Sent',
      },
      '2024-03-01T12:00:00Z',
    );

    expect(updated.expectedPayDate).toBe('2024-03-16');
  });

  it('preserves id and createdAt while bumping updatedAt and editable fields', () => {
    const invoice = makeInvoice({ id: 'inv-42', clientName: 'Old Name', amountCents: 50000 });

    const updated = applyInvoiceEdit(
      invoice,
      {
        clientName: '  New Studio  ',
        amountCents: 275000,
        issueDate: '2024-02-10',
        paymentTerm: 'net-45',
        status: 'Sent',
      },
      '2024-02-10T09:30:00Z',
    );

    expect(updated.id).toBe('inv-42');
    expect(updated.createdAt).toBe('2024-01-01T00:00:00Z');
    expect(updated.updatedAt).toBe('2024-02-10T09:30:00Z');
    expect(updated.clientName).toBe('New Studio');
    expect(updated.amountCents).toBe(275000);
    expect(updated.paymentTerm).toBe('net-45');
  });

  it('derives the effective overdue status when the edited term is already past due', () => {
    const invoice = makeInvoice({ status: 'Sent' });

    const updated = applyInvoiceEdit(
      invoice,
      {
        clientName: 'Acme Studio',
        amountCents: 100000,
        issueDate: '2024-01-01',
        paymentTerm: 'net-15',
        status: 'Sent',
      },
      '2024-06-01T00:00:00Z',
    );

    expect(updated.status).toBe('Overdue');
  });
});

describe('invoiceNeedsFollowUp', () => {
  it('flags an overdue invoice that has never been contacted', () => {
    const invoice = makeInvoice({ status: 'Sent', expectedPayDate: '2024-01-31' });
    expect(invoiceNeedsFollowUp(invoice, '2024-02-15')).toBe(true);
  });

  it('does not flag an invoice that is not yet overdue', () => {
    const invoice = makeInvoice({ status: 'Sent', expectedPayDate: '2024-02-28' });
    expect(invoiceNeedsFollowUp(invoice, '2024-02-15')).toBe(false);
  });

  it('does not flag a paid invoice', () => {
    const invoice = makeInvoice({ status: 'Paid', expectedPayDate: '2024-01-31' });
    expect(invoiceNeedsFollowUp(invoice, '2024-02-15')).toBe(false);
  });

  it('does not flag an overdue invoice contacted within the stale window', () => {
    const invoice = makeInvoice({
      status: 'Sent',
      expectedPayDate: '2024-01-31',
      lastContactedDate: '2024-02-14',
    });
    expect(invoiceNeedsFollowUp(invoice, '2024-02-15')).toBe(false);
  });

  it('flags an overdue invoice last contacted at least the stale window ago', () => {
    const contacted = makeInvoice({
      status: 'Sent',
      expectedPayDate: '2024-01-31',
      lastContactedDate: '2024-02-01',
    });
    expect(getEffectiveInvoiceStatus(contacted, '2024-02-15')).toBe('Overdue');
    expect(FOLLOW_UP_STALE_DAYS).toBe(7);
    expect(invoiceNeedsFollowUp(contacted, '2024-02-15')).toBe(true);
  });
});

describe('getInvoicesNeedingFollowUp', () => {
  it('returns only overdue invoices needing follow-up, oldest expected pay date first', () => {
    const oldest = makeInvoice({ id: 'a', expectedPayDate: '2024-01-15', status: 'Sent' });
    const newer = makeInvoice({ id: 'b', expectedPayDate: '2024-01-31', status: 'Sent' });
    const paid = makeInvoice({ id: 'c', expectedPayDate: '2024-01-10', status: 'Paid' });
    const recentlyContacted = makeInvoice({
      id: 'd',
      expectedPayDate: '2024-01-20',
      status: 'Sent',
      lastContactedDate: '2024-02-15',
    });

    const result = getInvoicesNeedingFollowUp(
      [newer, paid, recentlyContacted, oldest],
      '2024-02-16',
    );

    expect(result.map((invoice) => invoice.id)).toEqual(['a', 'b']);
  });
});

describe('recordInvoiceContact', () => {
  it('records the contact date and bumps updatedAt without mutating the original', () => {
    const invoice = makeInvoice({ id: 'inv-9' });
    const updated = recordInvoiceContact(invoice, '2024-02-15', '2024-02-15T09:30:00Z');

    expect(updated.lastContactedDate).toBe('2024-02-15');
    expect(updated.updatedAt).toBe('2024-02-15T09:30:00Z');
    expect(updated.id).toBe('inv-9');
    expect(invoice.lastContactedDate).toBeUndefined();
  });
});
