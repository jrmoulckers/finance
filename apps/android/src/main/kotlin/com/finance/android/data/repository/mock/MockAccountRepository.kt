// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import com.finance.android.data.repository.AccountRepository
import com.finance.android.ui.data.SampleData
import com.finance.models.Account
import com.finance.models.AccountType
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

    override fun getAll(): Flow<List<Account>> =
        _accounts.map { list -> list.filter { it.deletedAt == null }.sortedBy { it.sortOrder } }

    override fun getById(id: SyncId): Flow<Account?> =
        _accounts.map { list -> list.find { it.id == id && it.deletedAt == null } }

    override fun getByType(type: AccountType): Flow<List<Account>> =
        _accounts.map { list ->
            list.filter { it.type == type && it.deletedAt == null }.sortedBy { it.sortOrder }
        }

    override suspend fun create(account: Account) {
        _accounts.update { it + account }
    }

    override suspend fun update(account: Account) {
        _accounts.update { list ->
            list.map { if (it.id == account.id) account else it }
        }
    }

    override suspend fun delete(id: SyncId) {
        _accounts.update { list ->
            list.map { if (it.id == id) it.copy(deletedAt = Clock.System.now()) else it }
        }
    }
}
