// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TagList } from './TagList';

describe('TagList', () => {
  it('renders nothing when tags array is empty', () => {
    const { container } = render(<TagList tags={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all tags when count is within maxVisible', () => {
    render(<TagList tags={['food', 'travel', 'bills']} maxVisible={5} />);
    expect(screen.getByText('food')).toBeInTheDocument();
    expect(screen.getByText('travel')).toBeInTheDocument();
    expect(screen.getByText('bills')).toBeInTheDocument();
  });

  it('shows overflow chip when tags exceed maxVisible', () => {
    render(<TagList tags={['a', 'b', 'c', 'd', 'e']} maxVisible={2} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.queryByText('c')).not.toBeInTheDocument();
    expect(screen.getByText('+3 more')).toBeInTheDocument();
  });

  it('expands to show all tags when overflow chip is clicked', () => {
    render(<TagList tags={['a', 'b', 'c', 'd']} maxVisible={2} />);
    fireEvent.click(screen.getByText('+2 more'));
    expect(screen.getByText('c')).toBeInTheDocument();
    expect(screen.getByText('d')).toBeInTheDocument();
    expect(screen.queryByText('+2 more')).not.toBeInTheDocument();
  });

  it('has accessible list role', () => {
    render(<TagList tags={['test']} />);
    expect(screen.getByRole('list', { name: 'Tags' })).toBeInTheDocument();
  });

  it('calls onTagClick when a tag is clicked', () => {
    const onTagClick = vi.fn();
    render(<TagList tags={['clickable']} onTagClick={onTagClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by tag clickable' }));
    expect(onTagClick).toHaveBeenCalledWith('clickable');
  });

  it('calls onRemove when tag remove button is clicked', () => {
    const onRemove = vi.fn();
    render(<TagList tags={['removable']} removable onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText('Remove tag removable'));
    expect(onRemove).toHaveBeenCalledWith('removable');
  });
});
