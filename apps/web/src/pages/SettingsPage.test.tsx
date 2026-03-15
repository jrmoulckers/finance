// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsPage } from './SettingsPage';

/** Stub URL.createObjectURL / revokeObjectURL since jsdom doesn't provide them. */
beforeEach(() => {
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SettingsPage', () => {
  it('renders without crashing', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('displays all settings sections', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Data')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Danger Zone')).toBeInTheDocument();
  });

  it('displays settings values', () => {
    render(<SettingsPage />);
    expect(screen.getByText('USD ($)')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
  });

  it('has accessible section landmarks', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('region', { name: /preferences/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /security/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /data/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /danger zone/i })).toBeInTheDocument();
  });

  it('renders the data export component within the Data section', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('button', { name: /export as json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export as csv/i })).toBeInTheDocument();
  });
});
