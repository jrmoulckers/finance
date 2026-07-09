// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { PasswordInput } from './PasswordInput';

describe('PasswordInput', () => {
  it('renders a masked password field with a reveal toggle', () => {
    render(<PasswordInput aria-label="Password" value="" onChange={() => {}} />);

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles visibility without losing the value', () => {
    render(<PasswordInput aria-label="Password" defaultValue="s3cret-value" />);

    const input = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    fireEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('s3cret-value');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('forwards its ref to the underlying input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<PasswordInput aria-label="Password" ref={ref} value="" onChange={() => {}} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('announces Caps Lock while typing when enabled', () => {
    render(<PasswordInput aria-label="Password" showCapsLockWarning value="" onChange={() => {}} />);

    const input = screen.getByLabelText('Password');
    fireEvent.keyDown(input, { key: 'a', getModifierState: () => true });
    expect(screen.getByText('Caps Lock is on.')).toBeInTheDocument();

    fireEvent.keyUp(input, { key: 'a', getModifierState: () => false });
    expect(screen.queryByText('Caps Lock is on.')).not.toBeInTheDocument();
  });

  it('disables the toggle when the field is disabled', () => {
    render(<PasswordInput aria-label="Password" disabled value="" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
  });
});
