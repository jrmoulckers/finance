// SPDX-License-Identifier: BUSL-1.1
// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markStepUpAuthenticated } from '../../lib/session-security';
import { saveThirdPartyConnections, type ThirdPartyConnection } from '../../lib/third-party-permissions';
import { ThirdPartyPermissionReview } from './ThirdPartyPermissionReview';

const connection: ThirdPartyConnection = {
  id: 'bank-sync',
  displayName: 'Contoso Bank',
  type: 'bank',
  scopes: ['transactions:read', 'balances:read'],
  consentedAt: '2026-05-01T00:00:00.000Z',
  lastActivityAt: '2026-05-20T00:00:00.000Z',
  status: 'active',
  risk: 'high',
  domain: 'bank.example',
};

describe('ThirdPartyPermissionReview', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => cleanup());

  it('shows empty-state privacy copy', () => {
    render(<ThirdPartyPermissionReview />);

    expect(screen.getByText(/No third-party apps/i)).toBeInTheDocument();
    expect(screen.getByText(/never share passwords/i)).toBeInTheDocument();
  });

  it('lists connections and requires step-up before revoke', async () => {
    saveThirdPartyConnections([connection]);
    const user = userEvent.setup();
    render(<ThirdPartyPermissionReview />);

    expect(screen.getByText('Contoso Bank')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /revoke/i }));
    expect(screen.getByText(/Verify your identity/i)).toBeInTheDocument();

    await markStepUpAuthenticated('third_party_permission_change');
    await user.click(screen.getByRole('button', { name: /revoke/i }));

    await waitFor(() => expect(screen.getByText(/Contoso Bank disconnected/i)).toBeInTheDocument());
  });

  it('records education acknowledgement', async () => {
    const user = userEvent.setup();
    render(<ThirdPartyPermissionReview />);

    await user.click(screen.getByRole('button', { name: /Acknowledge scam-resistant/i }));

    expect(screen.getByText(/Safety guidance acknowledged/i)).toBeInTheDocument();
  });
});
