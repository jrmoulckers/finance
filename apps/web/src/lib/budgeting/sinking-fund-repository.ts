// SPDX-License-Identifier: BUSL-1.1

export type SinkingFundRepositoryCadence = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

export interface SinkingFundRepositoryDto {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
  readonly targetCents: number;
  readonly savedCents: number;
  readonly dueDate: string;
  readonly cadence: SinkingFundRepositoryCadence;
  readonly linkedCategoryId: string;
  readonly isArchived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt?: string | null;
}

export interface SinkingFundRepositoryInput {
  readonly id?: string;
  readonly householdId: string;
  readonly name: string;
  readonly targetCents: number;
  readonly savedCents?: number;
  readonly dueDate: string;
  readonly cadence?: SinkingFundRepositoryCadence;
  readonly linkedCategoryId: string;
}

export interface SinkingFundKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SinkingFundRepository {
  create(input: SinkingFundRepositoryInput): SinkingFundRepositoryDto;
  update(
    id: string,
    updates: Partial<Omit<SinkingFundRepositoryInput, 'id'>>,
  ): SinkingFundRepositoryDto | null;
  archive(id: string): SinkingFundRepositoryDto | null;
  listByHousehold(
    householdId: string,
    options?: { readonly includeArchived?: boolean },
  ): readonly SinkingFundRepositoryDto[];
  getById(id: string): SinkingFundRepositoryDto | null;
}

const DEFAULT_STORAGE_KEY = 'finance:sinking-funds:v1';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCents(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined ? Math.max(0, Math.round(value)) : 0;
}

function assertIsoDate(value: string): void {
  if (!ISO_DATE.test(value)) throw new Error('Sinking fund dueDate must be an ISO date.');
}

function readAll(storage: SinkingFundKeyValueStorage, key: string): SinkingFundRepositoryDto[] {
  const serialized = storage.getItem(key);
  if (!serialized) return [];
  const parsed = JSON.parse(serialized) as SinkingFundRepositoryDto[];
  return Array.isArray(parsed) ? parsed : [];
}

function writeAll(
  storage: SinkingFundKeyValueStorage,
  key: string,
  funds: readonly SinkingFundRepositoryDto[],
): void {
  storage.setItem(key, JSON.stringify(funds));
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `fund-${Date.now()}`;
}

export function createSinkingFundRepository(
  storage: SinkingFundKeyValueStorage,
  storageKey = DEFAULT_STORAGE_KEY,
): SinkingFundRepository {
  return {
    create(input) {
      assertIsoDate(input.dueDate);
      const funds = readAll(storage, storageKey);
      const timestamp = nowIso();
      const fund: SinkingFundRepositoryDto = {
        id: input.id ?? makeId(),
        householdId: input.householdId,
        name: input.name.trim(),
        targetCents: normalizeCents(input.targetCents),
        savedCents: normalizeCents(input.savedCents),
        dueDate: input.dueDate,
        cadence: input.cadence ?? 'MONTHLY',
        linkedCategoryId: input.linkedCategoryId,
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      };
      writeAll(storage, storageKey, [...funds, fund]);
      return fund;
    },

    update(id, updates) {
      if (updates.dueDate) assertIsoDate(updates.dueDate);
      const funds = readAll(storage, storageKey);
      const index = funds.findIndex((fund) => fund.id === id);
      if (index < 0) return null;
      const existing = funds[index];
      const updated: SinkingFundRepositoryDto = {
        ...existing,
        householdId: updates.householdId ?? existing.householdId,
        name: updates.name?.trim() ?? existing.name,
        targetCents:
          updates.targetCents === undefined
            ? existing.targetCents
            : normalizeCents(updates.targetCents),
        savedCents:
          updates.savedCents === undefined
            ? existing.savedCents
            : normalizeCents(updates.savedCents),
        dueDate: updates.dueDate ?? existing.dueDate,
        cadence: updates.cadence ?? existing.cadence,
        linkedCategoryId: updates.linkedCategoryId ?? existing.linkedCategoryId,
        updatedAt: nowIso(),
      };
      funds[index] = updated;
      writeAll(storage, storageKey, funds);
      return updated;
    },

    archive(id) {
      const funds = readAll(storage, storageKey);
      const index = funds.findIndex((fund) => fund.id === id);
      if (index < 0) return null;
      const timestamp = nowIso();
      const archived = {
        ...funds[index],
        isArchived: true,
        archivedAt: timestamp,
        updatedAt: timestamp,
      };
      funds[index] = archived;
      writeAll(storage, storageKey, funds);
      return archived;
    },

    listByHousehold(householdId, options = {}) {
      return readAll(storage, storageKey)
        .filter((fund) => fund.householdId === householdId)
        .filter((fund) => options.includeArchived === true || !fund.isArchived)
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    },

    getById(id) {
      return readAll(storage, storageKey).find((fund) => fund.id === id) ?? null;
    },
  };
}
