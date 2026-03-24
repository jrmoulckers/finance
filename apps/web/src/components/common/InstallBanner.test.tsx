// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const installPromptMock = {
  canInstall: false,
  install: vi.fn().mockResolvedValue(undefined),
  dismissed: false,
  dismiss: vi.fn(),
};

vi.mock('../../hooks/useInstallPrompt', () => ({
  useInstallPrompt: () => installPromptMock,
}));

import { InstallBanner } from './InstallBanner';

describe('InstallBanner', () => {
  beforeEach(() => {
    installPromptMock.canInstall = false;
    installPromptMock.dismissed = false;
    installPromptMock.install.mockClear();
    installPromptMock.dismiss.mockClear();
  });

  it('renders nothing when the app is not installable', () => {
    const { container } = render(<InstallBanner />);

    expect(container.innerHTML).toBe('');
  });

  it('renders the install banner when the app is installable', () => {
    installPromptMock.canInstall = true;

    render(<InstallBanner />);

    expect(screen.getByText('Install Finance for quick access')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss install banner' })).toBeInTheDocument();
  });

  it('calls install when the Install button is clicked', () => {
    installPromptMock.canInstall = true;

    render(<InstallBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    expect(installPromptMock.install).toHaveBeenCalledTimes(1);
  });

  it('calls dismiss when the dismiss button is clicked', () => {
    installPromptMock.canInstall = true;

    render(<InstallBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss install banner' }));

    expect(installPromptMock.dismiss).toHaveBeenCalledTimes(1);
  });

  it('has an accessible complementary region with a descriptive label', () => {
    installPromptMock.canInstall = true;

    render(<InstallBanner />);

    const region = screen.getByRole('complementary', { name: 'Install application' });
    expect(region).toBeInTheDocument();
  });

  it('renders nothing when dismissed', () => {
    installPromptMock.canInstall = false;
    installPromptMock.dismissed = true;

    const { container } = render(<InstallBanner />);

    expect(container.innerHTML).toBe('');
  });
});
