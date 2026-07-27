// SPDX-License-Identifier: BUSL-1.1

/**
 * SQLite-WASM repository for investment lots (tax-lot level tracking).
 *
 * Handles CRUD operations for the `investment_lot` table, enabling
 * lot-level cost-basis tracking with FIFO, LIFO, specific ID, and
 * average cost methods.
 *
 * References: issue #1588
 */

import type { InvestmentLot, SyncId } from '../../kmp/bridge';
import { execute, query, queryOne, type AsyncDb, type Row } from '../async-db';
import {
  SQLITE_NOW_EXPRESSION,
  mapCents,
  mapSyncMetadata,
  requireNumber,
  requireString,
} from './helpers';

const LOT_COLUMNS = [
  'id',
  'investment_id',
  'purchase_date',
  'shares',
  'cost_per_share',
  'total_cost',
  'created_at',
  'updated_at',
  'deleted_at',
  'sync_version',
  'is_synced',
].join(', ');

const LOT_BASE_QUERY = `SELECT ${LOT_COLUMNS} FROM investment_lot WHERE deleted_at IS NULL`;

/** Input used when creating a new lot record. */
export interface CreateLotInput {
  investmentId: SyncId;
  purchaseDate: string;
  shares: number;
  costPerShare: { amount: number };
}

/** Input used when updating an existing lot record. */
export interface UpdateLotInput {
  purchaseDate?: string;
  shares?: number;
  costPerShare?: { amount: number };
}

/** Map a raw database row to an InvestmentLot domain object. */
function mapLot(row: Row): InvestmentLot {
  const shares = requireNumber(row.shares, 'investment_lot.shares');
  const costPerShare = mapCents(row.cost_per_share, 'investment_lot.cost_per_share');

  return {
    id: requireString(row.id, 'investment_lot.id'),
    investmentId: requireString(row.investment_id, 'investment_lot.investment_id'),
    purchaseDate: requireString(row.purchase_date, 'investment_lot.purchase_date'),
    shares,
    costPerShare,
    totalCost: mapCents(row.total_cost, 'investment_lot.total_cost'),
    ...mapSyncMetadata(row),
  };
}

/** Return all non-deleted lots for a specific investment, ordered by purchase date. */
export async function getLotsByInvestment(
  db: AsyncDb,
  investmentId: SyncId,
): Promise<InvestmentLot[]> {
  const { rows } = await query<Row>(
    db,
    `${LOT_BASE_QUERY} AND investment_id = ? ORDER BY purchase_date ASC`,
    [investmentId],
  );
  return rows.map(mapLot);
}

/** Find a single non-deleted lot by its identifier. */
export async function getLotById(db: AsyncDb, lotId: SyncId): Promise<InvestmentLot | null> {
  const row = await queryOne<Row>(db, `${LOT_BASE_QUERY} AND id = ?`, [lotId]);
  return row ? mapLot(row) : null;
}

/** Insert a new lot row and return the created lot. */
export async function createLot(db: AsyncDb, input: CreateLotInput): Promise<InvestmentLot> {
  const id = crypto.randomUUID();
  const totalCost = Math.round(input.shares * input.costPerShare.amount);

  await execute(
    db,
    `INSERT INTO investment_lot (
      id,
      investment_id,
      purchase_date,
      shares,
      cost_per_share,
      total_cost,
      created_at,
      updated_at,
      deleted_at,
      sync_version,
      is_synced
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      NULL,
      1,
      0
    )`,
    [
      id,
      input.investmentId,
      input.purchaseDate,
      input.shares,
      input.costPerShare.amount,
      totalCost,
    ],
  );

  const created = await getLotById(db, id);
  if (!created) {
    throw new Error('Failed to create investment lot.');
  }

  return created;
}

/** Update a lot row and return the refreshed lot. */
export async function updateLot(
  db: AsyncDb,
  lotId: SyncId,
  updates: UpdateLotInput,
): Promise<InvestmentLot | null> {
  const existing = await getLotById(db, lotId);
  if (!existing) {
    return null;
  }

  const merged = {
    purchaseDate: updates.purchaseDate ?? existing.purchaseDate,
    shares: updates.shares ?? existing.shares,
    costPerShare: updates.costPerShare ?? existing.costPerShare,
  };

  const totalCost = Math.round(merged.shares * merged.costPerShare.amount);

  await execute(
    db,
    `UPDATE investment_lot
        SET purchase_date = ?,
            shares = ?,
            cost_per_share = ?,
            total_cost = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [merged.purchaseDate, merged.shares, merged.costPerShare.amount, totalCost, lotId],
  );

  return await getLotById(db, lotId);
}

/** Soft-delete a lot row by marking its deleted timestamp. */
export async function deleteLot(db: AsyncDb, lotId: SyncId): Promise<boolean> {
  const existing = await getLotById(db, lotId);
  if (!existing) {
    return false;
  }

  await execute(
    db,
    `UPDATE investment_lot
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [lotId],
  );

  return true;
}
