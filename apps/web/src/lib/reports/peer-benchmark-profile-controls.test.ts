// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildPeerBenchmarkProfileControlsModel,
  clearStoredPeerBenchmarkProfile,
  loadPeerBenchmarkProfile,
  savePeerBenchmarkProfile,
  type PeerBenchmarkProfileStorage,
} from './peer-benchmark-profile-controls';

function makeStorage(): PeerBenchmarkProfileStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('peer benchmark profile controls', () => {
  it('persists, loads, and clears an explicit opt-in profile locally', () => {
    const storage = makeStorage();

    const saved = savePeerBenchmarkProfile(storage, {
      optedIn: true,
      householdSize: 2.2,
      incomeBand: ' 75k-100k ',
      region: 'Midwest',
    });

    expect(saved).toEqual({
      optedIn: true,
      householdSize: 2,
      incomeBand: '75k-100k',
      region: 'Midwest',
      lifeStage: undefined,
    });
    expect(loadPeerBenchmarkProfile(storage)).toEqual(saved);
    expect(clearStoredPeerBenchmarkProfile(storage)).toEqual({ optedIn: false });
    expect(loadPeerBenchmarkProfile(storage)).toEqual({ optedIn: false });
  });

  it('builds neutral control copy and default fallback copy', () => {
    const model = buildPeerBenchmarkProfileControlsModel({ optedIn: false });

    expect(model.primaryActionLabel).toBe('Opt in to peer benchmarks');
    expect(model.fallbackCopy).toContain('50/30/20 baseline');
    expect(model.dataUseCopy).toContain('only after you opt in');
    expect(model.fields.map((field) => field.id)).toEqual([
      'householdSize',
      'incomeBand',
      'region',
      'lifeStage',
    ]);
  });
});
