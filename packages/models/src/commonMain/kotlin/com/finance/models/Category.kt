// SPDX-License-Identifier: BUSL-1.1

package com.finance.models

import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Serializable
data class Category(
    val id: SyncId,
    val householdId: SyncId,
    val name: String,
    val icon: String? = null,
    val color: String? = null,
    val parentId: SyncId? = null,
    val isIncome: Boolean = false,
    val isSystem: Boolean = false,
    val sortOrder: Int = 0,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val syncVersion: Long = 0,
    val isSynced: Boolean = false,
) {
    init {
        require(name.isNotBlank()) { "Category name cannot be blank" }
    }
}
