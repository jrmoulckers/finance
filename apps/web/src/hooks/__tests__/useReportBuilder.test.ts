// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReportBuilder } from '../useReportBuilder';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useReportBuilder', () => {
  it('initializes with default config', () => {
    const { result } = renderHook(() => useReportBuilder());

    expect(result.current.config.name).toBe('Custom Report');
    expect(result.current.config.fields.length).toBe(9);
    expect(result.current.config.exportFormat).toBe('csv');
    expect(result.current.config.groupBy).toBe('none');
    expect(result.current.preview).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('has 5 visible fields by default', () => {
    const { result } = renderHook(() => useReportBuilder());

    const visibleFields = result.current.config.fields.filter((f) => f.visible);
    expect(visibleFields).toHaveLength(5);
    expect(visibleFields.map((f) => f.type)).toEqual([
      'date',
      'payee',
      'amount',
      'category',
      'account',
    ]);
  });

  it('sets report name', () => {
    const { result } = renderHook(() => useReportBuilder());

    act(() => {
      result.current.setReportName('Monthly Expense Report');
    });

    expect(result.current.config.name).toBe('Monthly Expense Report');
  });

  it('adds a field', () => {
    const { result } = renderHook(() => useReportBuilder());

    act(() => {
      result.current.addField('note');
    });

    const noteField = result.current.config.fields.find((f) => f.type === 'note');
    expect(noteField?.visible).toBe(true);
  });

  it('removes a field', () => {
    const { result } = renderHook(() => useReportBuilder());

    act(() => {
      result.current.removeField('field-payee');
    });

    const payeeField = result.current.config.fields.find((f) => f.id === 'field-payee');
    expect(payeeField?.visible).toBe(false);
  });

  it('reorders fields', () => {
    const { result } = renderHook(() => useReportBuilder());

    act(() => {
      result.current.reorderFields(0, 2);
    });

    const visible = result.current.config.fields
      .filter((f) => f.visible)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    // Date was at 0, moved to 2. So payee(0), amount(1), date(2)
    expect(visible[0]?.type).toBe('payee');
    expect(visible[1]?.type).toBe('amount');
    expect(visible[2]?.type).toBe('date');
  });

  it('sets date range', () => {
    const { result } = renderHook(() => useReportBuilder());

    act(() => {
      result.current.setDateRange('2025-01-01', '2025-01-31');
    });

    expect(result.current.config.startDate).toBe('2025-01-01');
    expect(result.current.config.endDate).toBe('2025-01-31');
  });

  it('sets group by', () => {
    const { result } = renderHook(() => useReportBuilder());

    act(() => {
      result.current.setGroupBy('category');
    });

    expect(result.current.config.groupBy).toBe('category');
  });

  it('sets export format', () => {
    const { result } = renderHook(() => useReportBuilder());

    act(() => {
      result.current.setExportFormat('pdf');
    });

    expect(result.current.config.exportFormat).toBe('pdf');
  });

  it('generates preview', () => {
    const { result } = renderHook(() => useReportBuilder());

    act(() => {
      result.current.generatePreview();
    });

    expect(result.current.preview).not.toBeNull();
    expect(result.current.preview!.headers.length).toBeGreaterThan(0);
    expect(result.current.preview!.rows.length).toBeGreaterThan(0);
  });

  it('exports CSV', () => {
    const { result } = renderHook(() => useReportBuilder());

    act(() => {
      result.current.generatePreview();
    });

    let url: string | null;
    act(() => {
      url = result.current.exportReport();
    });

    expect(url!).toMatch(/^data:text\/csv/);
  });

  it('returns null when exporting without preview', () => {
    const { result } = renderHook(() => useReportBuilder());

    let url: string | null;
    act(() => {
      url = result.current.exportReport();
    });

    expect(url!).toBeNull();
    expect(result.current.error).toBe('Generate a preview first before exporting.');
  });

  it('resets config', () => {
    const { result } = renderHook(() => useReportBuilder());

    act(() => {
      result.current.setReportName('Changed');
      result.current.generatePreview();
    });

    act(() => {
      result.current.resetConfig();
    });

    expect(result.current.config.name).toBe('Custom Report');
    expect(result.current.preview).toBeNull();
  });

  it('toggles field visibility', () => {
    const { result } = renderHook(() => useReportBuilder());

    act(() => {
      result.current.toggleFieldVisibility('field-date');
    });

    const dateField = result.current.config.fields.find((f) => f.id === 'field-date');
    expect(dateField?.visible).toBe(false);

    act(() => {
      result.current.toggleFieldVisibility('field-date');
    });

    const dateField2 = result.current.config.fields.find((f) => f.id === 'field-date');
    expect(dateField2?.visible).toBe(true);
  });
});
