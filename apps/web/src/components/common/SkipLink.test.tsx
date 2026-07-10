// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SkipLink } from './SkipLink';

// SkipLink now delegates to the canonical layout/SkipToContent component
// (#3600), so these tests assert the shared skip-link contract rather than the
// former inline-style implementation.
describe('SkipLink', () => {
  it('renders with default label and target', () => {
    render(<SkipLink />);

    const link = screen.getByText('Skip to main content');
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '#main-content');
    expect(link).toHaveClass('skip-link');
  });

  it('renders with custom label and target', () => {
    render(<SkipLink label="Jump to content" targetId="content-area" />);

    const link = screen.getByText('Jump to content');
    expect(link).toHaveAttribute('href', '#content-area');
  });

  it('focuses the target element on click and makes it programmatically focusable', () => {
    const target = document.createElement('main');
    target.id = 'main-content';
    document.body.appendChild(target);

    render(<SkipLink />);

    fireEvent.click(screen.getByText('Skip to main content'));

    expect(target).toHaveFocus();
    expect(target.getAttribute('tabindex')).toBe('-1');

    document.body.removeChild(target);
  });

  it('moves focus to a custom target on Enter', () => {
    render(
      <>
        <SkipLink targetId="content-area" />
        <div id="content-area">Content</div>
      </>,
    );

    fireEvent.keyDown(screen.getByText('Skip to main content'), { key: 'Enter' });

    expect(document.getElementById('content-area')).toHaveFocus();
  });

  it('is an anchor element for keyboard accessibility', () => {
    render(<SkipLink />);

    expect(screen.getByText('Skip to main content').tagName).toBe('A');
  });
});
