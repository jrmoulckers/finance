// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('supports a keyboard-focusable link and does not forward focusable to the DOM', async () => {
    render(
      <VisuallyHidden as="a" href="#main-content" focusable className="skip-control">
        Skip to content
      </VisuallyHidden>,
    );

    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveClass('sr-only', 'sr-only-focusable', 'skip-control');
    expect(link).toHaveAttribute('href', '#main-content');
    expect(link).not.toHaveAttribute('focusable');
    await userEvent.setup().tab();
    expect(link).toHaveFocus();
  });

  it('does not reveal ordinary hidden text on focus', () => {
    render(<VisuallyHidden focusable={false}>Context</VisuallyHidden>);
    expect(screen.getByText('Context')).not.toHaveClass('sr-only-focusable');
  });
});
