// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SkipToContent } from './SkipToContent';

describe('SkipToContent', () => {
  it('renders a skip link with the default label', () => {
    render(<SkipToContent />);

    const link = screen.getByText('Skip to main content');
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
  });

  it('targets #main-content by default', () => {
    render(<SkipToContent />);

    expect(screen.getByText('Skip to main content')).toHaveAttribute('href', '#main-content');
  });

  it('targets a custom targetId when provided', () => {
    render(<SkipToContent targetId="custom-content" />);

    expect(screen.getByText('Skip to main content')).toHaveAttribute('href', '#custom-content');
  });

  it('renders a custom label when provided', () => {
    render(<SkipToContent label="Skip to navigation" />);

    expect(screen.getByText('Skip to navigation')).toBeInTheDocument();
  });

  it('moves focus to the main content target on click and tabs into its content', async () => {
    const user = userEvent.setup();

    render(
      <>
        <SkipToContent />
        <main id="main-content" tabIndex={-1}>
          <button type="button">Main action</button>
        </main>
      </>,
    );

    await user.click(screen.getByRole('link', { name: 'Skip to main content' }));

    const main = screen.getByRole('main');
    expect(main).toHaveFocus();

    await user.tab();

    expect(screen.getByRole('button', { name: 'Main action' })).toHaveFocus();
  });

  it('moves focus to the target when Enter is pressed', () => {
    render(
      <>
        <SkipToContent />
        <main id="main-content" tabIndex={-1}>
          <button type="button">Main action</button>
        </main>
      </>,
    );

    fireEvent.keyDown(screen.getByRole('link', { name: 'Skip to main content' }), { key: 'Enter' });

    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('falls back to the main landmark when the target id is missing', () => {
    render(
      <>
        <SkipToContent />
        <main tabIndex={-1}>
          <button type="button">Main action</button>
        </main>
      </>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Skip to main content' }));

    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('makes a custom target programmatically focusable before focusing it', () => {
    render(
      <>
        <SkipToContent targetId="custom-section" />
        <div id="custom-section">Custom section</div>
      </>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Skip to main content' }));

    const customTarget = document.getElementById('custom-section');
    expect(customTarget).toHaveAttribute('tabindex', '-1');
    expect(customTarget).toHaveFocus();
  });

  it('does not move focus for other keys', () => {
    render(
      <>
        <SkipToContent />
        <main id="main-content" tabIndex={-1}>
          <button type="button">Main action</button>
        </main>
      </>,
    );

    const link = screen.getByRole('link', { name: 'Skip to main content' });
    link.focus();

    fireEvent.keyDown(link, { key: 'Tab' });

    expect(link).toHaveFocus();
  });
});
