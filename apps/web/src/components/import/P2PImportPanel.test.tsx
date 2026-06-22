// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildP2PImportPlan } from '../../lib/p2p-import';
import type { P2PImportPlan } from '../../lib/p2p-import-types';
import { P2PImportPanel, type P2PImportPanelProps } from './P2PImportPanel';

const VENMO_SPLIT_CSV = [
  'Datetime,Type,Status,Note,From,To,Amount (total),Amount (fee)',
  '2024-01-10T18:00:00,Payment,Complete,Pizza night,Me,Joes Pizza,- $60.00,',
  '2024-01-11T09:00:00,Payment,Complete,pizza,Alice,Me,+ $20.00,',
  '2024-01-11T09:05:00,Payment,Complete,pizza,Bob,Me,+ $20.00,',
].join('\n');

function buildPlan(): P2PImportPlan {
  return buildP2PImportPlan(VENMO_SPLIT_CSV);
}

function renderPanel(overrides: Partial<P2PImportPanelProps> = {}) {
  const props: P2PImportPanelProps = {
    fileName: 'venmo.csv',
    plan: buildPlan(),
    overrides: {},
    parseError: null,
    accounts: [
      { id: 'acc-1', name: 'Checking' },
      { id: 'acc-2', name: 'Savings' },
    ],
    selectedAccountId: null,
    importing: false,
    saveResult: null,
    onLoadFile: vi.fn(),
    onSetOverride: vi.fn(),
    onSelectAccount: vi.fn(),
    onConfirmImport: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<P2PImportPanel {...props} />) };
}

describe('P2PImportPanel', () => {
  it('renders the heading, intro, and a labeled file input', () => {
    renderPanel({ plan: null });
    expect(screen.getByRole('heading', { name: /venmo & cash app import/i })).toBeInTheDocument();
    expect(
      screen.getByLabelText(/choose a venmo or cash app csv file to import/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/import into account/i)).toBeInTheDocument();
  });

  it('announces the net spending summary in a live region', () => {
    renderPanel();
    const summary = screen.getByRole('group', { name: /import summary/i });
    expect(summary).toHaveAttribute('aria-live', 'polite');
    expect(within(summary).getByText(/net spending to import/i)).toBeInTheDocument();
    expect(within(summary).getByText(/reimbursements excluded/i)).toBeInTheDocument();
  });

  it('shows classification with text labels, not colour alone', () => {
    renderPanel();
    // The outflow is spending; the two inflows are reimbursements.
    expect(
      screen.getByText('Spending', { selector: '.p2p-import__class-label' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Reimbursement', { selector: '.p2p-import__class-label' }),
    ).toHaveLength(2);
  });

  it('renders a preview table with column headers', () => {
    renderPanel();
    expect(screen.getByRole('columnheader', { name: /date/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /classification/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /treat as/i })).toBeInTheDocument();
  });

  it('invokes onSetOverride when an override is changed', () => {
    const { props } = renderPanel();
    const selects = screen.getAllByRole('combobox');
    // selects[0] is the account selector; per-row override selects follow.
    fireEvent.change(selects[2], { target: { value: 'spending' } });
    expect(props.onSetOverride).toHaveBeenCalledWith(1, 'spending');
  });

  it('clears an override when set back to auto', () => {
    const { props } = renderPanel({ overrides: { 1: 'spending' } });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[2], { target: { value: '' } });
    expect(props.onSetOverride).toHaveBeenCalledWith(1, null);
  });

  it('invokes onSelectAccount when the destination account changes', () => {
    const { props } = renderPanel();
    fireEvent.change(screen.getByLabelText(/import into account/i), {
      target: { value: 'acc-2' },
    });
    expect(props.onSelectAccount).toHaveBeenCalledWith('acc-2');
  });

  it('disables import until a destination account is selected', () => {
    const { rerender, props } = renderPanel();
    const button = screen.getByRole('button', { name: /import \d+ net transaction/i });
    expect(button).toBeDisabled();

    rerender(<P2PImportPanel {...props} selectedAccountId="acc-1" />);
    const enabled = screen.getByRole('button', { name: /import \d+ net transaction/i });
    expect(enabled).toBeEnabled();
    fireEvent.click(enabled);
    expect(props.onConfirmImport).toHaveBeenCalled();
  });

  it('surfaces a parse error with role="alert"', () => {
    renderPanel({ plan: null, parseError: 'Unrecognized file' });
    expect(screen.getByRole('alert')).toHaveTextContent('Unrecognized file');
  });

  it('reports the save result in a status region', () => {
    renderPanel({ saveResult: { created: 1, excluded: 2, failed: 0 } });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/imported 1 net transaction/i);
    expect(status).toHaveTextContent(/2 reimbursement or transfer rows excluded/i);
  });

  it('lists skipped rows when the plan has parse errors', () => {
    const csv = ['date,description,counterparty,amount,type', ',bad,Someone,- $5.00,payment'].join(
      '\n',
    );
    renderPanel({ plan: buildP2PImportPlan(csv) });
    expect(screen.getByText(/skipped rows/i)).toBeInTheDocument();
  });
});
