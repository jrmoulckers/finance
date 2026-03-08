// SPDX-License-Identifier: BUSL-1.1

package com.finance.models

import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Serializable
data class User(
    val id: SyncId,
    val email: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val defaultCurrency: Currency = Currency.USD,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val syncVersion: Long = 0,
    val isSynced: Boolean = false,
)
