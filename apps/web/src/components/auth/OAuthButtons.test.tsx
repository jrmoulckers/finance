// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OAuthButtons } from './OAuthButtons';

const PROVIDER_NAMES = ['Google', 'GitHub', 'Microsoft', 'Apple'] as const;

describe('OAuthButtons', () => {
  it('renders all four providers with the same classes (no per-provider styling)', () => {
    render(<OAuthButtons onSelect={vi.fn()} />);

    const buttons = PROVIDER_NAMES.map((name) =>
      screen.getByRole('button', { name: `Sign in with ${name}` }),
    );

    expect(buttons).toHaveLength(4);

    // Every provider button must share the identical class list so the group
    // is visually consistent at rest. The odd-one-out fill reported in #3901
    // came from a sticky CSS :hover state, not from markup differences — this
    // guards against a regression where per-provider styling creeps back in.
    const classLists = buttons.map((button) => button.className);
    for (const className of classLists) {
      expect(className).toBe('form-button form-button--secondary auth-oauth-button');
    }
    expect(new Set(classLists).size).toBe(1);
  });

  it('exposes an accessible group and honors a custom verb', () => {
    render(<OAuthButtons onSelect={vi.fn()} verb="Sign up" groupLabel="Sign-up options" />);

    expect(screen.getByRole('group', { name: 'Sign-up options' })).toBeInTheDocument();
    for (const name of PROVIDER_NAMES) {
      expect(screen.getByRole('button', { name: `Sign up with ${name}` })).toBeInTheDocument();
    }
  });

  it('invokes onSelect with the chosen provider id', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<OAuthButtons onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(onSelect).toHaveBeenCalledWith('google');

    await user.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }));
    expect(onSelect).toHaveBeenCalledWith('azure');
  });

  it('disables every provider button when disabled', () => {
    render(<OAuthButtons onSelect={vi.fn()} disabled />);

    for (const name of PROVIDER_NAMES) {
      expect(screen.getByRole('button', { name: `Sign in with ${name}` })).toBeDisabled();
    }
  });
});
