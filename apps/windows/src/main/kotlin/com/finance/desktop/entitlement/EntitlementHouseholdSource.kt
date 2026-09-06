// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.entitlement

import com.finance.db.FinanceDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class EntitlementHouseholdScope(
    val id: String,
    val name: String,
)

interface EntitlementHouseholdSource {
    suspend fun loadForUser(userId: String): List<EntitlementHouseholdScope>
}

/**
 * Reads household choices from the encrypted, synchronized local database.
 *
 * These IDs are request scope only. The entitlement endpoint independently
 * verifies active membership, so a stale or modified local row grants nothing.
 */
class SqlDelightEntitlementHouseholdSource(
    private val database: FinanceDatabase,
) : EntitlementHouseholdSource {
    override suspend fun loadForUser(userId: String): List<EntitlementHouseholdScope> =
        withContext(Dispatchers.IO) {
            database.householdMemberQueries
                .selectByUser(userId)
                .executeAsList()
                .mapNotNull { membership ->
                    database.householdQueries
                        .selectById(membership.household_id)
                        .executeAsOneOrNull()
                        ?.let { household ->
                            EntitlementHouseholdScope(
                                id = household.id,
                                name = household.name,
                            )
                        }
                }
                .distinctBy(EntitlementHouseholdScope::id)
                .sortedBy { it.name.lowercase() }
        }
}
