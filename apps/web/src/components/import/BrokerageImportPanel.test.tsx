// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrokerageImportPanel } from './BrokerageImportPanel';

const FIDELITY_CSV = [
  'Run Date,Action,Symbol,Quantity,Price ($),Commission ($),Amount ($)',
  '01/03/2024,YOU BOUGHT,AAPL,10,150.00,4.95,-1504.95',
  '02/14/2024,YOU BOUGHT,AAPL,5,160.00,4.95,-804.95',
].join('\n');

/** Drive the paste → confirm-mapping flow for a single broker export. */
function addExport(broker: string, csv: string): void {
  fireEvent.change(screen.getByLabelText(/broker name/i), { target: { value: broker } });
  fireEvent.change(screen.getByLabelText(/paste csv text/i), { target: { value: csv } });
  fireEvent.click(screen.getByRole('button', { name: /add pasted csv/i }));
  fireEvent.click(screen.getByRole('button', { name: /confirm .* add export/i }));
}

describe('BrokerageImportPanel', () => {
  it('renders the heading and accessible inputs', () => {
    render(<BrokerageImportPanel />);
    expect(
      screen.getByRole('heading', { name: /brokerage trade import & reconciliation/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/broker name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/paste csv text/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/choose a broker trade-confirmation csv file to import/i),
    ).toBeInTheDocument();
  });

  it('requires a broker name before loading a paste', () => {
    render(<BrokerageImportPanel />);
    fireEvent.change(screen.getByLabelText(/paste csv text/i), {
      target: { value: FIDELITY_CSV },
    });
    fireEvent.click(screen.getByRole('button', { name: /add pasted csv/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/broker name/i);
  });

  it('shows a column-mapping confirmation with auto-detected fields', () => {
    render(<BrokerageImportPanel />);
    fireEvent.change(screen.getByLabelText(/broker name/i), { target: { value: 'Fidelity' } });
    fireEvent.change(screen.getByLabelText(/paste csv text/i), {
      target: { value: FIDELITY_CSV },
    });
    fireEvent.click(screen.getByRole('button', { name: /add pasted csv/i }));

    // Auto-detected required mappings are pre-selected.
    expect(screen.getByRole('combobox', { name: /trade date/i })).toHaveValue('Run Date');
    expect(screen.getByRole('combobox', { name: /symbol/i })).toHaveValue('Symbol');
    expect(screen.getByRole('combobox', { name: /price per share/i })).toHaveValue('Price ($)');
  });

  it('reconciles a confirmed export into a unified holdings summary', () => {
    render(<BrokerageImportPanel />);
    addExport('Fidelity', FIDELITY_CSV);

    expect(screen.getByRole('group', { name: /reconciliation summary/i })).toBeInTheDocument();

    const holdingsTable = screen.getByRole('table', {
      name: /unified holdings reconciled across all added brokers/i,
    });
    const aaplRow = within(holdingsTable).getByRole('row', { name: /AAPL/i });
    // 10 + 5 shares, cost basis 230990 cents = $2,309.90
    expect(within(aaplRow).getByText('15')).toBeInTheDocument();
    expect(within(aaplRow).getByText('$2,309.90')).toBeInTheDocument();
  });

  it('pools the same symbol across two brokers and flags cross-broker duplicates', () => {
    render(<BrokerageImportPanel />);
    const csv = 'Date,Action,Symbol,Quantity,Price\n2024-01-01,Buy,AAPL,10,150.00';
    addExport('Fidelity', csv);
    addExport('Schwab', csv);

    const summary = screen.getByRole('group', { name: /reconciliation summary/i });
    expect(summary).toHaveTextContent(/2 brokers/i);
    expect(summary).toHaveTextContent(/Fidelity, Schwab/);

    // Identical trade across two brokers should surface a reconciliation finding.
    expect(screen.getByRole('heading', { name: /reconciliation findings/i })).toBeInTheDocument();
  });

  it('clears all state on start over', () => {
    render(<BrokerageImportPanel />);
    addExport('Fidelity', FIDELITY_CSV);
    expect(screen.getByRole('group', { name: /reconciliation summary/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start over/i }));
    expect(
      screen.queryByRole('group', { name: /reconciliation summary/i }),
    ).not.toBeInTheDocument();
  });
});
