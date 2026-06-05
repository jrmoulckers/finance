// SPDX-License-Identifier: BUSL-1.1

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PasskeySetupPrompt } from './PasskeySetupPrompt';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const registerNewPasskeyMock = vi.fn();
const authState = vi.hoisted(() => ({
  registerNewPasskey: vi.fn(),
  isSigningOut: false,
}));

vi.mock('../../auth/auth-context', () => ({
  useAuth: () => authState,
}));

const preferredAuthMethodMock = vi.hoisted(() => ({
  shouldShowPasskeyPrompt: vi.fn(() => true),
  setPreferredAuthMethod: vi.fn(),
  markPasskeyPromptDismissed: vi.fn(),
}));

vi.mock('../../auth/preferred-auth-method', () => preferredAuthMethodMock);

vi.mock('../../lib/passkey-preferences', () => ({
  setPasskeyPromptState: vi.fn(),
  setHasRegisteredPasskey: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPrompt(isOpen = true, onClose = vi.fn()) {
  return {
    onClose,
    ...render(<PasskeySetupPrompt isOpen={isOpen} onClose={onClose} />),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PasskeySetupPrompt', () => {
  beforeEach(() => {
    registerNewPasskeyMock.mockReset();
    authState.registerNewPasskey = registerNewPasskeyMock;
    authState.isSigningOut = false;
    preferredAuthMethodMock.shouldShowPasskeyPrompt.mockReset().mockReturnValue(true);
    preferredAuthMethodMock.setPreferredAuthMethod.mockReset();
    preferredAuthMethodMock.markPasskeyPromptDismissed.mockReset();
  });

  it('renders nothing when isOpen is false', () => {
    renderPrompt(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog when isOpen is true', () => {
    renderPrompt(true);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/secure your account/i)).toBeInTheDocument();
  });

  it('renders three action buttons', () => {
    renderPrompt(true);

    expect(screen.getByRole('button', { name: /set up now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remind me later/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
  });

  it('has proper ARIA attributes', () => {
    renderPrompt(true);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'passkey-prompt-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'passkey-prompt-description');
  });

  it('calls onClose when "Remind Me Later" is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPrompt(true);

    await user.click(screen.getByRole('button', { name: /remind me later/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks the prompt dismissed (cooldown) on "Remind Me Later"', async () => {
    const user = userEvent.setup();
    renderPrompt(true);

    await user.click(screen.getByRole('button', { name: /remind me later/i }));

    expect(preferredAuthMethodMock.markPasskeyPromptDismissed).toHaveBeenCalledTimes(1);
    // Remind Me Later does NOT lock in a preference — user hasn't decided.
    expect(preferredAuthMethodMock.setPreferredAuthMethod).not.toHaveBeenCalled();
  });

  it('calls onClose when "Skip" is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPrompt(true);

    await user.click(screen.getByRole('button', { name: /skip/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('records password preference + dismissal on "Skip"', async () => {
    const user = userEvent.setup();
    renderPrompt(true);

    await user.click(screen.getByRole('button', { name: /skip/i }));

    expect(preferredAuthMethodMock.setPreferredAuthMethod).toHaveBeenCalledWith('password');
    expect(preferredAuthMethodMock.markPasskeyPromptDismissed).toHaveBeenCalledTimes(1);
  });

  it('calls registerNewPasskey when "Set Up Now" is clicked', async () => {
    const user = userEvent.setup();
    registerNewPasskeyMock.mockResolvedValue(undefined);

    renderPrompt(true);

    await user.click(screen.getByRole('button', { name: /set up now/i }));

    expect(registerNewPasskeyMock).toHaveBeenCalledTimes(1);
  });

  it('records passkey preference after successful registration', async () => {
    const user = userEvent.setup();
    registerNewPasskeyMock.mockResolvedValue(undefined);

    renderPrompt(true);

    await user.click(screen.getByRole('button', { name: /set up now/i }));

    await waitFor(() =>
      expect(preferredAuthMethodMock.setPreferredAuthMethod).toHaveBeenCalledWith('passkey'),
    );
  });

  it('does NOT record a preference when registration fails', async () => {
    const user = userEvent.setup();
    registerNewPasskeyMock.mockRejectedValue(new Error('Credential creation was cancelled'));

    renderPrompt(true);

    await user.click(screen.getByRole('button', { name: /set up now/i }));

    expect(preferredAuthMethodMock.setPreferredAuthMethod).not.toHaveBeenCalled();
  });

  it('shows error when registration fails', async () => {
    const user = userEvent.setup();
    registerNewPasskeyMock.mockRejectedValue(new Error('Credential creation was cancelled'));

    renderPrompt(true);

    await user.click(screen.getByRole('button', { name: /set up now/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Credential creation was cancelled');
  });

  it('disables buttons during registration', async () => {
    // Make registerNewPasskey hang (never resolve)
    registerNewPasskeyMock.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    renderPrompt(true);

    await user.click(screen.getByRole('button', { name: /set up now/i }));

    expect(screen.getByRole('button', { name: /setting up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /remind me later/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /skip/i })).toBeDisabled();
  });

  it('shows biometric-specific messaging', () => {
    renderPrompt(true);

    // The exact label depends on the test environment's user agent, but
    // the description should always mention signing in faster
    expect(screen.getByText(/sign in faster/i)).toBeInTheDocument();
  });

  it('renders nothing while sign-out is in progress (#1983)', () => {
    authState.isSigningOut = true;
    const onClose = vi.fn();

    renderPrompt(true, onClose);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when the new preference utility says to suppress (#1983)', () => {
    preferredAuthMethodMock.shouldShowPasskeyPrompt.mockReturnValue(false);
    const onClose = vi.fn();

    renderPrompt(true, onClose);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });
});
