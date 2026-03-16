// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

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

/**
 * In-memory [AccountRepository] backed by [SampleData].
 *
 * Supports basic CRUD by mutating an internal list and re-emitting the [Flow].
 * Intended for development, previews, and testing until a real database layer
 * (e.g. SQLDelight) is wired up.
 */
class MockAccountRepository : AccountRepository {

    private val _accounts = MutableStateFlow(SampleData.accounts.toList())

    override fun observeAll(householdId: SyncId): Flow<List<Account>> =
        _accounts.map { list ->
            list.filter { it.householdId == householdId && it.deletedAt == null }
                .sortedBy { it.sortOrder }
        }

    override fun observeById(id: SyncId): Flow<Account?> =
        _accounts.map { list -> list.find { it.id == id && it.deletedAt == null } }

    override suspend fun getById(id: SyncId): Account? =
        _accounts.value.find { it.id == id && it.deletedAt == null }

    override fun observeActive(householdId: SyncId): Flow<List<Account>> =
        _accounts.map { list ->
            list.filter {
                it.householdId == householdId &&
                    !it.isArchived &&
                    it.deletedAt == null
            }.sortedBy { it.sortOrder }
        }

    override suspend fun insert(account: Account) {
        _accounts.update { it + account }
    }

    override suspend fun update(account: Account) {
        _accounts.update { list ->
            list.map { if (it.id == account.id) account else it }
        }
    }

    override suspend fun updateBalance(id: SyncId, newBalance: Cents) {
        val now = Clock.System.now()
        _accounts.update { list ->
            list.map { account ->
                if (account.id == id) account.copy(
                    currentBalance = newBalance,
                    updatedAt = now,
                    isSynced = false,
                ) else account
            }
        }
    }

    override suspend fun archive(id: SyncId) {
        val now = Clock.System.now()
        _accounts.update { list ->
            list.map { account ->
                if (account.id == id) account.copy(
                    isArchived = true,
                    updatedAt = now,
                    isSynced = false,
                ) else account
            }
        }
    }

    override suspend fun delete(id: SyncId) {
        val now = Clock.System.now()
        _accounts.update { list ->
            list.map { account ->
                if (account.id == id) account.copy(
                    deletedAt = now,
                    updatedAt = now,
                    isSynced = false,
                ) else account
            }
        }
    }

    override suspend fun getUnsynced(householdId: SyncId): List<Account> =
        _accounts.value.filter { it.householdId == householdId && !it.isSynced }

    override suspend fun markSynced(ids: List<SyncId>) {
        _accounts.update { list ->
            list.map { account ->
                if (account.id in ids) account.copy(isSynced = true) else account
            }
        }
    }
}
