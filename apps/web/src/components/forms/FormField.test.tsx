// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormField } from './FormField';

describe('FormField', () => {
  it('renders label and children', () => {
    render(
      <FormField label="Account Name" htmlFor="name">
        <input id="name" type="text" />
      </FormField>,
    );

    expect(screen.getByLabelText('Account Name')).toBeInTheDocument();
  });

  it('shows required indicator', () => {
    render(
      <FormField label="Account Name" htmlFor="name" required>
        <input id="name" type="text" />
      </FormField>,
    );

    const label = screen.getByText('Account Name');
    expect(label).toHaveClass('form-field__label--required');

    const input = screen.getByLabelText('Account Name');
    expect(input).toHaveAttribute('aria-required', 'true');
  });

  it('displays error message with aria-describedby', () => {
    render(
      <FormField label="Amount" htmlFor="amount" error="Amount is required">
        <input id="amount" type="number" />
      </FormField>,
    );

    const errorEl = screen.getByRole('alert');
    expect(errorEl).toHaveTextContent('Amount is required');

    const input = screen.getByLabelText('Amount');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'amount-error');
  });

  it('displays hint text', () => {
    render(
      <FormField label="Email" htmlFor="email" hint="We will never share your email.">
        <input id="email" type="email" />
      </FormField>,
    );

    expect(screen.getByText('We will never share your email.')).toBeInTheDocument();

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-describedby', 'email-hint');
  });

  it('combines hint and error in aria-describedby', () => {
    render(
      <FormField label="Name" htmlFor="name" hint="Enter your full name" error="Name is required">
        <input id="name" type="text" />
      </FormField>,
    );

    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-describedby', 'name-hint name-error');
  });

  it('does not show error when error is null', () => {
    render(
      <FormField label="Name" htmlFor="name" error={null}>
        <input id="name" type="text" />
      </FormField>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies error class to wrapper', () => {
    const { container } = render(
      <FormField label="Name" htmlFor="name" error="Required">
        <input id="name" type="text" />
      </FormField>,
    );

    const wrapper = container.querySelector('.form-field');
    expect(wrapper).toHaveClass('form-field--error');
  });
});
