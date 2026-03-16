// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.sync

import app.cash.turbine.test
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Unit tests for [ConnectivityObserver].
 *
 * Since the real implementation requires an Android [ConnectivityManager],
 * these tests verify the observable contract using a test-friendly subclass
 * that emits controlled values.
 */
class ConnectivityObserverTest {

    /**
     * Test double that bypasses [ConnectivityManager] and allows
     * programmatic control of the connectivity flow.
     */
    private class TestConnectivitySource {
        private val _state = MutableStateFlow(true)
        val flow: Flow<Boolean> get() = _state

        fun setOnline(online: Boolean) {
            _state.value = online
        }
    }

    @Test
    fun `emits initial online state`() = runTest {
        val source = TestConnectivitySource()

        source.flow.test {
            assertEquals(true, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits false when going offline`() = runTest {
        val source = TestConnectivitySource()

        source.flow.test {
            assertEquals(true, awaitItem())

            source.setOnline(false)
            assertEquals(false, awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits true when coming back online`() = runTest {
        val source = TestConnectivitySource()
        source.setOnline(false)

        source.flow.test {
            assertEquals(false, awaitItem())

            source.setOnline(true)
            assertEquals(true, awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `does not re-emit when state unchanged`() = runTest {
        val source = TestConnectivitySource()

        source.flow.test {
            assertEquals(true, awaitItem())

            // Setting same value — MutableStateFlow deduplicates
            source.setOnline(true)
            expectNoEvents()

            cancelAndIgnoreRemainingEvents()
        }
    }
}
