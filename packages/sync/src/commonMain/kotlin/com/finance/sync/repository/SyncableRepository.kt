// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.repository

import com.finance.db.repository.BaseRepository
import kotlinx.coroutines.flow.Flow

/**
 * Marker interface for repositories that participate in sync.
 * Extends [BaseRepository] with sync-specific operations.
 */
interface SyncableRepository<T> : BaseRepository<T> {
    val tableName: String
    suspend fun applySyncChange(rowData: Map<String, String?>, isDelete: Boolean, syncVersion: Long)
    suspend fun toRowData(entity: T): Map<String, String?>
    fun observeUnsyncedCount(): Flow<Int>
}
