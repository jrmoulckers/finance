// SPDX-License-Identifier: BUSL-1.1

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '../routes';
import { BetaLanding } from './BetaLanding';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderBetaLanding() {
  return render(
    <MemoryRouter>
      <BetaLanding />
    </MemoryRouter>,
  );
}

describe('BetaLanding', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('mounts at the /beta route', async () => {
    render(
      <MemoryRouter initialEntries={['/beta']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Finance — Now in Beta' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up for the beta' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('transitions the status badge from degraded to operational when health passes', async () => {
    renderBetaLanding();

    expect(screen.getByText('🟡 Degraded')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('🟢 All systems operational')).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('shows a degraded badge when the health endpoint reports partial availability', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ status: 'degraded' }));

    renderBetaLanding();

    await waitFor(() => {
      expect(screen.getByText('🟡 Degraded')).toBeInTheDocument();
    });
  });

  it('shows a down badge when the health endpoint cannot be reached', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderBetaLanding();

    await waitFor(() => {
      expect(screen.getByText('🔴 Down')).toBeInTheDocument();
    });
  });

  it('only renders download cards for configured native URLs', async () => {
    vi.stubEnv('VITE_NATIVE_IOS_URL', 'https://example.com/testflight');
    vi.stubEnv('VITE_NATIVE_ANDROID_URL', '');
    vi.stubEnv('VITE_NATIVE_WINDOWS_URL', 'https://example.com/finance.msi');
    vi.stubEnv('VITE_NATIVE_MACOS_URL', '');

    renderBetaLanding();

    expect(screen.getByRole('link', { name: /iOS TestFlight/i })).toHaveAttribute(
      'href',
      'https://example.com/testflight',
    );
    expect(screen.getByRole('link', { name: /Windows MSI/i })).toHaveAttribute(
      'href',
      'https://example.com/finance.msi',
    );
    expect(screen.queryByRole('link', { name: /Android internal track/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /macOS DMG/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('🟢 All systems operational')).toBeInTheDocument();
    });
  });
});
