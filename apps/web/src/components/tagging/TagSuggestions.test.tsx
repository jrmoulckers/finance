// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the TagSuggestions component.
 *
 * References: issue #1473
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TagSuggestion } from '../../lib/tagging/tagging-types';
import { TagSuggestions } from './TagSuggestions';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockSuggestions: TagSuggestion[] = [
  { tag: 'Coffee', confidence: 0.95, reason: 'Based on 15 similar Starbucks transactions' },
  { tag: 'Daily', confidence: 0.6, reason: 'Based on 8 similar Starbucks transactions' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TagSuggestions', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when no suggestions', () => {
    const { container } = render(
      <TagSuggestions suggestions={[]} onAccept={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state', () => {
    render(<TagSuggestions suggestions={[]} onAccept={vi.fn()} onDismiss={vi.fn()} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Finding suggestions');
  });

  it('renders suggestion chips with confidence', () => {
    render(<TagSuggestions suggestions={mockSuggestions} onAccept={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText('Coffee')).toBeInTheDocument();
    expect(screen.getByText('(95%)')).toBeInTheDocument();
    expect(screen.getByText('Daily')).toBeInTheDocument();
    expect(screen.getByText('(60%)')).toBeInTheDocument();
  });

  it('calls onAccept when chip is clicked', () => {
    const onAccept = vi.fn();
    render(
      <TagSuggestions suggestions={mockSuggestions} onAccept={onAccept} onDismiss={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText(/accept tag: coffee/i));
    expect(onAccept).toHaveBeenCalledWith('Coffee');
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <TagSuggestions suggestions={mockSuggestions} onAccept={vi.fn()} onDismiss={onDismiss} />,
    );

    fireEvent.click(screen.getByLabelText(/dismiss suggestion: coffee/i));
    expect(onDismiss).toHaveBeenCalledWith('Coffee');
  });

  it('shows tooltip when "Why?" is clicked', () => {
    render(<TagSuggestions suggestions={mockSuggestions} onAccept={vi.fn()} onDismiss={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/why suggest coffee/i));
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Based on 15 similar Starbucks transactions',
    );
  });

  it('hides tooltip when "Why?" is clicked again', () => {
    render(<TagSuggestions suggestions={mockSuggestions} onAccept={vi.fn()} onDismiss={vi.fn()} />);

    const whyButton = screen.getByLabelText(/why suggest coffee/i);
    fireEvent.click(whyButton);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.click(whyButton);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('renders "Suggested tags:" label', () => {
    render(<TagSuggestions suggestions={mockSuggestions} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Suggested tags:')).toBeInTheDocument();
  });

  it('uses list semantics for chips', () => {
    render(<TagSuggestions suggestions={mockSuggestions} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('accept buttons have descriptive aria-labels', () => {
    render(<TagSuggestions suggestions={mockSuggestions} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByLabelText('Accept tag: Coffee (95% confidence)')).toBeInTheDocument();
  });
});
