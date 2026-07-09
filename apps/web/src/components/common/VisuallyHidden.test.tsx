// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VisuallyHidden } from './VisuallyHidden';

describe('VisuallyHidden', () => {
  it('renders children inside a span by default with the sr-only class', () => {
    render(<VisuallyHidden>Delete transaction</VisuallyHidden>);

    const el = screen.getByText('Delete transaction');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveClass('sr-only');
    expect(el).not.toHaveClass('sr-only-focusable');
  });

  it('renders as the element supplied via the `as` prop', () => {
    render(
      <VisuallyHidden as="div" data-testid="region" aria-live="polite">
        Saved
      </VisuallyHidden>,
    );

    const el = screen.getByTestId('region');
    expect(el.tagName).toBe('DIV');
    expect(el).toHaveAttribute('aria-live', 'polite');
    expect(el).toHaveTextContent('Saved');
  });

  it('adds the focusable modifier when `focusable` is set', () => {
    render(
      <VisuallyHidden as="a" href="#main" focusable>
        Skip to content
      </VisuallyHidden>,
    );

    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveClass('sr-only');
    expect(link).toHaveClass('sr-only-focusable');
    expect(link).toHaveAttribute('href', '#main');
  });

  it('merges a caller-supplied className', () => {
    render(<VisuallyHidden className="extra">Hidden</VisuallyHidden>);

    const el = screen.getByText('Hidden');
    expect(el).toHaveClass('sr-only');
    expect(el).toHaveClass('extra');
  });
});
