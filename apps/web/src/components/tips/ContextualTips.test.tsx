// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ContextualTips } from './ContextualTips';
import type { FinancialTip } from './tips-engine';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const sampleTips: FinancialTip[] = [
  {
    id: 'tip-1',
    title: 'Budget almost exhausted',
    description: 'You have used 95% of your budget.',
    context: 'budgets',
    severity: 'critical',
    score: 95,
    actionLabel: 'View Budgets',
    actionRoute: '/budgets',
  },
  {
    id: 'tip-2',
    title: 'Great savings rate!',
    description: 'You are saving 25% of your income.',
    context: 'dashboard',
    severity: 'success',
    score: 70,
  },
  {
    id: 'tip-3',
    title: 'Set up your first budget',
    description: 'Creating a budget helps you track spending.',
    context: 'budgets',
    severity: 'info',
    score: 80,
    actionLabel: 'Create Budget',
    actionRoute: '/budgets',
  },
];

describe('ContextualTips', () => {
  const onDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when tips array is empty', () => {
    const { container } = render(
      <MemoryRouter>
        <ContextualTips tips={[]} onDismiss={onDismiss} />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders all provided tips', () => {
    render(
      <MemoryRouter>
        <ContextualTips tips={sampleTips} onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Budget almost exhausted')).toBeInTheDocument();
    expect(screen.getByText('Great savings rate!')).toBeInTheDocument();
    expect(screen.getByText('Set up your first budget')).toBeInTheDocument();
  });

  it('renders tip descriptions', () => {
    render(
      <MemoryRouter>
        <ContextualTips tips={sampleTips} onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    expect(screen.getByText('You have used 95% of your budget.')).toBeInTheDocument();
    expect(screen.getByText('You are saving 25% of your income.')).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    render(
      <MemoryRouter>
        <ContextualTips tips={sampleTips} onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    const dismissButtons = screen.getAllByLabelText(/Dismiss tip:/);
    expect(dismissButtons).toHaveLength(3);

    fireEvent.click(dismissButtons[0]);
    expect(onDismiss).toHaveBeenCalledWith('tip-1');
  });

  it('renders action buttons for tips with actionLabel', () => {
    render(
      <MemoryRouter>
        <ContextualTips tips={sampleTips} onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    expect(screen.getByText('View Budgets')).toBeInTheDocument();
    expect(screen.getByText('Create Budget')).toBeInTheDocument();
  });

  it('navigates when action button is clicked', () => {
    render(
      <MemoryRouter>
        <ContextualTips tips={sampleTips} onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('View Budgets'));
    expect(mockNavigate).toHaveBeenCalledWith('/budgets');
  });

  it('has proper ARIA attributes', () => {
    render(
      <MemoryRouter>
        <ContextualTips tips={sampleTips} onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Financial tips')).toBeInTheDocument();
    expect(screen.getByLabelText('Critical: Budget almost exhausted')).toBeInTheDocument();
    expect(screen.getByLabelText('Success: Great savings rate!')).toBeInTheDocument();
    expect(screen.getByLabelText('Tip: Set up your first budget')).toBeInTheDocument();
  });

  it('does not render action button when no actionLabel provided', () => {
    const tipWithoutAction: FinancialTip[] = [
      {
        id: 'tip-no-action',
        title: 'A tip',
        description: 'Some description',
        context: 'dashboard',
        severity: 'info',
        score: 50,
      },
    ];

    render(
      <MemoryRouter>
        <ContextualTips tips={tipWithoutAction} onDismiss={onDismiss} />
      </MemoryRouter>,
    );

    // Only dismiss button should exist, no action button
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute('aria-label', 'Dismiss tip: A tip');
  });
});
