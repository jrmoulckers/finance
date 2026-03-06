package com.finance.models

import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Serializable
data class Household(
    val id: SyncId,
    val name: String,
    val ownerId: SyncId,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val syncVersion: Long = 0,
    val isSynced: Boolean = false,
)
