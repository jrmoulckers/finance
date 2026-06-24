// SPDX-License-Identifier: BUSL-1.1

import { calculateTripDeduction } from './calculator';
import type {
  PlatformAuditSummary,
  RoutePreset,
  ShiftStatus,
  TripEntry,
  TripEntryDraft,
  WorkShift,
  WorkShiftSummary,
} from './types';

/**
 * Pure shift-model functions for the delivery-driver mileage flow (#2137).
 *
 * A {@link WorkShift} groups multiple trip legs so a driver can
 * start/pause/resume/end a shift and attach mileage to a platform. Every
 * function here is side-effect free and uses integer math (milliseconds for
 * durations, cents for money) so the storage layer and UI can compose them.
 */

/**
 * Default recurring route presets/hotspots. A driver taps one to prefill the
 * start/end of a leg instead of typing it every time.
 */
export const DEFAULT_ROUTE_PRESETS: readonly RoutePreset[] = [
  { id: 'preset-home', kind: 'home', label: 'Home base', location: 'Home' },
  { id: 'preset-hotspot', kind: 'hotspot', label: 'Delivery hotspot', location: 'Hotspot' },
  {
    id: 'preset-store-cluster',
    kind: 'store-cluster',
    label: 'Store cluster',
    location: 'Store cluster',
  },
  { id: 'preset-gas-station', kind: 'gas-station', label: 'Gas station', location: 'Gas station' },
] as const;

const PRESET_KIND_LABELS: Record<RoutePreset['kind'], string> = {
  home: 'Home base',
  hotspot: 'Delivery hotspot',
  'store-cluster': 'Store cluster',
  'gas-station': 'Gas station',
};

export function getRoutePresetKindLabel(kind: RoutePreset['kind']): string {
  return PRESET_KIND_LABELS[kind];
}

function roundMiles(value: number): number {
  return Math.round(value * 10) / 10;
}

function generateShiftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `shift-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NaN;
  }

  return Date.parse(value);
}

/** Creates a new active shift for `platform`. Pure — caller persists it. */
export function createWorkShift(input: {
  platform: string;
  startedAt?: string;
  id?: string;
  notes?: string;
}): WorkShift {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const platform = input.platform.trim() || 'Unassigned';

  return {
    id: input.id ?? generateShiftId(),
    platform,
    status: 'active',
    startedAt,
    endedAt: null,
    pauses: [],
    legs: [],
    notes: input.notes?.trim() ?? '',
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

/** Pauses an active shift. No-op (returns input) if not active. */
export function pauseWorkShift(shift: WorkShift, at?: string): WorkShift {
  if (shift.status !== 'active') {
    return shift;
  }

  const pausedAt = at ?? new Date().toISOString();
  return {
    ...shift,
    status: 'paused',
    pauses: [...shift.pauses, { pausedAt, resumedAt: null }],
    updatedAt: pausedAt,
  };
}

/** Resumes a paused shift, closing the open pause window. */
export function resumeWorkShift(shift: WorkShift, at?: string): WorkShift {
  if (shift.status !== 'paused') {
    return shift;
  }

  const resumedAt = at ?? new Date().toISOString();
  const pauses = shift.pauses.map((pause, index) =>
    index === shift.pauses.length - 1 && pause.resumedAt === null ? { ...pause, resumedAt } : pause,
  );

  return {
    ...shift,
    status: 'active',
    pauses,
    updatedAt: resumedAt,
  };
}

/** Ends a shift, closing any open pause first so paused time isn't lost. */
export function endWorkShift(shift: WorkShift, at?: string): WorkShift {
  if (shift.status === 'ended') {
    return shift;
  }

  const endedAt = at ?? new Date().toISOString();
  const pauses = shift.pauses.map((pause, index) =>
    index === shift.pauses.length - 1 && pause.resumedAt === null
      ? { ...pause, resumedAt: endedAt }
      : pause,
  );

  return {
    ...shift,
    status: 'ended',
    endedAt,
    pauses,
    updatedAt: endedAt,
  };
}

/** Appends an already-validated trip leg to a shift. */
export function appendShiftLeg(shift: WorkShift, leg: TripEntry, at?: string): WorkShift {
  const updatedAt = at ?? new Date().toISOString();
  return {
    ...shift,
    legs: [...shift.legs, leg],
    updatedAt,
  };
}

/** Removes a leg by id. */
export function removeShiftLeg(shift: WorkShift, legId: string, at?: string): WorkShift {
  const legs = shift.legs.filter((leg) => leg.id !== legId);
  if (legs.length === shift.legs.length) {
    return shift;
  }

  return {
    ...shift,
    legs,
    updatedAt: at ?? new Date().toISOString(),
  };
}

/**
 * Active (working) duration in whole milliseconds: total elapsed minus every
 * paused window. Pausing then resuming never double-counts because each pause
 * window is subtracted exactly once.
 */
export function computeActiveDurationMs(shift: WorkShift, now?: string): number {
  const startMs = parseTimestamp(shift.startedAt);
  if (!Number.isFinite(startMs)) {
    return 0;
  }

  const referenceMs = parseTimestamp(now ?? new Date().toISOString());
  const endMs = shift.status === 'ended' ? parseTimestamp(shift.endedAt) : referenceMs;
  const boundedEnd = Number.isFinite(endMs) ? endMs : referenceMs;

  let pausedMs = 0;
  for (const pause of shift.pauses) {
    const pauseStart = parseTimestamp(pause.pausedAt);
    if (!Number.isFinite(pauseStart)) {
      continue;
    }

    const pauseEnd = pause.resumedAt === null ? boundedEnd : parseTimestamp(pause.resumedAt);
    const resolvedPauseEnd = Number.isFinite(pauseEnd) ? pauseEnd : boundedEnd;
    pausedMs += Math.max(0, resolvedPauseEnd - pauseStart);
  }

  return Math.max(0, Math.round(boundedEnd - startMs - pausedMs));
}

/** Sums a shift's leg miles, rounded to one decimal place. */
export function sumShiftMiles(shift: WorkShift): number {
  return roundMiles(shift.legs.reduce((total, leg) => total + leg.miles, 0));
}

/** Total IRS-rate deduction (cents) for a shift, reusing the calculator. */
export function sumShiftDeductionCents(shift: WorkShift): number {
  return shift.legs.reduce((total, leg) => total + calculateTripDeduction(leg).deductionCents, 0);
}

/** Driver-facing summary for one shift. */
export function summarizeWorkShift(shift: WorkShift, now?: string): WorkShiftSummary {
  return {
    shiftId: shift.id,
    platform: shift.platform,
    date: shift.startedAt.slice(0, 10),
    status: shift.status,
    legCount: shift.legs.length,
    miles: sumShiftMiles(shift),
    deductionCents: sumShiftDeductionCents(shift),
    activeDurationMs: computeActiveDurationMs(shift, now),
  };
}

/** Groups shifts by platform with summed miles + deduction. */
export function groupShiftsByPlatform(shifts: readonly WorkShift[]): PlatformAuditSummary[] {
  const byPlatform = new Map<string, PlatformAuditSummary>();

  for (const shift of shifts) {
    const existing = byPlatform.get(shift.platform) ?? {
      platform: shift.platform,
      shiftCount: 0,
      legCount: 0,
      miles: 0,
      deductionCents: 0,
    };

    existing.shiftCount += 1;
    existing.legCount += shift.legs.length;
    existing.miles = roundMiles(existing.miles + sumShiftMiles(shift));
    existing.deductionCents += sumShiftDeductionCents(shift);
    byPlatform.set(shift.platform, existing);
  }

  return [...byPlatform.values()].sort((left, right) =>
    left.platform.localeCompare(right.platform),
  );
}

/** Returns the most recent shift that is still in progress (active or paused). */
export function findInProgressShift(shifts: readonly WorkShift[]): WorkShift | null {
  return (
    [...shifts]
      .filter((shift) => shift.status !== 'ended')
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0] ?? null
  );
}

const STATUS_LABELS: Record<ShiftStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  ended: 'Ended',
};

export function getShiftStatusLabel(status: ShiftStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Builds a validated-shaped trip-leg draft from route presets so the UI can do
 * one-tap prefill of start/end instead of typing. Falls back to a preset's
 * own label/location when only one endpoint is chosen.
 */
export function buildLegDraftFromPresets(input: {
  startPreset?: RoutePreset | null;
  endPreset?: RoutePreset | null;
  miles?: number | null;
  date?: string;
  purpose?: TripEntry['purpose'];
  notes?: string;
  businessUsePercent?: number;
}): TripEntryDraft {
  const startLocation = input.startPreset?.location ?? '';
  const endLocation = input.endPreset?.location ?? '';

  return {
    date: input.date ?? new Date().toISOString().slice(0, 10),
    startLocation,
    endLocation,
    miles: input.miles ?? null,
    odometerStart: null,
    odometerEnd: null,
    purpose: input.purpose ?? 'business',
    notes: input.notes ?? '',
    businessUsePercent: input.businessUsePercent ?? 100,
  };
}
