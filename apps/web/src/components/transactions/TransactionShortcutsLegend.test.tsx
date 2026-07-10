// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for TransactionShortcutsLegend.
 * References: issue #3654
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { TransactionShortcutsLegend } from './TransactionShortcutsLegend';

describe('TransactionShortcutsLegend', () => {
  it('is collapsed by default with an accessible trigger', () => {
    render(<TransactionShortcutsLegend />);
    const trigger = screen.getByRole('button', {
      name: /keyboard shortcuts for the transaction list/i,
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the legend and lists the transaction-list shortcuts', () => {
    render(<TransactionShortcutsLegend />);
    fireEvent.click(
      screen.getByRole('button', { name: /keyboard shortcuts for the transaction list/i }),
    );
    const dialog = screen.getByRole('dialog', { name: /transaction list keyboard shortcuts/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Next item')).toBeInTheDocument();
    expect(screen.getByText('Select all visible items')).toBeInTheDocument();
    expect(screen.getByText('Edit active item')).toBeInTheDocument();
  });

  it('closes on Escape and restores focus to the trigger', () => {
    render(<TransactionShortcutsLegend />);
    const trigger = screen.getByRole('button', {
      name: /keyboard shortcuts for the transaction list/i,
    });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
