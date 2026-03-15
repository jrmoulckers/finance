// SPDX-License-Identifier: BUSL-1.1

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataExport } from './DataExport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub URL.createObjectURL / revokeObjectURL since jsdom doesn't provide them. */
beforeEach(() => {
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DataExport', () => {
  // -- Render ---------------------------------------------------------------

  it('renders both export format buttons', () => {
    render(<DataExport />);
    expect(screen.getByRole('button', { name: /export as json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export as csv/i })).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<DataExport />);
    expect(screen.getByText(/download your financial data/i)).toBeInTheDocument();
  });

  // -- Accessibility --------------------------------------------------------

  it('export buttons are keyboard focusable', () => {
    render(<DataExport />);
    const jsonBtn = screen.getByRole('button', { name: /export as json/i });
    const csvBtn = screen.getByRole('button', { name: /export as csv/i });

    // Buttons are natively focusable; verify they are not tabindex=-1
    expect(jsonBtn).not.toHaveAttribute('tabindex', '-1');
    expect(csvBtn).not.toHaveAttribute('tabindex', '-1');
  });

  it('buttons have type="button" (not submit)', () => {
    render(<DataExport />);
    const jsonBtn = screen.getByRole('button', { name: /export as json/i });
    const csvBtn = screen.getByRole('button', { name: /export as csv/i });

    expect(jsonBtn).toHaveAttribute('type', 'button');
    expect(csvBtn).toHaveAttribute('type', 'button');
  });

  it('buttons are grouped with role="group"', () => {
    render(<DataExport />);
    const group = screen.getByRole('group');
    expect(group).toBeInTheDocument();

    // Both buttons live inside the group
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });

  // -- Export flow -----------------------------------------------------------

  it('shows progress state when exporting', async () => {
    const user = userEvent.setup();
    render(<DataExport />);

    const jsonBtn = screen.getByRole('button', { name: /export as json/i });
    await user.click(jsonBtn);

    // Progress indicator should appear
    expect(screen.getByRole('status', { name: /export in progress/i })).toBeInTheDocument();
  });

  it('disables buttons during export', async () => {
    const user = userEvent.setup();
    render(<DataExport />);

    await user.click(screen.getByRole('button', { name: /export as json/i }));

    // Both buttons should be disabled while exporting
    const buttons = screen.getAllByRole('button');
    const exportButtons = buttons.filter(
      (b) =>
        b.textContent?.includes('JSON') ||
        b.textContent?.includes('CSV') ||
        b.textContent?.includes('Exporting'),
    );
    exportButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it('shows success message after export completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DataExport />);

    await user.click(screen.getByRole('button', { name: /export as json/i }));

    // Advance past the simulated delay (400ms)
    await vi.advanceTimersByTimeAsync(500);

    expect(screen.getByText(/export complete/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  // -- Custom class ---------------------------------------------------------

  it('applies custom className', () => {
    const { container } = render(<DataExport className="my-custom" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('my-custom');
    expect(wrapper?.className).toContain('data-export');
  });
});
