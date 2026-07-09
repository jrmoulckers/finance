// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PasswordInput } from './PasswordInput';

/** Render a PasswordInput with an associated label for querying. */
function renderPasswordInput(props: Partial<React.ComponentProps<typeof PasswordInput>> = {}) {
  return render(
    <>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" value="" onChange={() => {}} {...props} />
    </>,
  );
}

/**
 * Dispatch a keyboard event whose `getModifierState` reports the requested
 * Caps Lock state. jsdom's KeyboardEvent init has no Caps Lock flag, so we
 * override the getter on a real event and fire it through React's delegation.
 */
function fireCapsLock(input: HTMLElement, type: 'keydown' | 'keyup', capsLockOn: boolean): void {
  const event = new KeyboardEvent(type, { key: 'a', bubbles: true });
  Object.defineProperty(event, 'getModifierState', {
    configurable: true,
    value: (key: string) => (key === 'CapsLock' ? capsLockOn : false),
  });
  fireEvent(input, event);
}

describe('PasswordInput', () => {
  it('renders a masked password field by default', () => {
    renderPasswordInput();
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('reveals and re-hides the value via the toggle button', async () => {
    const user = userEvent.setup();
    renderPasswordInput();
    const input = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('does not submit the surrounding form when the toggle is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <label htmlFor="pw">Password</label>
        <PasswordInput id="pw" value="secret" onChange={() => {}} />
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('honours custom toggle labels', () => {
    renderPasswordInput({ showPasswordLabel: 'Reveal', hidePasswordLabel: 'Conceal' });
    expect(screen.getByRole('button', { name: 'Reveal' })).toBeInTheDocument();
  });

  it('shows a Caps Lock warning while Caps Lock is active and links it to the field', () => {
    renderPasswordInput();
    const input = screen.getByLabelText('Password');

    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument();

    fireCapsLock(input, 'keydown', true);

    const warning = screen.getByText('Caps Lock is on');
    expect(warning).toBeInTheDocument();
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(describedBy).toContain(warning.closest('p')!.id);
  });

  it('clears the Caps Lock warning when Caps Lock turns off', () => {
    renderPasswordInput();
    const input = screen.getByLabelText('Password');

    fireCapsLock(input, 'keydown', true);
    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument();

    fireCapsLock(input, 'keyup', false);
    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument();
  });

  it('clears the Caps Lock warning on blur', () => {
    renderPasswordInput();
    const input = screen.getByLabelText('Password');

    fireCapsLock(input, 'keydown', true);
    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument();

    fireEvent.blur(input);
    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument();
  });

  it('preserves a caller-provided aria-describedby', () => {
    render(
      <>
        <label htmlFor="pw">Password</label>
        <p id="hint">At least 12 characters</p>
        <PasswordInput id="pw" value="" onChange={() => {}} aria-describedby="hint" />
      </>,
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'hint');
  });

  it('disables the toggle when the field is disabled', () => {
    renderPasswordInput({ disabled: true });
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
  });

  it('forwards a ref to the underlying input', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <>
        <label htmlFor="pw">Password</label>
        <PasswordInput id="pw" ref={ref} value="" onChange={() => {}} />
      </>,
    );
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('forwards change events from the input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <label htmlFor="pw">Password</label>
        <PasswordInput id="pw" onChange={onChange} />
      </>,
    );
    await user.type(screen.getByLabelText('Password'), 'a');
    expect(onChange).toHaveBeenCalled();
  });
});
