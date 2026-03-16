// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import android.content.SharedPreferences
import app.cash.turbine.test
import com.finance.android.data.repository.impl.InMemoryAccountRepository
import com.finance.android.data.repository.impl.InMemoryBudgetRepository
import com.finance.android.data.repository.impl.InMemoryCategoryRepository
import com.finance.android.data.repository.impl.InMemoryGoalRepository
import com.finance.android.data.repository.impl.InMemoryTransactionRepository
import com.finance.sync.auth.AuthCredentials
import com.finance.sync.auth.AuthManager
import com.finance.sync.auth.AuthSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
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
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** Unit tests for [SettingsViewModel] export behavior. */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun exportData_jsonEmitsShareableExportFromRepositories() = runTest {
        val viewModel = SettingsViewModel(
            prefs = TestSharedPreferences(),
            biometricChecker = BiometricAvailabilityChecker { true },
            accountRepository = InMemoryAccountRepository(),
            transactionRepository = InMemoryTransactionRepository(),
            budgetRepository = InMemoryBudgetRepository(),
            categoryRepository = InMemoryCategoryRepository(),
            goalRepository = InMemoryGoalRepository(),
            authManager = FakeAuthManager(),
            defaultDarkModeEnabled = false,
        )

        viewModel.events.test {
            viewModel.exportData(ExportFormat.JSON)
            advanceUntilIdle()

            assertEquals(SettingsEvent.ExportStarted, awaitItem())
            val ready = assertIs<SettingsEvent.ExportReady>(awaitItem())
            assertTrue(ready.fileName.endsWith(".json"))
            assertEquals("application/json", ready.mimeType)
            assertTrue(ready.content.contains("\"accounts\""))
            assertTrue(ready.content.contains("Main Checking"))
            assertEquals(
                "Export ready — choose where to save",
                assertIs<SettingsEvent.ShowToast>(awaitItem()).message,
            )
            cancelAndIgnoreRemainingEvents()
        }

        assertFalse(viewModel.uiState.value.isExporting)
        assertFalse(viewModel.uiState.value.showExportDialog)
    }

    private class FakeAuthManager : AuthManager {
        override val currentSession = MutableStateFlow<AuthSession?>(null)
        override val isAuthenticated = MutableStateFlow(false)

        override suspend fun signIn(credentials: AuthCredentials): Result<AuthSession> =
            Result.failure(UnsupportedOperationException("Not used in tests"))

        override suspend fun signOut() = Unit

        override suspend fun refreshToken(): Result<AuthSession> =
            Result.failure(UnsupportedOperationException("Not used in tests"))

        override suspend fun deleteAccount(): Result<Unit> = Result.success(Unit)
    }

    private class TestSharedPreferences : SharedPreferences {
        private val values = mutableMapOf<String, Any?>()

        override fun getAll(): MutableMap<String, *> = values.toMutableMap()

        override fun getString(key: String?, defValue: String?): String? =
            values[key] as? String ?: defValue

        override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? =
            @Suppress("UNCHECKED_CAST")
            ((values[key] as? Set<String>)?.toMutableSet()) ?: defValues

        override fun getInt(key: String?, defValue: Int): Int = values[key] as? Int ?: defValue

        override fun getLong(key: String?, defValue: Long): Long = values[key] as? Long ?: defValue

        override fun getFloat(key: String?, defValue: Float): Float = values[key] as? Float ?: defValue

        override fun getBoolean(key: String?, defValue: Boolean): Boolean =
            values[key] as? Boolean ?: defValue

        override fun contains(key: String?): Boolean = values.containsKey(key)

        override fun edit(): SharedPreferences.Editor = Editor(values)

        override fun registerOnSharedPreferenceChangeListener(
            listener: SharedPreferences.OnSharedPreferenceChangeListener?,
        ) = Unit

        override fun unregisterOnSharedPreferenceChangeListener(
            listener: SharedPreferences.OnSharedPreferenceChangeListener?,
        ) = Unit

        private class Editor(
            private val values: MutableMap<String, Any?>,
        ) : SharedPreferences.Editor {
            private val pending = mutableMapOf<String, Any?>()
            private var clearRequested = false

            override fun putString(key: String?, value: String?): SharedPreferences.Editor = apply {
                pending[key.orEmpty()] = value
            }

            override fun putStringSet(
                key: String?,
                values: MutableSet<String>?,
            ): SharedPreferences.Editor = apply {
                pending[key.orEmpty()] = values?.toSet()
            }

            override fun putInt(key: String?, value: Int): SharedPreferences.Editor = apply {
                pending[key.orEmpty()] = value
            }

            override fun putLong(key: String?, value: Long): SharedPreferences.Editor = apply {
                pending[key.orEmpty()] = value
            }

            override fun putFloat(key: String?, value: Float): SharedPreferences.Editor = apply {
                pending[key.orEmpty()] = value
            }

            override fun putBoolean(key: String?, value: Boolean): SharedPreferences.Editor = apply {
                pending[key.orEmpty()] = value
            }

            override fun remove(key: String?): SharedPreferences.Editor = apply {
                pending[key.orEmpty()] = null
            }

            override fun clear(): SharedPreferences.Editor = apply {
                clearRequested = true
                pending.clear()
            }

            override fun commit(): Boolean {
                apply()
                return true
            }

            override fun apply() {
                if (clearRequested) {
                    values.clear()
                }
                pending.forEach { (key, value) ->
                    if (value == null) {
                        values.remove(key)
                    } else {
                        values[key] = value
                    }
                }
            }
        }
    }
}
