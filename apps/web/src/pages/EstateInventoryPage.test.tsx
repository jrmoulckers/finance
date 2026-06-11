// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { PrivacyModeProvider } from '../contexts/PrivacyModeContext';
import { ESTATE_ACCESS_INFO_STORAGE_KEY } from '../lib/estate/accessInfo';
import { ESTATE_INVENTORY_STORAGE_KEY } from '../lib/estate/inventory';
import { EstateInventoryPage } from './EstateInventoryPage';

function renderPage() {
  return render(
    <PrivacyModeProvider>
      <EstateInventoryPage />
    </PrivacyModeProvider>,
  );
}

describe('EstateInventoryPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => '22222222-2222-4222-8222-222222222222');
  });

  it('renders the inventory page title and checklist coverage', () => {
    renderPage();

    expect(screen.getByText(/Estate & end-of-life financial inventory/i)).toBeTruthy();
    expect(screen.getByText('0 of 8 categories documented')).toBeTruthy();
  });

  it('creates and persists a new bank account entry', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /add bank accounts entry/i }));
    fireEvent.change(screen.getByLabelText('Institution'), {
      target: { value: 'First National Bank' },
    });
    fireEvent.change(screen.getByLabelText('Account type'), {
      target: { value: 'Checking' },
    });
    fireEvent.change(screen.getByLabelText('Approximate balance'), {
      target: { value: '25000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));

    expect(
      screen.getByRole('heading', {
        name: 'First National Bank',
      }),
    ).toBeTruthy();
    expect(screen.getByText('1 of 8 categories documented')).toBeTruthy();

    const raw = window.localStorage.getItem(ESTATE_INVENTORY_STORAGE_KEY);
    expect(raw).toContain('First National Bank');
  });

  it('persists trusted contact instructions locally', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('First instructions'), {
      target: { value: 'Call the attorney, then check the fire safe.' },
    });

    expect(window.localStorage.getItem(ESTATE_ACCESS_INFO_STORAGE_KEY)).toContain('fire safe');
  });
});
