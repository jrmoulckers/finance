// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  AccountsEmptyState,
  BudgetsEmptyState,
  GoalsEmptyState,
  TransactionsEmptyState,
  WelcomeScreen,
} from './EntityEmptyStates';

describe('AccountsEmptyState', () => {
  it('renders title and description', () => {
    render(<AccountsEmptyState />);
    expect(screen.getByText('No accounts yet')).toBeInTheDocument();
    expect(screen.getByText(/Add your bank accounts/)).toBeInTheDocument();
  });

  it('renders CTA button when onAction is provided', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();

    render(<AccountsEmptyState onAction={onAction} />);
    const button = screen.getByRole('button', { name: 'Add your first account' });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('does not render CTA button when onAction is not provided', () => {
    render(<AccountsEmptyState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('TransactionsEmptyState', () => {
  it('renders title and description', () => {
    render(<TransactionsEmptyState />);
    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    expect(screen.getByText(/Record your income/)).toBeInTheDocument();
  });

  it('renders CTA button when onAction is provided', () => {
    render(<TransactionsEmptyState onAction={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add a transaction' })).toBeInTheDocument();
  });
});

describe('BudgetsEmptyState', () => {
  it('renders title and description', () => {
    render(<BudgetsEmptyState />);
    expect(screen.getByText('No budgets yet')).toBeInTheDocument();
    expect(screen.getByText(/Create budgets to set/)).toBeInTheDocument();
  });

  it('renders CTA button when onAction is provided', () => {
    render(<BudgetsEmptyState onAction={() => {}} />);
    expect(screen.getByRole('button', { name: 'Create a budget' })).toBeInTheDocument();
  });
});

describe('GoalsEmptyState', () => {
  it('renders title and description', () => {
    render(<GoalsEmptyState />);
    expect(screen.getByText('No goals yet')).toBeInTheDocument();
    expect(screen.getByText(/Set savings goals/)).toBeInTheDocument();
  });

  it('renders CTA button when onAction is provided', () => {
    render(<GoalsEmptyState onAction={() => {}} />);
    expect(screen.getByRole('button', { name: 'Set a goal' })).toBeInTheDocument();
  });
});

describe('WelcomeScreen', () => {
  it('renders default greeting without userName', () => {
    render(<WelcomeScreen />);
    expect(screen.getByText('Welcome to Finance!')).toBeInTheDocument();
  });

  it('renders personalized greeting with userName', () => {
    render(<WelcomeScreen userName="Alex" />);
    expect(screen.getByText('Welcome, Alex!')).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<WelcomeScreen />);
    expect(screen.getByText(/Take control of your finances/)).toBeInTheDocument();
  });

  it('renders CTA when onGetStarted is provided', async () => {
    const onGetStarted = vi.fn();
    const user = userEvent.setup();

    render(<WelcomeScreen onGetStarted={onGetStarted} />);
    const button = screen.getByRole('button', { name: 'Get started' });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(onGetStarted).toHaveBeenCalledOnce();
  });

  it('does not render CTA when onGetStarted is not provided', () => {
    render(<WelcomeScreen />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has accessible section landmark', () => {
    render(<WelcomeScreen />);
    expect(screen.getByRole('region', { name: /Welcome/ })).toBeInTheDocument();
  });
});
