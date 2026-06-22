// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the useRemittances hook (issue #2170).
 *
 * The hook is edge/client-side only — it persists to localStorage, so these
 * tests exercise the real (jsdom) localStorage rather than mocking a repository.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useRemittances } from './useRemittances';
import type { CreateRemittanceInput } from '../lib/remittance';

function input(overrides: Partial<CreateRemittanceInput> = {}): CreateRemittanceInput {
  return {
    date: '2026-06-01',
    sourceCurrency: 'USD',
    destCurrency: 'MXN',
    sendAmountMinor: 50_000,
    feeMinor: 500,
    fxRate: 17.0,
    feeModel: 'ADDITIVE',
    referenceRate: 17.5,
    recipient: { name: 'Familia', country: 'MX' },
    note: null,
    ...overrides,
  };
}

describe('useRemittances', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty', () => {
    const { result } = renderHook(() => useRemittances());
    expect(result.current.remittances).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.summary.count).toBe(0);
  });

  it('creates a remittance and updates the summary', () => {
    const { result } = renderHook(() => useRemittances());

    act(() => {
      result.current.createRemittance(input());
    });

    expect(result.current.remittances).toHaveLength(1);
    expect(result.current.summary.count).toBe(1);
    expect(result.current.summary.sentByCurrency).toEqual({ USD: 50_500 });
    expect(result.current.summary.receivedByCurrency).toEqual({ MXN: 850_000 });
    expect(result.current.remittances[0]?.id).toBeTruthy();
  });

  it('persists across hook remounts (localStorage)', () => {
    const first = renderHook(() => useRemittances());
    act(() => {
      first.result.current.createRemittance(input());
    });
    first.unmount();

    const second = renderHook(() => useRemittances());
    expect(second.result.current.remittances).toHaveLength(1);
  });

  it('orders the most recent send date first', () => {
    const { result } = renderHook(() => useRemittances());
    act(() => {
      result.current.createRemittance(input({ date: '2026-05-01' }));
    });
    act(() => {
      result.current.createRemittance(input({ date: '2026-06-15' }));
    });
    expect(result.current.remittances[0]?.date).toBe('2026-06-15');
    expect(result.current.remittances[1]?.date).toBe('2026-05-01');
  });

  it('deletes a remittance by id', () => {
    const { result } = renderHook(() => useRemittances());
    let id = '';
    act(() => {
      id = result.current.createRemittance(input())?.id ?? '';
    });
    expect(result.current.remittances).toHaveLength(1);

    act(() => {
      result.current.deleteRemittance(id);
    });
    expect(result.current.remittances).toHaveLength(0);
    expect(result.current.summary.count).toBe(0);
  });
});
