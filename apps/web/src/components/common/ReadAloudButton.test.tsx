// @vitest-environment jsdom
// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessibilityProvider } from '../../contexts/AccessibilityContext';
import { ReadAloudButton } from './ReadAloudButton';

const speakMock = vi.fn();
const cancelMock = vi.fn();

function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function renderWithSpeech(ui: ReactNode, speakAmounts = true) {
  return render(
    <AccessibilityProvider initialSettings={{ speakAmounts }}>{ui}</AccessibilityProvider>,
  );
}

describe('ReadAloudButton', () => {
  beforeEach(() => {
    localStorage.clear();
    speakMock.mockReset();
    cancelMock.mockReset();
    installMatchMedia();
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation(function MockSpeechSynthesisUtterance(
        this: { text: string },
        text: string,
      ) {
        this.text = text;
      }),
    );
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel: cancelMock, speak: speakMock },
    });
  });

  it('renders nothing when "Read amounts aloud" is disabled', () => {
    renderWithSpeech(<ReadAloudButton amount={12345} context="net worth" />, false);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a keyboard-operable button when the preference is enabled', () => {
    renderWithSpeech(<ReadAloudButton amount={12345} context="net worth" />);

    const button = screen.getByRole('button', { name: 'Read aloud: net worth' });
    // Native <button> is inherently focusable/operable by keyboard (no tabindex needed).
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('uses the visible label as the start of the accessible name (WCAG 2.5.3)', () => {
    renderWithSpeech(
      <ReadAloudButton amount={500} context="remaining in Groceries budget" label="Read amount" />,
    );

    const button = screen.getByRole('button', {
      name: 'Read amount: remaining in Groceries budget',
    });
    expect(button).toHaveTextContent('Read amount');
  });

  it('falls back to the plain label when no context is provided', () => {
    renderWithSpeech(<ReadAloudButton amount={500} />);

    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeInTheDocument();
  });

  it('speaks the amount when activated', () => {
    renderWithSpeech(<ReadAloudButton amount={12345} currency="USD" context="net worth" />);

    fireEvent.click(screen.getByRole('button', { name: 'Read aloud: net worth' }));

    expect(speakMock).toHaveBeenCalledTimes(1);
    const utterance = speakMock.mock.calls[0][0] as { text: string };
    expect(typeof utterance.text).toBe('string');
    expect(utterance.text.length).toBeGreaterThan(0);
    expect(utterance.text).toContain('net worth');
  });

  it('hides the decorative speaker icon from assistive technology', () => {
    const { container } = renderWithSpeech(<ReadAloudButton amount={100} context="balance" />);

    const icon = container.querySelector('.read-aloud-button__icon');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
