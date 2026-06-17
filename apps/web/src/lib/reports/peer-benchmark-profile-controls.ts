// SPDX-License-Identifier: BUSL-1.1

import type { PeerBenchmarkProfile } from './peer-benchmarks';

/** Local opt-in profile control model for peer benchmark insights (#2630). */

export interface PeerBenchmarkProfileStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

export interface PeerBenchmarkProfileField {
  readonly id: keyof Omit<PeerBenchmarkProfile, 'optedIn'>;
  readonly label: string;
  readonly value: string;
  readonly helperText: string;
}

export interface PeerBenchmarkProfileControlsModel {
  readonly optedIn: boolean;
  readonly fields: readonly PeerBenchmarkProfileField[];
  readonly primaryActionLabel: string;
  readonly clearActionLabel: string;
  readonly dataUseCopy: string;
  readonly fallbackCopy: string;
}

export const PEER_BENCHMARK_PROFILE_STORAGE_KEY = 'finance.peerBenchmarkProfile.v1';

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanHouseholdSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : undefined;
}

export function sanitizePeerBenchmarkProfile(profile: PeerBenchmarkProfile): PeerBenchmarkProfile {
  return {
    optedIn: profile.optedIn === true,
    householdSize: cleanHouseholdSize(profile.householdSize),
    incomeBand: cleanString(profile.incomeBand),
    region: cleanString(profile.region),
    lifeStage: cleanString(profile.lifeStage),
  };
}

export function loadPeerBenchmarkProfile(
  storage: PeerBenchmarkProfileStorage,
  key = PEER_BENCHMARK_PROFILE_STORAGE_KEY,
): PeerBenchmarkProfile {
  const raw = storage.getItem(key);
  if (!raw) return { optedIn: false };
  try {
    const parsed = JSON.parse(raw) as PeerBenchmarkProfile;
    return sanitizePeerBenchmarkProfile(parsed);
  } catch {
    return { optedIn: false };
  }
}

export function savePeerBenchmarkProfile(
  storage: PeerBenchmarkProfileStorage,
  profile: PeerBenchmarkProfile,
  key = PEER_BENCHMARK_PROFILE_STORAGE_KEY,
): PeerBenchmarkProfile {
  const sanitized = sanitizePeerBenchmarkProfile(profile);
  storage.setItem(key, JSON.stringify(sanitized));
  return sanitized;
}

export function clearStoredPeerBenchmarkProfile(
  storage: PeerBenchmarkProfileStorage,
  key = PEER_BENCHMARK_PROFILE_STORAGE_KEY,
): PeerBenchmarkProfile {
  storage.removeItem(key);
  return { optedIn: false };
}

export function buildPeerBenchmarkProfileControlsModel(
  profile: PeerBenchmarkProfile,
): PeerBenchmarkProfileControlsModel {
  const sanitized = sanitizePeerBenchmarkProfile(profile);
  return {
    optedIn: sanitized.optedIn,
    fields: [
      {
        id: 'householdSize',
        label: 'Household size',
        value: sanitized.householdSize?.toString() ?? '',
        helperText: 'Used locally to choose an optional peer cohort.',
      },
      {
        id: 'incomeBand',
        label: 'Income band',
        value: sanitized.incomeBand ?? '',
        helperText: 'Choose a broad range; exact income is not required.',
      },
      {
        id: 'region',
        label: 'Region',
        value: sanitized.region ?? '',
        helperText: 'Optional broad geography for cohort matching.',
      },
      {
        id: 'lifeStage',
        label: 'Life stage',
        value: sanitized.lifeStage ?? '',
        helperText: 'Optional context such as student, family, or retired.',
      },
    ],
    primaryActionLabel: sanitized.optedIn ? 'Update peer benchmark profile' : 'Opt in to peer benchmarks',
    clearActionLabel: 'Clear peer benchmark profile',
    dataUseCopy:
      'Peer comparisons appear only after you opt in. Cohort inputs stay local and can be cleared at any time.',
    fallbackCopy: 'When peer benchmarks are off, insights continue to use the default 50/30/20 baseline.',
  };
}
