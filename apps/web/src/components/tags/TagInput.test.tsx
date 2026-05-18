// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TagInput } from './TagInput';

describe('TagInput', () => {
  const defaultProps = {
    value: [] as string[],
    onChange: vi.fn(),
    suggestions: ['food', 'travel', 'bills', 'shopping', 'travel:flights'],
  };

  it('renders with a combobox role input', () => {
    render(<TagInput {...defaultProps} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows placeholder when no tags are selected', () => {
    render(<TagInput {...defaultProps} placeholder="Add tags…" />);
    expect(screen.getByPlaceholderText('Add tags…')).toBeInTheDocument();
  });

  it('renders selected tags as chips', () => {
    render(<TagInput {...defaultProps} value={['food', 'travel']} />);
    expect(screen.getByText('food')).toBeInTheDocument();
    expect(screen.getByText('travel')).toBeInTheDocument();
  });

  it('filters suggestions based on typed text', () => {
    render(<TagInput {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'tra' } });
    expect(screen.getByText('travel')).toBeInTheDocument();
    expect(screen.getByText('travel:flights')).toBeInTheDocument();
    expect(screen.queryByText('food')).not.toBeInTheDocument();
  });

  it('shows "Create new" option when typed text has no exact match', () => {
    render(<TagInput {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'newt' } });
    expect(screen.getByText(/Create/)).toBeInTheDocument();
    expect(screen.getByText(/newt/)).toBeInTheDocument();
  });

  it('does not show "Create new" when exact match exists', () => {
    render(<TagInput {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'food' } });
    expect(screen.queryByText(/Create/)).not.toBeInTheDocument();
  });

  it('adds a tag on Enter key', () => {
    const onChange = vi.fn();
    render(<TagInput {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'new-tag' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['new-tag']);
  });

  it('removes last tag on Backspace when input is empty', () => {
    const onChange = vi.fn();
    render(<TagInput {...defaultProps} value={['food', 'travel']} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledWith(['food']);
  });

  it('sets aria-expanded to false on Escape', () => {
    render(<TagInput {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'food' } });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('removes a selected tag via remove button', () => {
    const onChange = vi.fn();
    render(<TagInput {...defaultProps} value={['food']} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Remove tag food'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('excludes already-selected tags from suggestions', () => {
    render(<TagInput {...defaultProps} value={['food']} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    // food should not appear in dropdown since it's already selected
    const options = screen.getAllByRole('option');
    const optionTexts = options.map((o) => o.textContent);
    expect(optionTexts).not.toContain('food');
  });
});
