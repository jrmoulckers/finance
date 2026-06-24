// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildLegDraftFromPresets, DEFAULT_ROUTE_PRESETS } from '../shifts';
import {
  addLegToWorkShift,
  deleteWorkShift,
  endShift,
  loadRoutePresets,
  loadWorkShifts,
  MILEAGE_SHIFTS_CHANGED_EVENT,
  pauseShift,
  resumeShift,
  startWorkShift,
} from '../shiftTracker';

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('shift tracker persistence', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'window',
      Object.assign(new EventTarget(), {
        localStorage: createLocalStorageMock(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists a full start -> pause -> resume -> log -> end flow', () => {
    const changeHandler = vi.fn();
    window.addEventListener(MILEAGE_SHIFTS_CHANGED_EVENT, changeHandler);

    const shift = startWorkShift({ platform: 'DoorDash' });
    expect(loadWorkShifts()).toHaveLength(1);

    pauseShift(shift.id);
    resumeShift(shift.id);

    const home = DEFAULT_ROUTE_PRESETS.find((preset) => preset.kind === 'home');
    const hotspot = DEFAULT_ROUTE_PRESETS.find((preset) => preset.kind === 'hotspot');
    const draft = buildLegDraftFromPresets({ startPreset: home, endPreset: hotspot, miles: 5 });

    const withLeg = addLegToWorkShift(shift.id, draft);
    expect(withLeg?.legs).toHaveLength(1);
    expect(withLeg?.legs[0]?.startLocation).toBe('Home');
    expect(withLeg?.legs[0]?.miles).toBe(5);

    const ended = endShift(shift.id);
    expect(ended?.status).toBe('ended');
    expect(ended?.endedAt).not.toBeNull();

    // start + pause + resume + addLeg + end = 5 writes.
    expect(changeHandler).toHaveBeenCalledTimes(5);
    window.removeEventListener(MILEAGE_SHIFTS_CHANGED_EVENT, changeHandler);
  });

  it('returns default route presets when none are stored', () => {
    expect(loadRoutePresets()).toEqual([...DEFAULT_ROUTE_PRESETS]);
  });

  it('deletes a shift', () => {
    const shift = startWorkShift({ platform: 'UberEats' });
    expect(deleteWorkShift(shift.id)).toBe(true);
    expect(loadWorkShifts()).toEqual([]);
  });
});
