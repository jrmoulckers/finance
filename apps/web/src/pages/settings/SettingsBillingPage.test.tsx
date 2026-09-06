// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsBillingPage } from './SettingsBillingPage';

const refresh = vi.fn().mockResolvedValue(undefined);
const reconcile = vi.fn().mockResolvedValue(undefined);
const startCheckout = vi.fn().mockResolvedValue(null);
const openPortal = vi.fn().mockResolvedValue(null);
let household: { id: string } | null = null;
let billingState: {
  status: 'idle' | 'pending' | 'confirmed' | 'error';
  projection: null;
  message?: string;
};

vi.mock('../../hooks/useHousehold', () => ({
  useHousehold: () => ({ household }),
}));

vi.mock('../../billing/useProductBilling', () => ({
  useProductBilling: () => ({
    state: billingState,
    refresh,
    reconcile,
    startCheckout,
    openPortal,
  }),
}));

describe('SettingsBillingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    household = null;
    billingState = { status: 'pending', projection: null };
  });

  it('keeps checkout return pending and offers an explicit projection refresh', async () => {
    render(<SettingsBillingPage />);

    expect(
      screen.getByText('Waiting for Finance to confirm trusted billing evidence.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/access confirmed/i)).not.toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalledWith(undefined));
  });

  it('requires a current household before starting Family checkout', () => {
    render(<SettingsBillingPage />);

    expect(screen.getByRole('button', { name: /Family Monthly/i })).toBeDisabled();
    expect(screen.getByText('Create or join a household before selecting Family.')).toBeVisible();
  });

  it('passes only the selected logical choice and eligible household intent', () => {
    household = { id: '20000000-0000-4000-8000-000000000001' };
    billingState = { status: 'idle', projection: null };
    render(<SettingsBillingPage />);

    fireEvent.click(screen.getByRole('button', { name: /Premium Monthly/i }));
    expect(startCheckout).toHaveBeenCalledWith(
      'premium_monthly',
      '20000000-0000-4000-8000-000000000001',
    );
  });
});
