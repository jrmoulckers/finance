// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository

import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.Serializable

/**
 * User-facing application settings persisted across sessions.
 *
 * All fields have sensible defaults so the application can start cleanly on
 * first launch without any stored settings file.
 *
 * Serialised to JSON via `kotlinx.serialization` and then DPAPI-encrypted
 * before being written to disk.
 */
@Serializable
data class AppSettings(
    // ── Appearance ──
    val darkMode: Boolean = false,
    val language: String = "English",
    val accentColor: String = "Blue",

    // ── Security ──
    val windowsHelloEnabled: Boolean = true,
    val autoLockEnabled: Boolean = true,
    val autoLockTimeoutMinutes: Int = 5,

    // ── Notifications ──
    val budgetNotificationsEnabled: Boolean = true,
    val goalNotificationsEnabled: Boolean = true,

    // ── Data & Sync ──
    val defaultCurrency: String = "USD",
    val cloudSyncEnabled: Boolean = true,
    val moodTagsEnabled: Boolean = false,
    val moodTagsSyncEnabled: Boolean = false,
)

/**
 * Repository for reading and writing [AppSettings].
 *
 * Implementations MUST encrypt settings at rest — see
 * [com.finance.desktop.data.repository.impl.DpapiSettingsRepository] for the
 * DPAPI-backed production implementation.
 */
interface SettingsRepository {

    /**
     * Observe the current settings as a [Flow].
     *
     * Emits the latest [AppSettings] immediately on collection, then again
     * whenever [save] is called.
     */
    fun observe(): Flow<AppSettings>

    /**
     * Returns the current [AppSettings] snapshot.
     *
     * If no settings have been persisted yet, returns [AppSettings] with
     * all default values.
     */
    suspend fun load(): AppSettings

    /**
     * Persists the given [settings] to DPAPI-encrypted storage.
     *
     * The flow returned by [observe] will emit the new value.
     */
    suspend fun save(settings: AppSettings)

    /**
     * Resets all settings to their defaults and persists the result.
     */
    suspend fun reset()
}
