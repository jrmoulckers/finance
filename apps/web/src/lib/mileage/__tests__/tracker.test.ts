// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MILEAGE_TRIPS_CHANGED_EVENT,
  createMileageTrip,
  deleteMileageTrip,
  loadMileageTrips,
  updateMileageTrip,
} from '../tracker';

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

describe('mileage tracker', () => {
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

  it('creates and persists mileage trips using odometer readings', () => {
    const created = createMileageTrip({
      date: '2024-03-12',
      startLocation: 'Home Office',
      endLocation: 'Client HQ',
      odometerStart: 12_500.1,
      odometerEnd: 12_518.6,
      purpose: 'business',
      businessUsePercent: 75,
      notes: 'Quarterly review',
    });

    expect(created.miles).toBe(18.5);
    expect(created.businessUsePercent).toBe(75);
    expect(loadMileageTrips()).toEqual([created]);
  });

  it('updates direct-mileage entries and removes them', () => {
    const created = createMileageTrip({
      date: '2024-04-09',
      startLocation: 'Coworking',
      endLocation: 'Airport',
      miles: 12.25,
      purpose: 'business',
      businessUsePercent: 100,
      notes: '',
    });

    const updated = updateMileageTrip(created.id, {
      date: created.date,
      startLocation: created.startLocation,
      endLocation: created.endLocation,
      miles: 10.5,
      odometerStart: null,
      odometerEnd: null,
      purpose: created.purpose,
      businessUsePercent: created.businessUsePercent,
      notes: 'Mileage adjusted after map review',
    });

    expect(updated?.miles).toBe(10.5);
    expect(updated?.notes).toContain('map review');
    expect(deleteMileageTrip(created.id)).toBe(true);
    expect(loadMileageTrips()).toEqual([]);
  });

  it('dispatches a browser event when trip data changes', () => {
    const handler = vi.fn();
    window.addEventListener(MILEAGE_TRIPS_CHANGED_EVENT, handler);

    const created = createMileageTrip({
      date: '2024-05-01',
      startLocation: 'Home',
      endLocation: 'Hospital',
      miles: 8,
      purpose: 'medical',
      notes: '',
    });
    deleteMileageTrip(created.id);

    expect(handler).toHaveBeenCalledTimes(2);
    window.removeEventListener(MILEAGE_TRIPS_CHANGED_EVENT, handler);
  });
});
