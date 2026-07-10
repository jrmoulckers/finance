// SPDX-License-Identifier: BUSL-1.1

/**
 * OAuthButtons — shared social-provider button group for the auth pages.
 *
 * Extracted from `LoginPage` so the same accessible provider group can be
 * reused on Signup for sign-up parity (#3707). The caller owns whether the
 * group renders at all (e.g. suppress in demo mode); this component only
 * renders the divider + provider buttons.
 */

import React from 'react';

import type { OAuthProvider } from '../../auth/auth-context';

export interface OAuthButtonsProps {
  /** Invoked with the chosen provider when a button is pressed. */
  onSelect: (provider: OAuthProvider) => void;
  /** Disables every provider button (e.g. while a request is in flight). */
  disabled?: boolean;
  /** Action verb used in each button's accessible label, e.g. "Sign in". */
  verb?: string;
  /** Accessible label for the button group. */
  groupLabel?: string;
  /** Divider caption rendered above the buttons. */
  dividerText?: string;
}

interface ProviderMeta {
  id: OAuthProvider;
  name: string;
  icon: React.ReactNode;
}

const PROVIDERS: readonly ProviderMeta[] = [
  {
    id: 'google',
    name: 'Google',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
  },
  {
    id: 'azure',
    name: 'Microsoft',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
        <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
        <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
        <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
      </svg>
    ),
  },
  {
    id: 'apple',
    name: 'Apple',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    ),
  },
];

/** Renders the shared social provider button group. */
export const OAuthButtons: React.FC<OAuthButtonsProps> = ({
  onSelect,
  disabled = false,
  verb = 'Sign in',
  groupLabel = 'Social login options',
  dividerText = 'or continue with',
}) => (
  <div className="auth-actions auth-oauth-section">
    <div className="auth-divider" aria-hidden="true">
      <span className="auth-divider__text">{dividerText}</span>
    </div>

    <div className="auth-oauth-buttons" role="group" aria-label={groupLabel}>
      {PROVIDERS.map((provider) => (
        <button
          key={provider.id}
          type="button"
          className="form-button form-button--secondary auth-oauth-button"
          onClick={() => {
            onSelect(provider.id);
          }}
          disabled={disabled}
          aria-label={`${verb} with ${provider.name}`}
        >
          {provider.icon}
          {provider.name}
        </button>
      ))}
    </div>
  </div>
);

export default OAuthButtons;
