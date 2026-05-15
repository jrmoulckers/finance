// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CsvImportWizard } from './CsvImportWizard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCsvFile(content: string, name = 'test.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CsvImportWizard', () => {
  it('renders the upload step initially', () => {
    render(<CsvImportWizard onImport={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('Import Transactions')).toBeInTheDocument();
    expect(screen.getByText(/Step 1: Upload CSV file/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload csv file/i })).toBeInTheDocument();
  });

  it('renders the cancel button on upload step', () => {
    const onCancel = vi.fn();
    render(<CsvImportWizard onImport={vi.fn()} onCancel={onCancel} />);

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('processes a CSV file and moves to mapping step', async () => {
    render(<CsvImportWizard onImport={vi.fn()} onCancel={vi.fn()} />);

    const csv = 'Date,Description,Amount\n2024-01-15,Coffee,-4.50';
    const file = createCsvFile(csv);

    const input = screen.getByLabelText('Choose CSV file');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Step 2: Map columns/)).toBeInTheDocument();
    });

    // Should show column mapping selects
    expect(screen.getByLabelText(/Date/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/)).toBeInTheDocument();
  });

  it('auto-detects column mapping from headers', async () => {
    render(<CsvImportWizard onImport={vi.fn()} onCancel={vi.fn()} />);

    const csv = 'Date,Description,Amount\n2024-01-15,Coffee,-4.50';
    const file = createCsvFile(csv);

    const input = screen.getByLabelText('Choose CSV file');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Step 2: Map columns/)).toBeInTheDocument();
    });

    // The Date select should have auto-selected the Date column (index 0)
    const dateSelect = screen.getByLabelText(/Date/) as HTMLSelectElement;
    expect(dateSelect.value).toBe('0');
  });

  it('navigates back from mapping to upload', async () => {
    render(<CsvImportWizard onImport={vi.fn()} onCancel={vi.fn()} />);

    const csv = 'Date,Description,Amount\n2024-01-15,Coffee,-4.50';
    const file = createCsvFile(csv);

    const input = screen.getByLabelText('Choose CSV file');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Step 2/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText(/Step 1/)).toBeInTheDocument();
  });

  it('shows duplicate warning on confirm step', async () => {
    render(<CsvImportWizard onImport={vi.fn()} onCancel={vi.fn()} duplicateCount={3} />);

    const csv = 'Date,Description,Amount\n2024-01-15,Coffee,-4.50';
    const file = createCsvFile(csv);

    const input = screen.getByLabelText('Choose CSV file');
    fireEvent.change(input, { target: { files: [file] } });

    // Move through steps
    await waitFor(() => {
      expect(screen.getByText(/Step 2/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText(/Step 3/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText(/Step 4/)).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      /3 potential duplicate transactions detected/,
    );
  });

  it('has accessible navigation landmark', () => {
    render(<CsvImportWizard onImport={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'CSV Import Wizard' })).toBeInTheDocument();
  });

  it('uses aria-live for step announcements', () => {
    render(<CsvImportWizard onImport={vi.fn()} onCancel={vi.fn()} />);

    const stepInfo = screen.getByText(/Step 1/);
    expect(stepInfo).toHaveAttribute('aria-live', 'polite');
  });
});
