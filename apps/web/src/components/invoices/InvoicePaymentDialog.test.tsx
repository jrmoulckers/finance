// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for InvoicePaymentDialog.
 *
 * References: issue #3224
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MoneyDisplayProvider } from '../../lib/display-settings';
import type { Invoice } from '../../lib/analytics/invoices';
import { InvoicePaymentDialog } from './InvoicePaymentDialog';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    clientName: 'Acme Studio',
    amountCents: 400000,
    issueDate: '2024-01-01',
    paymentTerm: 'net-30',
    status: 'Sent',
    expectedPayDate: '2024-01-31',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    amountPaidCents: 100000,
    ...overrides,
  };
}

function renderDialog(props: Partial<ComponentProps<typeof InvoicePaymentDialog>> = {}) {
  const onSubmit = vi.fn<NonNullable<ComponentProps<typeof InvoicePaymentDialog>['onSubmit']>>();
  const onCancel = vi.fn();

  render(
    <MoneyDisplayProvider>
      <InvoicePaymentDialog
        isOpen
        invoice={makeInvoice()}
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...props}
      />
    </MoneyDisplayProvider>,
  );

  return { onSubmit, onCancel };
}

describe('InvoicePaymentDialog', () => {
  it('records a valid partial payment with the entered date', () => {
    const { onSubmit, onCancel } = renderDialog();

    expect(
      screen.getByRole('dialog', { name: 'Record payment for Acme Studio' }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '1500.00' } });
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2024-02-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));

    expect(onSubmit).toHaveBeenCalledWith(150000, '2024-02-15');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('rejects a non-positive amount', () => {
    const { onSubmit } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a payment amount greater than zero.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a payment larger than the outstanding balance', () => {
    const { onSubmit } = renderDialog();

    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '4000.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Payment cannot exceed the outstanding balance.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('closes on Cancel', () => {
    const { onCancel } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
