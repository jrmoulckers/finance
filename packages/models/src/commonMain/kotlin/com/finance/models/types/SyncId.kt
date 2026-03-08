// SPDX-License-Identifier: BUSL-1.1

package com.finance.models.types

import kotlin.jvm.JvmInline
import kotlinx.serialization.Serializable

/**
 * Opaque, type-safe wrapper around a UUID string used as the primary identifier
 * for all sync-enabled entities. Prevents accidental ID mix-ups at zero runtime cost.
 */
@JvmInline
@Serializable
value class SyncId(val value: String) {
    init {
        require(value.isNotBlank()) { "SyncId cannot be blank" }
    }
}
