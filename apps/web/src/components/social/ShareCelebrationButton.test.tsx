// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../accessibility/aria', () => ({
  announce: vi.fn(),
  useFocusTrap: vi.fn(),
}));

import { announce } from '../../accessibility/aria';
import { ShareCelebrationButton } from './ShareCelebrationButton';
import type { CelebrationEvent } from '../../lib/social/share-celebration';

const goalEvent: CelebrationEvent = {
  kind: 'goal-completion',
  goalName: 'New Bike',
  amountCents: 250_00,
  currency: 'USD',
};

const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  vi.clearAllMocks();
  if (originalShare) {
    Object.defineProperty(navigator, 'share', originalShare);
  } else {
    // @ts-expect-error cleanup of test-injected property
    delete navigator.share;
  }
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard);
  } else {
    // @ts-expect-error cleanup of test-injected property
    delete navigator.clipboard;
  }
});

describe('ShareCelebrationButton', () => {
  it('renders an accessible trigger with a descriptive label', () => {
    render(<ShareCelebrationButton event={goalEvent} />);
    const trigger = screen.getByRole('button', { name: /share new bike completion/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('opens a focus-trapped preview dialog showing redacted content by default', () => {
    render(<ShareCelebrationButton event={goalEvent} />);
    fireEvent.click(screen.getByRole('button', { name: /share new bike completion/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Share preview')).toBeInTheDocument();
    // No raw balance is shown by default.
    expect(screen.queryByText(/Saved so far/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$250\.00/)).not.toBeInTheDocument();
  });

  it('reveals the saved amount only after opt-in', () => {
    render(<ShareCelebrationButton event={goalEvent} />);
    fireEvent.click(screen.getByRole('button', { name: /share new bike completion/i }));

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);

    expect(screen.getByText(/Saved so far/i)).toBeInTheDocument();
    expect(screen.getByText(/\$250\.00/)).toBeInTheDocument();
  });

  it('closes the dialog on Escape', () => {
    render(<ShareCelebrationButton event={goalEvent} />);
    fireEvent.click(screen.getByRole('button', { name: /share new bike completion/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses the Web Share API when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    render(<ShareCelebrationButton event={goalEvent} />);
    fireEvent.click(screen.getByRole('button', { name: /share new bike completion/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0][0];
    expect(payload.title).toBeTruthy();
    // The native share text must not leak the balance by default.
    expect(payload.text).not.toContain('$250.00');
  });

  it('falls back to clipboard copy when Web Share is unavailable', async () => {
    // Ensure no navigator.share is present.
    // @ts-expect-error remove for this scenario
    delete navigator.share;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<ShareCelebrationButton event={goalEvent} />);
    fireEvent.click(screen.getByRole('button', { name: /share new bike completion/i }));
    // With no Web Share API, the primary action copies.
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).not.toContain('$250.00');
    await waitFor(() => expect(announce).toHaveBeenCalled());
  });
});
