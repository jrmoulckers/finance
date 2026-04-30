// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReferral } from '../useReferral';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useReferral', () => {
  it('generates a referral code on first use', () => {
    const { result } = renderHook(() => useReferral());

    expect(result.current.referralCode).toMatch(/^FIN-[A-Z0-9]{6}$/);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('persists referral code across re-renders', () => {
    const { result, unmount } = renderHook(() => useReferral());
    const code = result.current.referralCode;
    unmount();

    const { result: result2 } = renderHook(() => useReferral());
    expect(result2.current.referralCode).toBe(code);
  });

  it('builds a referral URL from the code', () => {
    const { result } = renderHook(() => useReferral());

    expect(result.current.referralUrl).toBe(
      `https://finance.app/invite/${result.current.referralCode}`,
    );
  });

  it('starts with empty referrals and zero rewards', () => {
    const { result } = renderHook(() => useReferral());

    expect(result.current.referrals).toEqual([]);
    expect(result.current.rewards).toEqual({
      totalEarnedCents: 0,
      pendingCents: 0,
      referralCount: 0,
      activatedCount: 0,
    });
  });

  it('copies referral link to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { result } = renderHook(() => useReferral());

    let success: boolean;
    await act(async () => {
      success = await result.current.copyReferralLink();
    });

    expect(success!).toBe(true);
    expect(writeText).toHaveBeenCalledWith(result.current.referralUrl);
  });

  it('falls back to clipboard when Web Share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
      share: undefined,
      canShare: undefined,
    });

    const { result } = renderHook(() => useReferral());

    let success: boolean;
    await act(async () => {
      success = await result.current.shareReferral();
    });

    expect(success!).toBe(true);
    expect(writeText).toHaveBeenCalled();
  });

  it('loads referrals from localStorage', () => {
    const mockReferrals = [
      {
        id: 'ref-1',
        referredEmail: 'friend@example.com',
        status: 'rewarded' as const,
        createdAt: '2025-01-01T00:00:00Z',
        rewardAmountCents: 500,
        rewardedAt: '2025-01-15T00:00:00Z',
      },
    ];
    localStorage.setItem('finance-referrals', JSON.stringify(mockReferrals));

    const { result } = renderHook(() => useReferral());

    expect(result.current.referrals).toHaveLength(1);
    expect(result.current.rewards.totalEarnedCents).toBe(500);
    expect(result.current.rewards.referralCount).toBe(1);
  });
});
