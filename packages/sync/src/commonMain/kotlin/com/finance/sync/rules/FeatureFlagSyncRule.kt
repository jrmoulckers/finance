// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.rules

import kotlinx.serialization.Serializable

/**
 * Sync-rule definition that tells PowerSync how to replicate the `feature_flags`
 * table from the server to client devices.
 *
 * This is the KMP-side representation of a PowerSync sync rule. The actual YAML
 * configuration lives in the backend (`services/api/`), but this model allows
 * shared code to reason about flag sync boundaries and filtering.
 *
 * Sync behaviour:
 * - Flags are **read-only** on the client — mutations flow through the admin API.
 * - Clients receive all flags whose [platformFilter] matches the current platform
 *   (or is empty, meaning "all platforms").
 * - Flag updates are delivered in real-time via PowerSync's incremental sync.
 * - On initial connect, a full flag set is bootstrapped into the local database.
 *
 * @property tableName The PostgreSQL table that stores feature flags.
 * @property columns The set of columns to sync.
 * @property platformFilter Optional platform filter. When non-empty, only flags
 *   whose `platform` column matches one of these values are synced to the client.
 *   Empty list means sync all flags regardless of platform.
 */
@Serializable
data class FeatureFlagSyncRule(
    val tableName: String = DEFAULT_TABLE_NAME,
    val columns: List<String> = DEFAULT_COLUMNS,
    val platformFilter: List<String> = emptyList(),
) {
    companion object {
        /** Default table name for feature flags in the Supabase schema. */
        const val DEFAULT_TABLE_NAME = "feature_flags"

        /** Columns synced for each flag row. */
        val DEFAULT_COLUMNS = listOf(
            "id",
            "key",
            "description",
            "enabled",
            "default_value",
            "rules",
            "platform",
            "rollout_percentage",
            "updated_at",
        )

        /**
         * Create a sync rule filtered to a specific platform.
         *
         * @param platform The platform identifier (e.g., "ios", "android", "web", "windows").
         * @return A [FeatureFlagSyncRule] that only syncs flags for the given platform
         *   plus platform-agnostic flags.
         */
        fun forPlatform(platform: String): FeatureFlagSyncRule {
            return FeatureFlagSyncRule(platformFilter = listOf(platform, "all"))
        }
    }
}
