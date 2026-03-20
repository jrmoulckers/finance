// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.theme

import android.content.SharedPreferences
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

class ThemePreferenceManagerTest {
    private lateinit var prefs: FakeSharedPreferences
    private lateinit var manager: ThemePreferenceManager

    @BeforeTest fun setUp() { prefs = FakeSharedPreferences(); manager = ThemePreferenceManager(prefs) }

    @Test fun `defaults to SYSTEM when no preference stored`() { assertEquals(ThemePreference.SYSTEM, manager.themePreference.value) }
    @Test fun `setThemePreference updates StateFlow to DARK`() { manager.setThemePreference(ThemePreference.DARK); assertEquals(ThemePreference.DARK, manager.themePreference.value) }
    @Test fun `setThemePreference updates StateFlow to LIGHT`() { manager.setThemePreference(ThemePreference.LIGHT); assertEquals(ThemePreference.LIGHT, manager.themePreference.value) }
    @Test fun `setThemePreference persists to SharedPreferences`() { manager.setThemePreference(ThemePreference.DARK); assertEquals("DARK", prefs.getString(ThemePreferenceManager.KEY_THEME, null)) }
    @Test fun `restores persisted preference on construction`() { prefs.edit().putString(ThemePreferenceManager.KEY_THEME, "LIGHT").apply(); assertEquals(ThemePreference.LIGHT, ThemePreferenceManager(prefs).themePreference.value) }
    @Test fun `falls back to SYSTEM for invalid stored value`() { prefs.edit().putString(ThemePreferenceManager.KEY_THEME, "X").apply(); assertEquals(ThemePreference.SYSTEM, ThemePreferenceManager(prefs).themePreference.value) }
    @Test fun `sequential updates reflect latest value`() { manager.setThemePreference(ThemePreference.DARK); manager.setThemePreference(ThemePreference.SYSTEM); assertEquals(ThemePreference.SYSTEM, manager.themePreference.value) }
}

private class FakeSharedPreferences : SharedPreferences {
    private val data = mutableMapOf<String, Any?>()
    override fun getString(key: String?, defValue: String?): String? = data[key] as? String ?: defValue
    override fun getStringSet(key: String?, d: MutableSet<String>?): MutableSet<String>? = d
    override fun getInt(key: String?, defValue: Int): Int = data[key] as? Int ?: defValue
    override fun getLong(key: String?, defValue: Long): Long = data[key] as? Long ?: defValue
    override fun getFloat(key: String?, defValue: Float): Float = data[key] as? Float ?: defValue
    override fun getBoolean(key: String?, defValue: Boolean): Boolean = data[key] as? Boolean ?: defValue
    override fun contains(key: String?): Boolean = data.containsKey(key)
    override fun getAll(): MutableMap<String, *> = data.toMutableMap()
    override fun edit(): SharedPreferences.Editor = FakeEditor(data)
    override fun registerOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener?) {}
    override fun unregisterOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener?) {}
    private class FakeEditor(private val data: MutableMap<String, Any?>) : SharedPreferences.Editor {
        private val pending = mutableMapOf<String, Any?>()
        override fun putString(k: String?, v: String?): SharedPreferences.Editor { k?.let { pending[it] = v }; return this }
        override fun putStringSet(k: String?, v: MutableSet<String>?): SharedPreferences.Editor { return this }
        override fun putInt(k: String?, v: Int): SharedPreferences.Editor { return this }
        override fun putLong(k: String?, v: Long): SharedPreferences.Editor { return this }
        override fun putFloat(k: String?, v: Float): SharedPreferences.Editor { return this }
        override fun putBoolean(k: String?, v: Boolean): SharedPreferences.Editor { return this }
        override fun remove(k: String?): SharedPreferences.Editor { return this }
        override fun clear(): SharedPreferences.Editor { return this }
        override fun commit(): Boolean { data.putAll(pending); return true }
        override fun apply() { data.putAll(pending) }
    }
}
