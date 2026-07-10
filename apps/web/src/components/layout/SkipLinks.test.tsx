// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SkipLinks } from './SkipLinks';

describe('SkipLinks', () => {
  it('renders both a skip-to-content and a skip-to-navigation link', () => {
    render(<SkipLinks />);

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('link', { name: 'Skip to navigation' })).toHaveAttribute(
      'href',
      '#primary-navigation',
    );
  });

  it('moves focus to #main-content when activating Skip to main content', () => {
    render(
      <>
        <SkipLinks />
        <main id="main-content" tabIndex={-1}>
          <button type="button">Main action</button>
        </main>
      </>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Skip to main content' }));

    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('moves focus to the primary navigation landmark when activating Skip to navigation', () => {
    render(
      <>
        <SkipLinks />
        <nav id="primary-navigation" aria-label="Primary" tabIndex={-1}>
          <a href="/dashboard">Dashboard</a>
        </nav>
      </>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Skip to navigation' }));

    expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveFocus();
  });

  it('falls back to the bottom navigation landmark when the sidebar id is absent', () => {
    render(
      <>
        <SkipLinks />
        <nav className="bottom-nav" aria-label="Main navigation">
          <button type="button">Home</button>
        </nav>
      </>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Skip to navigation' }));

    const bottomNav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(bottomNav).toHaveFocus();
    expect(bottomNav).toHaveAttribute('tabindex', '-1');
  });
});
