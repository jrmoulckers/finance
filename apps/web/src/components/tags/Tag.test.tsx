// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Tag } from './Tag';

describe('Tag', () => {
  it('renders the tag name', () => {
    render(<Tag name="groceries" />);
    expect(screen.getByText('groceries')).toBeInTheDocument();
  });

  it('renders subtag with separator', () => {
    const { container } = render(<Tag name="travel:flights" />);
    const label = container.querySelector('.tag__label');
    expect(label).toBeInTheDocument();
    expect(label?.textContent).toContain('travel');
    expect(label?.textContent).toContain('flights');
    expect(label?.textContent).toContain('›');
  });

  it('shows remove button when removable', () => {
    const onRemove = vi.fn();
    render(<Tag name="test" removable onRemove={onRemove} />);
    const removeBtn = screen.getByLabelText('Remove tag test');
    expect(removeBtn).toBeInTheDocument();
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('test');
  });

  it('does not show remove button when not removable', () => {
    render(<Tag name="test" />);
    expect(screen.queryByLabelText('Remove tag test')).not.toBeInTheDocument();
  });

  it('renders as a button when onClick is provided', () => {
    const onClick = vi.fn();
    render(<Tag name="filter-me" onClick={onClick} />);
    const btn = screen.getByRole('button', { name: 'Filter by tag filter-me' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledWith('filter-me');
  });

  it('renders as a span with listitem role when not clickable', () => {
    render(<Tag name="static" />);
    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });

  it('applies size class', () => {
    const { container } = render(<Tag name="small" size="sm" />);
    expect(container.querySelector('.tag--sm')).toBeInTheDocument();
  });

  it('renders optional icon prefix', () => {
    render(<Tag name="travel" icon="✈️" />);
    expect(screen.getByText('✈️')).toBeInTheDocument();
  });
});
