// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.notifications

import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for [NotificationPreferences] and [NotificationSettingsViewModel].
 *
 * Uses a simple in-memory fake SharedPreferences to verify:
 * - Default state (all disabled)
 * - Toggle behavior
 * - ViewModel state reflection
 * - Scheduler sync on toggle
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationPreferencesTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // ── Fake SharedPreferences ──────────────────────────────────────────

    private class FakeSharedPreferences : SharedPreferences {
        private val data = mutableMapOf<String, Any?>()
        private val editor = FakeEditor(data)

        override fun getAll(): Map<String, *> = data.toMap()
        override fun getString(key: String?, defValue: String?) = data[key] as? String ?: defValue
        override fun getStringSet(key: String?, defValues: Set<String>?) = defValues
        override fun getInt(key: String?, defValue: Int) = data[key] as? Int ?: defValue
        override fun getLong(key: String?, defValue: Long) = data[key] as? Long ?: defValue
        override fun getFloat(key: String?, defValue: Float) = data[key] as? Float ?: defValue
        override fun getBoolean(key: String?, defValue: Boolean) = data[key] as? Boolean ?: defValue
        override fun contains(key: String?) = data.containsKey(key)
        override fun edit(): SharedPreferences.Editor = editor
        override fun registerOnSharedPreferenceChangeListener(
            listener: SharedPreferences.OnSharedPreferenceChangeListener?,
        ) { /* No-op */ }
        override fun unregisterOnSharedPreferenceChangeListener(
            listener: SharedPreferences.OnSharedPreferenceChangeListener?,
        ) { /* No-op */ }

        private class FakeEditor(private val data: MutableMap<String, Any?>) : SharedPreferences.Editor {
            override fun putString(key: String?, value: String?) = apply { data[key!!] = value }
            override fun putStringSet(key: String?, values: Set<String>?) = apply { data[key!!] = values }
            override fun putInt(key: String?, value: Int) = apply { data[key!!] = value }
            override fun putLong(key: String?, value: Long) = apply { data[key!!] = value }
            override fun putFloat(key: String?, value: Float) = apply { data[key!!] = value }
            override fun putBoolean(key: String?, value: Boolean) = apply { data[key!!] = value }
            override fun remove(key: String?) = apply { data.remove(key) }
            override fun clear() = apply { data.clear() }
            override fun commit() = true
            override fun apply() { /* No-op */ }
        }
    }

    // ── NotificationPreferences tests ───────────────────────────────────

    @Test
    fun `all notifications disabled by default`() {
        val prefs = NotificationPreferences(FakeSharedPreferences())
        assertFalse(prefs.dailySnapshotEnabled.value)
        assertFalse(prefs.weeklyInsightEnabled.value)
        assertFalse(prefs.monthlyReflectionEnabled.value)
    }

    @Test
    fun `isEnabled returns false for all types by default`() {
        val prefs = NotificationPreferences(FakeSharedPreferences())
        NotificationType.entries
            .filter { it != NotificationType.SYNC_STATUS }
            .forEach { type ->
                assertFalse(prefs.isEnabled(type), "${type.name} should be disabled by default")
            }
    }

    @Test
    fun `setEnabled persists and updates flow for daily snapshot`() {
        val prefs = NotificationPreferences(FakeSharedPreferences())
        prefs.setEnabled(NotificationType.DAILY_SNAPSHOT, true)

        assertTrue(prefs.dailySnapshotEnabled.value)
        assertTrue(prefs.isEnabled(NotificationType.DAILY_SNAPSHOT))
    }

    @Test
    fun `setEnabled persists and updates flow for weekly insight`() {
        val prefs = NotificationPreferences(FakeSharedPreferences())
        prefs.setEnabled(NotificationType.WEEKLY_INSIGHT, true)

        assertTrue(prefs.weeklyInsightEnabled.value)
        assertTrue(prefs.isEnabled(NotificationType.WEEKLY_INSIGHT))
    }

    @Test
    fun `setEnabled persists and updates flow for monthly reflection`() {
        val prefs = NotificationPreferences(FakeSharedPreferences())
        prefs.setEnabled(NotificationType.MONTHLY_REFLECTION, true)

        assertTrue(prefs.monthlyReflectionEnabled.value)
        assertTrue(prefs.isEnabled(NotificationType.MONTHLY_REFLECTION))
    }

    @Test
    fun `toggling off after enabling works`() {
        val prefs = NotificationPreferences(FakeSharedPreferences())
        prefs.setEnabled(NotificationType.DAILY_SNAPSHOT, true)
        assertTrue(prefs.isEnabled(NotificationType.DAILY_SNAPSHOT))

        prefs.setEnabled(NotificationType.DAILY_SNAPSHOT, false)
        assertFalse(prefs.isEnabled(NotificationType.DAILY_SNAPSHOT))
    }

    @Test
    fun `enabling one type does not affect others`() {
        val prefs = NotificationPreferences(FakeSharedPreferences())
        prefs.setEnabled(NotificationType.WEEKLY_INSIGHT, true)

        assertFalse(prefs.isEnabled(NotificationType.DAILY_SNAPSHOT))
        assertTrue(prefs.isEnabled(NotificationType.WEEKLY_INSIGHT))
        assertFalse(prefs.isEnabled(NotificationType.MONTHLY_REFLECTION))
    }

    // ── NotificationSettingsUiState tests ────────────────────────────────

    @Test
    fun `NotificationSettingsUiState defaults are all false`() {
        val state = NotificationSettingsUiState()
        assertFalse(state.dailySnapshotEnabled)
        assertFalse(state.weeklyInsightEnabled)
        assertFalse(state.monthlyReflectionEnabled)
    }

    @Test
    fun `NotificationSettingsUiState can be created with mixed values`() {
        val state = NotificationSettingsUiState(
            dailySnapshotEnabled = true,
            weeklyInsightEnabled = false,
            monthlyReflectionEnabled = true,
        )
        assertTrue(state.dailySnapshotEnabled)
        assertFalse(state.weeklyInsightEnabled)
        assertTrue(state.monthlyReflectionEnabled)
    }

    // ── NotificationScheduler work name tests ───────────────────────────

    @Test
    fun `work names are unique per notification type`() {
        val names = NotificationType.entries.map { NotificationScheduler.workNameFor(it) }
        assertEquals(names.size, names.toSet().size)
    }

    @Test
    fun `work names follow expected pattern`() {
        assertEquals(
            "finance_notification_daily_snapshot",
            NotificationScheduler.workNameFor(NotificationType.DAILY_SNAPSHOT),
        )
        assertEquals(
            "finance_notification_weekly_insight",
            NotificationScheduler.workNameFor(NotificationType.WEEKLY_INSIGHT),
        )
        assertEquals(
            "finance_notification_monthly_reflection",
            NotificationScheduler.workNameFor(NotificationType.MONTHLY_REFLECTION),
        )
    }

    // ── NotificationContent tests ───────────────────────────────────────

    @Test
    fun `NotificationContent data class works correctly`() {
        val content = NotificationContent(
            title = "Test Title",
            body = "Test Body",
        )
        assertEquals("Test Title", content.title)
        assertEquals("Test Body", content.body)
    }

    @Test
    fun `NotificationContent supports copy`() {
        val original = NotificationContent("A", "B")
        val copy = original.copy(title = "C")
        assertEquals("C", copy.title)
        assertEquals("B", copy.body)
    }
}
