// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.household

import com.finance.models.HouseholdRole
import com.finance.models.types.SyncId

/**
 * Data partitioning logic for shared vs personal data within a household.
 */
object DataPartitioning {

    enum class DataScope { PERSONAL, SHARED }

    data class AccountSharingConfig(
        val accountId: SyncId,
        val ownerId: SyncId,
        val scope: DataScope,
    )

    fun <T> filterVisible(
        items: List<T>,
        userId: SyncId,
        role: HouseholdRole,
        getOwnerId: (T) -> SyncId,
        getScope: (T) -> DataScope,
    ): List<T> {
        return items.filter { item ->
            when (getScope(item)) {
                DataScope.PERSONAL -> getOwnerId(item) == userId
                DataScope.SHARED -> RbacPermissions.canViewTransactions(role)
            }
        }
    }

    fun <T> partition(
        items: List<T>,
        getScope: (T) -> DataScope,
    ): PartitionedData<T> {
        val (shared, personal) = items.partition { getScope(it) == DataScope.SHARED }
        return PartitionedData(shared = shared, personal = personal)
    }

    fun transactionScope(
        accountConfigs: Map<SyncId, AccountSharingConfig>,
        accountId: SyncId,
    ): DataScope {
        return accountConfigs[accountId]?.scope ?: DataScope.PERSONAL
    }

    fun canModify(
        userId: SyncId,
        role: HouseholdRole,
        itemOwnerId: SyncId,
        scope: DataScope,
    ): Boolean {
        if (role == HouseholdRole.VIEWER) return false
        if (itemOwnerId == userId) return true
        return when (scope) {
            DataScope.PERSONAL -> false
            DataScope.SHARED -> when (role) {
                HouseholdRole.OWNER, HouseholdRole.PARTNER -> true
                HouseholdRole.MEMBER, HouseholdRole.VIEWER -> false
            }
        }
    }
}

data class PartitionedData<T>(
    val shared: List<T>,
    val personal: List<T>,
) {
    val totalCount: Int get() = shared.size + personal.size
}
