// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VisuallyHidden } from './VisuallyHidden';

describe('VisuallyHidden', () => {
  it('renders children inside a span by default with the sr-only class', () => {
    render(<VisuallyHidden>Loading transactions</VisuallyHidden>);

    const el = screen.getByText('Loading transactions');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveClass('sr-only');
  });

  it('renders a custom element via the polymorphic `as` prop', () => {
    render(
      <VisuallyHidden as="h2" data-testid="vh-heading">
        Confirm deletion
      </VisuallyHidden>,
    );

    const el = screen.getByTestId('vh-heading');
    expect(el.tagName).toBe('H2');
    expect(el).toHaveTextContent('Confirm deletion');
  });

  it('forwards arbitrary props (id, role, aria-live) to the element', () => {
    render(
      <VisuallyHidden id="announcer" role="status" aria-live="polite">
        Saved
      </VisuallyHidden>,
    );

    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('id', 'announcer');
    expect(el).toHaveAttribute('aria-live', 'polite');
    expect(el).toHaveTextContent('Saved');
  });

  it('appends additional class names after sr-only', () => {
    render(<VisuallyHidden className="extra">Text</VisuallyHidden>);

    const el = screen.getByText('Text');
    expect(el).toHaveClass('sr-only');
    expect(el).toHaveClass('extra');
  });
});
