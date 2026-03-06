package com.finance.models

import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Serializable
enum class HouseholdRole { OWNER, PARTNER, MEMBER, VIEWER }

@Serializable
data class HouseholdMember(
    val id: SyncId,
    val householdId: SyncId,
    val userId: SyncId,
    val role: HouseholdRole,
    val joinedAt: Instant,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val syncVersion: Long = 0,
    val isSynced: Boolean = false,
)
