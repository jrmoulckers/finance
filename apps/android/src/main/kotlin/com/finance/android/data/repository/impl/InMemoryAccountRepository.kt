// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.impl

import com.finance.android.data.repository.AccountRepository
import com.finance.android.ui.data.SampleData
import com.finance.models.Account
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.datetime.Clock

// TODO(#432): Replace with SQLDelight-backed implementation

/**
 * In-memory stub implementation of [AccountRepository].
 *
 * Uses a [MutableStateFlow] as its backing store so that all
 * `observe*` methods emit updates reactively. This implementation
 * is intended **only** for development and testing until the real
 * SQLDelight-backed repository is available (see issue #432).
 */
class InMemoryAccountRepository : AccountRepository {

    private val store = MutableStateFlow(SampleData.accounts.toList())

    /** All non-deleted records. */
    private fun List<Account>.active(): List<Account> =
        filter { it.deletedAt == null }

    // ── BaseRepository ──────────────────────────────────────────────

    override fun observeAll(householdId: SyncId): Flow<List<Account>> =
        store.map { list ->
            list.active()
                .filter { it.householdId == householdId }
                .sortedBy { it.sortOrder }
        }

    override fun observeById(id: SyncId): Flow<Account?> =
        store.map { list ->
            list.active().find { it.id == id }
        }

    override suspend fun getById(id: SyncId): Account? =
        store.value.active().find { it.id == id }

    override suspend fun insert(entity: Account) {
        store.update { current -> current + entity }
    }

    override suspend fun update(entity: Account) {
        store.update { current ->
            current.map { if (it.id == entity.id) entity else it }
        }
    }

    override suspend fun delete(id: SyncId) {
        val now = Clock.System.now()
        store.update { current ->
            current.map { account ->
                if (account.id == id && account.deletedAt == null) {
                    account.copy(deletedAt = now, isSynced = false, updatedAt = now)
                } else {
                    account
                }
            }
        }
    }

    override suspend fun getUnsynced(householdId: SyncId): List<Account> =
        store.value.filter { it.householdId == householdId && !it.isSynced }

    override suspend fun markSynced(ids: List<SyncId>) {
        val idSet = ids.toSet()
        store.update { current ->
            current.map { account ->
                if (account.id in idSet) account.copy(isSynced = true) else account
            }
        }
    }

    // ── AccountRepository ───────────────────────────────────────────

    override fun observeActive(householdId: SyncId): Flow<List<Account>> =
        store.map { list ->
            list.active()
                .filter { it.householdId == householdId && !it.isArchived }
                .sortedBy { it.sortOrder }
        }

    override suspend fun updateBalance(id: SyncId, newBalance: Cents) {
        val now = Clock.System.now()
        store.update { current ->
            current.map { account ->
                if (account.id == id) {
                    account.copy(
                        currentBalance = newBalance,
                        isSynced = false,
                        updatedAt = now,
                    )
                } else {
                    account
                }
            }
        }
    }

    override suspend fun archive(id: SyncId) {
        val now = Clock.System.now()
        store.update { current ->
            current.map { account ->
                if (account.id == id) {
                    account.copy(
                        isArchived = true,
                        isSynced = false,
                        updatedAt = now,
                    )
                } else {
                    account
                }
            }
        }
    }
}
