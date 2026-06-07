// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for PrivacyDashboardPage.
 *
 * Mocks hooks (not repositories) per project conventions.
 * Tests loading, error, empty, and data-present states.
 *
 * References: issue #1636
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PrivacyDashboardPage from './PrivacyDashboardPage';
import { useConsent } from '../hooks/useConsent';
import { useConsentHistory } from '../hooks/useConsentHistory';
import { usePrivacyDashboard } from '../hooks/usePrivacyDashboard';
import type { DataCategory } from '../hooks/usePrivacyDashboard';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../hooks/useConsent', () => ({
  useConsent: vi.fn(),
}));

vi.mock('../hooks/useConsentHistory', () => ({
  useConsentHistory: vi.fn(),
}));

vi.mock('../hooks/usePrivacyDashboard', () => ({
  usePrivacyDashboard: vi.fn(),
}));

vi.mock('../components/gdpr/ConsentHistoryViewer', () => ({
  ConsentHistoryViewer: () => <div data-testid="consent-history-viewer">History</div>,
}));

const mockedUseConsent = vi.mocked(useConsent);
const mockedUseConsentHistory = vi.mocked(useConsentHistory);
const mockedUsePrivacyDashboard = vi.mocked(usePrivacyDashboard);

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const mockConsent = {
  categories: {
    essential: true,
    analytics: false,
    error_reporting: true,
    sync: false,
    marketing: false,
  },
  timestamp: '2024-01-15T10:00:00.000Z',
  policyVersion: '1.0.0',
  method: 'settings' as const,
  hasCompletedFirstRun: true,
};

const mockCategories: DataCategory[] = [
  {
    id: 'accounts',
    name: 'Financial Accounts',
    description: 'Bank accounts and credit cards.',
    storageLocation: 'SQLite (OPFS)' as const,
    leavesDevice: false,
    icon: 'bank',
    estimatedBytes: 0,
  },
  {
    id: 'settings',
    name: 'App Settings',
    description: 'Your preferences.',
    storageLocation: 'localStorage' as const,
    leavesDevice: false,
    icon: 'settings',
    estimatedBytes: 512,
  },
];

beforeEach(() => {
  vi.clearAllMocks();

  mockedUseConsent.mockReturnValue({
    consent: mockConsent,
    needsConsent: false,
    hasCompleted: true,
    updateCategory: vi.fn(),
    acceptAll: vi.fn(),
    rejectAll: vi.fn(),
    savePreferences: vi.fn(),
    refresh: vi.fn(),
  });

  mockedUseConsentHistory.mockReturnValue({
    history: [],
    loading: false,
    recordChange: vi.fn(),
    recordBulkChanges: vi.fn(),
    exportHistory: vi.fn(),
    clearHistory: vi.fn(),
    refresh: vi.fn(),
  });

  mockedUsePrivacyDashboard.mockReturnValue({
    categories: mockCategories,
    totalStorageEstimate: 512,
    storageQuota: { quota: 1073741824, usage: 5242880, usagePercent: 0.49 },
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrivacyDashboardPage', () => {
  it('renders the page title', () => {
    render(<PrivacyDashboardPage />);
    expect(screen.getByRole('heading', { name: /privacy dashboard/i })).toBeDefined();
  });

  it('displays storage usage bar', () => {
    render(<PrivacyDashboardPage />);
    expect(screen.getByRole('progressbar')).toBeDefined();
  });

  it('renders data category cards', () => {
    render(<PrivacyDashboardPage />);
    expect(screen.getByText('Financial Accounts')).toBeDefined();
    expect(screen.getByText('App Settings')).toBeDefined();
  });

  it('displays consent toggles', () => {
    render(<PrivacyDashboardPage />);
    const analyticsCheckbox = screen.getByLabelText(/consent for Analytics/i);
    expect(analyticsCheckbox).toBeDefined();
  });

  it('shows loading state', () => {
    mockedUsePrivacyDashboard.mockReturnValue({
      categories: [],
      totalStorageEstimate: 0,
      storageQuota: null,
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(<PrivacyDashboardPage />);
    expect(screen.getByText(/loading data inventory/i)).toBeDefined();
  });

  it('shows error state', () => {
    mockedUsePrivacyDashboard.mockReturnValue({
      categories: [],
      totalStorageEstimate: 0,
      storageQuota: null,
      loading: false,
      error: 'Something went wrong',
      refresh: vi.fn(),
    });

    render(<PrivacyDashboardPage />);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('renders consent history viewer', () => {
    render(<PrivacyDashboardPage />);
    expect(screen.getByTestId('consent-history-viewer')).toBeDefined();
  });

  it('calls updateCategory when toggling consent', () => {
    const updateCategory = vi.fn();
    mockedUseConsent.mockReturnValue({
      consent: mockConsent,
      needsConsent: false,
      hasCompleted: true,
      updateCategory,
      acceptAll: vi.fn(),
      rejectAll: vi.fn(),
      savePreferences: vi.fn(),
      refresh: vi.fn(),
    });

    render(<PrivacyDashboardPage />);
    const analyticsCheckbox = screen.getByLabelText(/consent for Analytics/i);
    fireEvent.click(analyticsCheckbox);
    expect(updateCategory).toHaveBeenCalledWith('analytics', true);
  });

  it('renders data rights section with links', () => {
    render(<PrivacyDashboardPage />);
    expect(screen.getByText(/export your data/i)).toBeDefined();
    expect(screen.getByText(/delete your data/i)).toBeDefined();
  });
});
