// SPDX-License-Identifier: BUSL-1.1

import type { TripEntry, TripEntryDraft } from './types';

const STORAGE_KEY = 'finance:mileage-trips';
export const MILEAGE_TRIPS_CHANGED_EVENT = 'finance:mileage-trips-changed';

function roundMiles(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizePercent(value: number | undefined, purpose: TripEntry['purpose']): number {
  if (purpose !== 'business') {
    return 100;
  }

  if (value === undefined || Number.isNaN(value)) {
    return 100;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function generateTripId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `trip-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function notifyMileageTripsChanged(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(MILEAGE_TRIPS_CHANGED_EVENT));
}

function sortTrips(entries: TripEntry[]): TripEntry[] {
  return [...entries].sort((left, right) => {
    const dateComparison = right.date.localeCompare(left.date);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function sanitizeTripEntry(input: TripEntryDraft, existing?: TripEntry): TripEntry {
  const date = input.date.trim();
  const startLocation = input.startLocation.trim();
  const endLocation = input.endLocation.trim();
  const purpose = input.purpose;

  if (!date) {
    throw new Error('Trip date is required.');
  }

  if (!startLocation || !endLocation) {
    throw new Error('Start and end locations are required.');
  }

  const miles = calculateTripMiles(input);
  const now = new Date().toISOString();

  return {
    id: existing?.id ?? generateTripId(),
    date,
    startLocation,
    endLocation,
    miles,
    odometerStart: input.odometerStart ?? null,
    odometerEnd: input.odometerEnd ?? null,
    purpose,
    notes: input.notes?.trim() ?? '',
    businessUsePercent: normalizePercent(input.businessUsePercent, purpose),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function writeTrips(entries: TripEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sortTrips(entries)));
    notifyMileageTripsChanged();
  } catch {
    // Ignore storage failures in constrained browsers.
  }
}

export function calculateTripMiles(
  input: Pick<TripEntryDraft, 'miles' | 'odometerStart' | 'odometerEnd'>,
): number {
  if (input.miles !== undefined && input.miles !== null && input.miles !== 0) {
    if (!Number.isFinite(input.miles) || input.miles < 0) {
      throw new Error('Miles must be a positive number.');
    }

    return roundMiles(input.miles);
  }

  if (input.odometerStart !== undefined && input.odometerStart !== null) {
    if (input.odometerEnd === undefined || input.odometerEnd === null) {
      throw new Error('Ending odometer is required when using odometer readings.');
    }

    if (input.odometerEnd < input.odometerStart) {
      throw new Error('Ending odometer must be greater than or equal to starting odometer.');
    }

    return roundMiles(input.odometerEnd - input.odometerStart);
  }

  throw new Error('Enter miles directly or provide odometer readings.');
}

export function loadMileageTrips(): TripEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as TripEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortTrips(
      parsed.filter((entry): entry is TripEntry => {
        return (
          typeof entry?.id === 'string' &&
          typeof entry?.date === 'string' &&
          typeof entry?.startLocation === 'string' &&
          typeof entry?.endLocation === 'string' &&
          typeof entry?.miles === 'number' &&
          typeof entry?.purpose === 'string' &&
          typeof entry?.businessUsePercent === 'number' &&
          typeof entry?.createdAt === 'string' &&
          typeof entry?.updatedAt === 'string'
        );
      }),
    );
  } catch {
    return [];
  }
}

export function getMileageTrip(tripId: string): TripEntry | null {
  return loadMileageTrips().find((trip) => trip.id === tripId) ?? null;
}

export function createMileageTrip(input: TripEntryDraft): TripEntry {
  const entries = loadMileageTrips();
  const createdTrip = sanitizeTripEntry(input);
  writeTrips([createdTrip, ...entries]);
  return createdTrip;
}

export function updateMileageTrip(
  tripId: string,
  updates: Partial<TripEntryDraft>,
): TripEntry | null {
  const entries = loadMileageTrips();
  const existingTrip = entries.find((trip) => trip.id === tripId);
  if (!existingTrip) {
    return null;
  }

  const updatedTrip = sanitizeTripEntry(
    {
      date: updates.date ?? existingTrip.date,
      startLocation: updates.startLocation ?? existingTrip.startLocation,
      endLocation: updates.endLocation ?? existingTrip.endLocation,
      miles: updates.miles ?? existingTrip.miles,
      odometerStart:
        updates.odometerStart !== undefined ? updates.odometerStart : existingTrip.odometerStart,
      odometerEnd:
        updates.odometerEnd !== undefined ? updates.odometerEnd : existingTrip.odometerEnd,
      purpose: updates.purpose ?? existingTrip.purpose,
      notes: updates.notes ?? existingTrip.notes,
      businessUsePercent: updates.businessUsePercent ?? existingTrip.businessUsePercent,
    },
    existingTrip,
  );

  writeTrips(entries.map((trip) => (trip.id === tripId ? updatedTrip : trip)));
  return updatedTrip;
}

export function deleteMileageTrip(tripId: string): boolean {
  const entries = loadMileageTrips();
  const remainingTrips = entries.filter((trip) => trip.id !== tripId);
  if (remainingTrips.length === entries.length) {
    return false;
  }

  writeTrips(remainingTrips);
  return true;
}
