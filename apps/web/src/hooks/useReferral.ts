// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for managing the referral program.
 *
 * Provides referral link generation, share functionality,
 * referral status tracking, and reward display.
 *
 * Usage:
 * ```tsx
 * const { referralCode, referrals, shareReferral, totalRewards } = useReferral();
 * ```
 *
 * References: issue #342
 */

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReferralStatus = 'pending' | 'signed_up' | 'activated' | 'rewarded';

export interface Referral {
  readonly id: string;
  readonly referredEmail: string;
  readonly status: ReferralStatus;
  readonly createdAt: string;
  readonly rewardAmountCents: number;
  readonly rewardedAt: string | null;
}

export interface ReferralReward {
  readonly totalEarnedCents: number;
  readonly pendingCents: number;
  readonly referralCount: number;
  readonly activatedCount: number;
}

export interface UseReferralResult {
  /** The user's unique referral code. */
  referralCode: string;
  /** Full referral URL for sharing. */
  referralUrl: string;
  /** All referrals made by the user. */
  referrals: Referral[];
  /** Aggregated reward information. */
  rewards: ReferralReward;
  /** Whether the data is loading. */
  loading: boolean;
  /** Error message, or null. */
  error: string | null;
  /** Copy the referral link to clipboard. Returns true on success. */
  copyReferralLink: () => Promise<boolean>;
  /** Share via Web Share API if available, falls back to clipboard. */
  shareReferral: () => Promise<boolean>;
  /** Refresh referral data. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY_CODE = 'finance-referral-code';
const STORAGE_KEY_REFERRALS = 'finance-referrals';
const REFERRAL_REWARD_CENTS = 500; // $5.00 per successful referral

function getOrCreateReferralCode(): string {
  const existing = localStorage.getItem(STORAGE_KEY_CODE);
  if (existing) return existing;

  // Generate a short, memorable code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'FIN-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  localStorage.setItem(STORAGE_KEY_CODE, code);
  return code;
}

function loadReferrals(): Referral[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REFERRALS);
    return raw ? (JSON.parse(raw) as Referral[]) : [];
  } catch {
    return [];
  }
}

function computeRewards(referrals: Referral[]): ReferralReward {
  const rewarded = referrals.filter((r) => r.status === 'rewarded');
  const activated = referrals.filter((r) => r.status === 'activated' || r.status === 'rewarded');
  const pending = activated.length - rewarded.length;

  return {
    totalEarnedCents: rewarded.reduce((sum, r) => sum + r.rewardAmountCents, 0),
    pendingCents: pending * REFERRAL_REWARD_CENTS,
    referralCount: referrals.length,
    activatedCount: activated.length,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useReferral(): UseReferralResult {
  const [referralCode] = useState(getOrCreateReferralCode);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const referralUrl = `https://finance.app/invite/${referralCode}`;

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const loaded = loadReferrals();
      setReferrals(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load referrals.');
    } finally {
      setLoading(false);
    }
  }, [refreshToken]);

  const rewards = computeRewards(referrals);

  const copyReferralLink = useCallback(async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      return true;
    } catch {
      setError('Failed to copy referral link.');
      return false;
    }
  }, [referralUrl]);

  const shareReferral = useCallback(async (): Promise<boolean> => {
    const shareData = {
      title: 'Join me on Finance!',
      text: `Use my referral code ${referralCode} to get started with Finance and we both earn rewards!`,
      url: referralUrl,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return true;
      }
      // Fallback to clipboard
      return copyReferralLink();
    } catch (err) {
      // User cancelled share — not an error
      if (err instanceof Error && err.name === 'AbortError') {
        return false;
      }
      return copyReferralLink();
    }
  }, [referralCode, referralUrl, copyReferralLink]);

  return {
    referralCode,
    referralUrl,
    referrals,
    rewards,
    loading,
    error,
    copyReferralLink,
    shareReferral,
    refresh,
  };
}
