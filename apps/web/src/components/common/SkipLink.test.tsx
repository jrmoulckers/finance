// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SkipLink } from './SkipLink';

describe('SkipLink', () => {
  it('renders with default label', () => {
    render(<SkipLink />);

    const link = screen.getByText('Skip to main content');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('renders with custom label and target', () => {
    render(<SkipLink label="Jump to content" targetId="content-area" />);

    const link = screen.getByText('Jump to content');
    expect(link).toHaveAttribute('href', '#content-area');
  });

  it('is visually hidden until focused', () => {
    render(<SkipLink />);

    const link = screen.getByText('Skip to main content');

    // Before focus: should be positioned off-screen
    expect(link.style.top).toBe('-100%');
  });

  it('becomes visible on focus', () => {
    render(<SkipLink />);

    const link = screen.getByText('Skip to main content');
    fireEvent.focus(link);

    expect(link.style.top).toBe('0px');
  });

  it('hides again on blur', () => {
    render(<SkipLink />);

    const link = screen.getByText('Skip to main content');
    fireEvent.focus(link);
    expect(link.style.top).toBe('0px');

    fireEvent.blur(link);
    expect(link.style.top).toBe('-100%');
  });

  it('focuses the target element on click', () => {
    const target = document.createElement('main');
    target.id = 'main-content';
    document.body.appendChild(target);

    const focusSpy = vi.spyOn(target, 'focus');

    render(<SkipLink />);

    fireEvent.click(screen.getByText('Skip to main content'));

    expect(focusSpy).toHaveBeenCalled();
    expect(target.getAttribute('tabindex')).toBe('-1');

    document.body.removeChild(target);
  });

  it('is an anchor element for keyboard accessibility', () => {
    render(<SkipLink />);

    const link = screen.getByText('Skip to main content');
    expect(link.tagName).toBe('A');
  });
});
