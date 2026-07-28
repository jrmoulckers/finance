// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsAboutPage } from './SettingsAboutPage';

function renderAbout(): void {
  render(
    <MemoryRouter>
      <SettingsAboutPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SettingsAboutPage', () => {
  it('renders a build date row and a release-notes link', () => {
    renderAbout();

    expect(screen.getByText('Build date')).toBeInTheDocument();
    expect(screen.getByText('Not recorded in this build')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open release notes/i })).toHaveAttribute(
      'href',
      'https://github.com/jrmoulckers/finance/releases',
    );
  });

  it('copies diagnostics to the clipboard and confirms success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
      userAgent: 'vitest-agent',
    });

    renderAbout();

    fireEvent.click(screen.getByRole('button', { name: /copy diagnostics for support/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const payload = writeText.mock.calls[0][0] as string;
    expect(payload).toMatch(/App version:/);
    expect(payload).toMatch(/Build SHA:/);
    expect(payload).toMatch(/vitest-agent/);
    expect(await screen.findByText('Copied ✓')).toBeInTheDocument();
  });

  it('shows a failure state when the clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', { userAgent: 'vitest-agent' });

    renderAbout();

    fireEvent.click(screen.getByRole('button', { name: /copy diagnostics for support/i }));

    expect(await screen.findByText('Copy failed')).toBeInTheDocument();
  });
});
