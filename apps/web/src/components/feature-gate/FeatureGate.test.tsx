// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FeatureGateProvider, useFeatureGate } from './FeatureGateProvider';
import { FeatureGate } from './FeatureGate';
import { UpgradePrompt } from './UpgradePrompt';
import { LimitBanner } from './LimitBanner';
import type { FeatureUsage } from './feature-gate-engine';

// Helper component to display feature gate context values
const FeatureGateConsumer: React.FC<{
  feature: Parameters<ReturnType<typeof useFeatureGate>['checkAccess']>[0];
  usage?: FeatureUsage;
}> = ({ feature, usage }) => {
  const { checkAccess, isPremium, subscription } = useFeatureGate();
  const access = checkAccess(feature, usage);

  return (
    <div>
      <span data-testid="tier">{subscription.tier}</span>
      <span data-testid="is-premium">{String(isPremium)}</span>
      <span data-testid="allowed">{String(access.allowed)}</span>
      <span data-testid="at-limit">{String(access.atLimit)}</span>
    </div>
  );
};

describe('FeatureGateProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides default free tier', () => {
    render(
      <FeatureGateProvider>
        <FeatureGateConsumer feature="achievements" />
      </FeatureGateProvider>,
    );

    expect(screen.getByTestId('tier')).toHaveTextContent('free');
    expect(screen.getByTestId('is-premium')).toHaveTextContent('false');
  });

  it('accepts initial state override', () => {
    render(
      <FeatureGateProvider initialState={{ tier: 'premium', isActive: true, periodEnd: null }}>
        <FeatureGateConsumer feature="data_export" />
      </FeatureGateProvider>,
    );

    expect(screen.getByTestId('tier')).toHaveTextContent('premium');
    expect(screen.getByTestId('is-premium')).toHaveTextContent('true');
    expect(screen.getByTestId('allowed')).toHaveTextContent('true');
  });

  it('blocks premium features on free tier', () => {
    render(
      <FeatureGateProvider>
        <FeatureGateConsumer feature="data_export" />
      </FeatureGateProvider>,
    );

    expect(screen.getByTestId('allowed')).toHaveTextContent('false');
  });

  it('checks usage limits', () => {
    render(
      <FeatureGateProvider>
        <FeatureGateConsumer
          feature="unlimited_accounts"
          usage={{ accountCount: 3, budgetCount: 0, goalCount: 0, categoryCount: 0 }}
        />
      </FeatureGateProvider>,
    );

    expect(screen.getByTestId('at-limit')).toHaveTextContent('true');
  });
});

describe('FeatureGate component', () => {
  it('renders children when feature is allowed', () => {
    render(
      <FeatureGateProvider>
        <FeatureGate feature="achievements">
          <span>Feature content</span>
        </FeatureGate>
      </FeatureGateProvider>,
    );

    expect(screen.getByText('Feature content')).toBeInTheDocument();
  });

  it('renders fallback when feature is blocked', () => {
    render(
      <FeatureGateProvider>
        <FeatureGate feature="data_export" fallback={<span>Upgrade required</span>}>
          <span>Premium content</span>
        </FeatureGate>
      </FeatureGateProvider>,
    );

    expect(screen.getByText('Upgrade required')).toBeInTheDocument();
    expect(screen.queryByText('Premium content')).not.toBeInTheDocument();
  });

  it('renders nothing when blocked with no fallback', () => {
    const { container } = render(
      <FeatureGateProvider>
        <FeatureGate feature="data_export">
          <span>Premium content</span>
        </FeatureGate>
      </FeatureGateProvider>,
    );

    expect(screen.queryByText('Premium content')).not.toBeInTheDocument();
    expect(container.innerHTML).toBe('');
  });
});

describe('UpgradePrompt', () => {
  it('renders with feature-specific message', () => {
    render(
      <MemoryRouter>
        <FeatureGateProvider>
          <UpgradePrompt feature="data_export" />
        </FeatureGateProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Upgrade to Premium')).toBeInTheDocument();
    expect(screen.getByText(/Data Export is a premium feature/)).toBeInTheDocument();
  });

  it('renders generic message without feature', () => {
    render(
      <MemoryRouter>
        <FeatureGateProvider>
          <UpgradePrompt />
        </FeatureGateProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Upgrade to premium to unlock all features.')).toBeInTheDocument();
  });

  it('shows upgrade button when onUpgrade provided', () => {
    const onUpgrade = vi.fn();
    render(
      <MemoryRouter>
        <FeatureGateProvider>
          <UpgradePrompt onUpgrade={onUpgrade} />
        </FeatureGateProvider>
      </MemoryRouter>,
    );

    const button = screen.getByText('Upgrade Now');
    fireEvent.click(button);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('has proper ARIA label', () => {
    render(
      <MemoryRouter>
        <FeatureGateProvider>
          <UpgradePrompt />
        </FeatureGateProvider>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Upgrade to premium')).toBeInTheDocument();
  });
});

describe('LimitBanner', () => {
  const usage: FeatureUsage = {
    accountCount: 3,
    budgetCount: 0,
    goalCount: 0,
    categoryCount: 0,
  };

  it('renders when at limit on free tier', () => {
    render(
      <FeatureGateProvider>
        <LimitBanner feature="unlimited_accounts" usage={usage} />
      </FeatureGateProvider>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/reached the free tier limit/)).toBeInTheDocument();
  });

  it('does not render when not at limit', () => {
    const { container } = render(
      <FeatureGateProvider>
        <LimitBanner feature="unlimited_accounts" usage={{ ...usage, accountCount: 1 }} />
      </FeatureGateProvider>,
    );

    expect(container.innerHTML).toBe('');
  });

  it('shows upgrade button when onUpgrade provided', () => {
    const onUpgrade = vi.fn();
    render(
      <FeatureGateProvider>
        <LimitBanner feature="unlimited_accounts" usage={usage} onUpgrade={onUpgrade} />
      </FeatureGateProvider>,
    );

    fireEvent.click(screen.getByText('Upgrade'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('does not render on premium tier', () => {
    const { container } = render(
      <FeatureGateProvider initialState={{ tier: 'premium', isActive: true, periodEnd: null }}>
        <LimitBanner feature="unlimited_accounts" usage={usage} />
      </FeatureGateProvider>,
    );

    expect(container.innerHTML).toBe('');
  });
});
