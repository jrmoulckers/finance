// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  createSinkingFundRepository,
  type SinkingFundKeyValueStorage,
} from '../sinking-fund-repository';

function memoryStorage(): SinkingFundKeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

describe('sinking fund repository', () => {
  it('creates updates archives and filters by household', () => {
    const repo = createSinkingFundRepository(memoryStorage());
    const car = repo.create({
      id: 'fund-car',
      householdId: 'household-1',
      name: 'Car insurance',
      targetCents: 120_000,
      savedCents: 10_000,
      dueDate: '2025-12-01',
      linkedCategoryId: 'cat-car',
    });
    repo.create({
      id: 'fund-other',
      householdId: 'household-2',
      name: 'Other',
      targetCents: 50_000,
      dueDate: '2025-10-01',
      linkedCategoryId: 'cat-other',
    });

    expect(car).toMatchObject({ targetCents: 120_000, cadence: 'MONTHLY', isArchived: false });
    expect(repo.update('fund-car', { savedCents: 25_000 })?.savedCents).toBe(25_000);
    expect(repo.listByHousehold('household-1').map((fund) => fund.id)).toEqual(['fund-car']);
    expect(repo.archive('fund-car')?.isArchived).toBe(true);
    expect(repo.listByHousehold('household-1')).toEqual([]);
    expect(
      repo.listByHousehold('household-1', { includeArchived: true }).map((fund) => fund.id),
    ).toEqual(['fund-car']);
  });
});
