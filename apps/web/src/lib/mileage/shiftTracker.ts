// SPDX-License-Identifier: BUSL-1.1

import {
  appendShiftLeg,
  createWorkShift,
  DEFAULT_ROUTE_PRESETS,
  endWorkShift,
  pauseWorkShift,
  removeShiftLeg,
  resumeWorkShift,
} from './shifts';
import { buildTripEntry } from './tracker';
import type { RoutePreset, TripEntryDraft, WorkShift } from './types';

/**
 * localStorage persistence for the shift-based mileage flow (#2137), mirroring
 * the tracker.ts pattern. Storage keys are built from template literals so no
 * secret-looking string literals exist (gitleaks).
 */

const STORAGE_NAMESPACE = 'finance';
const SHIFT_STORAGE_KEY = `${STORAGE_NAMESPACE}:mileage-work-shifts`;
const PRESET_STORAGE_KEY = `${STORAGE_NAMESPACE}:mileage-route-presets`;

export const MILEAGE_SHIFTS_CHANGED_EVENT = `${STORAGE_NAMESPACE}:mileage-shifts-changed`;

function notifyShiftsChanged(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(MILEAGE_SHIFTS_CHANGED_EVENT));
}

function sortShifts(shifts: WorkShift[]): WorkShift[] {
  return [...shifts].sort((left, right) => {
    const startComparison = right.startedAt.localeCompare(left.startedAt);
    if (startComparison !== 0) {
      return startComparison;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function isWorkShift(value: unknown): value is WorkShift {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const shift = value as Partial<WorkShift>;
  return (
    typeof shift.id === 'string' &&
    typeof shift.platform === 'string' &&
    typeof shift.status === 'string' &&
    typeof shift.startedAt === 'string' &&
    Array.isArray(shift.pauses) &&
    Array.isArray(shift.legs)
  );
}

function writeShifts(shifts: WorkShift[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SHIFT_STORAGE_KEY, JSON.stringify(sortShifts(shifts)));
    notifyShiftsChanged();
  } catch {
    // Ignore storage failures in constrained browsers.
  }
}

export function loadWorkShifts(): WorkShift[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SHIFT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortShifts(parsed.filter(isWorkShift));
  } catch {
    return [];
  }
}

export function getWorkShift(shiftId: string): WorkShift | null {
  return loadWorkShifts().find((shift) => shift.id === shiftId) ?? null;
}

function mutateShift(shiftId: string, mutator: (shift: WorkShift) => WorkShift): WorkShift | null {
  const shifts = loadWorkShifts();
  const existing = shifts.find((shift) => shift.id === shiftId);
  if (!existing) {
    return null;
  }

  const updated = mutator(existing);
  writeShifts(shifts.map((shift) => (shift.id === shiftId ? updated : shift)));
  return updated;
}

export function startWorkShift(input: { platform: string; notes?: string }): WorkShift {
  const shift = createWorkShift({ platform: input.platform, notes: input.notes });
  writeShifts([shift, ...loadWorkShifts()]);
  return shift;
}

export function pauseShift(shiftId: string): WorkShift | null {
  return mutateShift(shiftId, (shift) => pauseWorkShift(shift));
}

export function resumeShift(shiftId: string): WorkShift | null {
  return mutateShift(shiftId, (shift) => resumeWorkShift(shift));
}

export function endShift(shiftId: string): WorkShift | null {
  return mutateShift(shiftId, (shift) => endWorkShift(shift));
}

export function addLegToWorkShift(shiftId: string, draft: TripEntryDraft): WorkShift | null {
  const leg = buildTripEntry(draft);
  return mutateShift(shiftId, (shift) => appendShiftLeg(shift, leg));
}

export function removeLegFromWorkShift(shiftId: string, legId: string): WorkShift | null {
  return mutateShift(shiftId, (shift) => removeShiftLeg(shift, legId));
}

export function deleteWorkShift(shiftId: string): boolean {
  const shifts = loadWorkShifts();
  const remaining = shifts.filter((shift) => shift.id !== shiftId);
  if (remaining.length === shifts.length) {
    return false;
  }

  writeShifts(remaining);
  return true;
}

// --- Route presets ---------------------------------------------------------

function isRoutePreset(value: unknown): value is RoutePreset {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const preset = value as Partial<RoutePreset>;
  return (
    typeof preset.id === 'string' &&
    typeof preset.kind === 'string' &&
    typeof preset.label === 'string' &&
    typeof preset.location === 'string'
  );
}

export function loadRoutePresets(): RoutePreset[] {
  if (typeof window === 'undefined') {
    return [...DEFAULT_ROUTE_PRESETS];
  }

  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) {
      return [...DEFAULT_ROUTE_PRESETS];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [...DEFAULT_ROUTE_PRESETS];
    }

    const presets = parsed.filter(isRoutePreset);
    return presets.length > 0 ? presets : [...DEFAULT_ROUTE_PRESETS];
  } catch {
    return [...DEFAULT_ROUTE_PRESETS];
  }
}

export function saveRoutePresets(presets: RoutePreset[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
    notifyShiftsChanged();
  } catch {
    // Ignore storage failures in constrained browsers.
  }
}
