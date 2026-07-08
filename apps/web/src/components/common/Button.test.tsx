// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { Button, buttonClassName } from './Button';

describe('Button', () => {
  it('renders a native button by default with type="button"', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('applies the primary variant class by default', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toHaveClass('form-button');
    expect(btn).toHaveClass('form-button--primary');
  });

  it.each([
    ['secondary', 'form-button--secondary'],
    ['tertiary', 'form-button--tertiary'],
    ['ghost', 'form-button--ghost'],
    ['destructive', 'form-button--destructive'],
  ] as const)('applies the %s variant class', (variant, className) => {
    render(<Button variant={variant}>Action</Button>);
    expect(screen.getByRole('button', { name: 'Action' })).toHaveClass(className);
  });

  it('applies size and full-width modifiers', () => {
    render(
      <Button size="lg" fullWidth>
        Big
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Big' });
    expect(btn).toHaveClass('form-button--lg');
    expect(btn).toHaveClass('form-button--full');
  });

  it('fires onClick when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables and marks aria-busy while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Saving' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('respects an explicit disabled prop', () => {
    render(<Button disabled>Nope</Button>);
    expect(screen.getByRole('button', { name: 'Nope' })).toBeDisabled();
  });

  it('honors an explicit type="submit"', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'submit');
  });

  it('renders as a router Link when as={Link}, without leaking anchor defaults', () => {
    render(
      <MemoryRouter>
        <Button as={Link} to="/bills" variant="secondary">
          Cancel
        </Button>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Cancel' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/bills');
    expect(link).toHaveClass('form-button');
    expect(link).toHaveClass('form-button--secondary');
    // No native button attributes on a link rendering.
    expect(link).not.toHaveAttribute('type');
  });

  it('buttonClassName composes the expected class list', () => {
    expect(buttonClassName({ variant: 'destructive', size: 'sm', fullWidth: true })).toBe(
      'form-button form-button--destructive form-button--sm form-button--full',
    );
    expect(buttonClassName({ className: 'extra' })).toBe('form-button form-button--primary extra');
  });
});
