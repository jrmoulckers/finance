// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('renders a checkbox with an associated label', () => {
    render(<Checkbox label="Auto-pay enabled" />);
    const input = screen.getByRole('checkbox', { name: 'Auto-pay enabled' });
    expect(input).toBeInTheDocument();
    expect(input).toHaveClass('checkbox__input');
  });

  it('reflects the checked prop', () => {
    render(<Checkbox label="Enabled" checked readOnly />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('calls onChange when toggled via keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Toggle me" onChange={onChange} />);
    const input = screen.getByRole('checkbox');
    input.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is operable with a mouse click on the label', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Click label" onChange={onChange} />);
    await user.click(screen.getByText('Click label'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('applies the native indeterminate DOM property', () => {
    render(<Checkbox label="Mixed" indeterminate />);
    const input = screen.getByRole('checkbox') as HTMLInputElement;
    expect(input.indeterminate).toBe(true);
  });

  it('supports the disabled state', () => {
    render(<Checkbox label="Disabled" disabled />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('associates hint text via aria-describedby', () => {
    render(<Checkbox label="With hint" hint="Extra context" />);
    const input = screen.getByRole('checkbox');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Extra context');
  });

  it('marks the control invalid and exposes the error message', () => {
    render(<Checkbox label="With error" error="Required" />);
    const input = screen.getByRole('checkbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('forwards a ref to the underlying input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Checkbox label="Ref" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('honours an explicit id', () => {
    render(<Checkbox label="Explicit" id="my-checkbox" />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('id', 'my-checkbox');
  });
});
