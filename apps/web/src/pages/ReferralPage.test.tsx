// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReferral } from '../hooks/useReferral';
import type { UseReferralResult } from '../hooks/useReferral';
import { ReferralPage } from './ReferralPage';

vi.mock('../hooks/useReferral', () => ({
  useReferral: vi.fn(),
}));

const mockedUseReferral = vi.mocked(useReferral);

function mockReferralResult(overrides: Partial<UseReferralResult> = {}): UseReferralResult {
  return {
    referralCode: 'FIN-ABC123',
    referralUrl: 'https://finance.app/invite/FIN-ABC123',
    referrals: [],
    rewards: {
      totalEarnedCents: 0,
      pendingCents: 0,
      referralCount: 0,
      activatedCount: 0,
    },
    loading: false,
    error: null,
    copyReferralLink: vi.fn().mockResolvedValue(true),
    shareReferral: vi.fn().mockResolvedValue(true),
    refresh: vi.fn(),
    ...overrides,
  };
}

describe('ReferralPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    mockedUseReferral.mockReturnValue(mockReferralResult({ loading: true }));

    render(<ReferralPage />);
    expect(screen.getByText('Loading referral data…')).toBeInTheDocument();
  });

  it('renders referral program heading and rewards', () => {
    mockedUseReferral.mockReturnValue(mockReferralResult());

    render(<ReferralPage />);
    expect(screen.getByText('Referral Program')).toBeInTheDocument();
    expect(screen.getByText('Your Rewards')).toBeInTheDocument();
    expect(screen.getByText('Your Referral Link')).toBeInTheDocument();
  });

  it('displays the referral URL and code', () => {
    mockedUseReferral.mockReturnValue(mockReferralResult());

    render(<ReferralPage />);
    expect(screen.getByText('https://finance.app/invite/FIN-ABC123')).toBeInTheDocument();
    expect(screen.getByText('FIN-ABC123')).toBeInTheDocument();
  });

  it('shows reward statistics', () => {
    mockedUseReferral.mockReturnValue(
      mockReferralResult({
        rewards: {
          totalEarnedCents: 1500,
          pendingCents: 500,
          referralCount: 5,
          activatedCount: 3,
        },
      }),
    );

    render(<ReferralPage />);
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
    expect(screen.getByLabelText('Total referrals')).toHaveTextContent('5');
    expect(screen.getByLabelText('Activated referrals')).toHaveTextContent('3');
  });

  it('renders referral history when referrals exist', () => {
    mockedUseReferral.mockReturnValue(
      mockReferralResult({
        referrals: [
          {
            id: 'ref-1',
            referredEmail: 'friend@example.com',
            status: 'rewarded',
            createdAt: '2025-01-01T00:00:00Z',
            rewardAmountCents: 500,
            rewardedAt: '2025-01-15T00:00:00Z',
          },
        ],
      }),
    );

    render(<ReferralPage />);
    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(screen.getByText('Rewarded')).toBeInTheDocument();
  });

  it('shows empty state when no referrals', () => {
    mockedUseReferral.mockReturnValue(mockReferralResult());

    render(<ReferralPage />);
    expect(
      screen.getByText('No referrals yet. Share your link to get started!'),
    ).toBeInTheDocument();
  });

  it('displays error banner when error exists', () => {
    mockedUseReferral.mockReturnValue(mockReferralResult({ error: 'Network error' }));

    render(<ReferralPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });

  it('renders how it works section', () => {
    mockedUseReferral.mockReturnValue(mockReferralResult());

    render(<ReferralPage />);
    expect(screen.getByText('How It Works')).toBeInTheDocument();
    expect(screen.getByText('Share your link')).toBeInTheDocument();
    expect(screen.getByText('They sign up')).toBeInTheDocument();
    expect(screen.getByText('Both earn rewards')).toBeInTheDocument();
  });
});
