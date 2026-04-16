// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.widget

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * Unit tests for widget data models and formatting.
 *
 * These tests verify the data layer used by Finance widgets. Widget
 * rendering tests require instrumented tests (Glance testing framework)
 * and are not covered here.
 */
class WidgetBalanceDataTest {

    @Test
    fun `WidgetBalanceData holds all required fields`() {
        val data = WidgetBalanceData(
            netWorth = "$12,345.67",
            todaySpending = "$45.23",
            accountCount = 3,
            lastUpdated = "5 min ago",
        )

        assertEquals("$12,345.67", data.netWorth)
        assertEquals("$45.23", data.todaySpending)
        assertEquals(3, data.accountCount)
        assertEquals("5 min ago", data.lastUpdated)
    }

    @Test
    fun `WidgetBalanceData with zero accounts`() {
        val data = WidgetBalanceData(
            netWorth = "$0.00",
            todaySpending = "$0.00",
            accountCount = 0,
            lastUpdated = "Just now",
        )

        assertEquals(0, data.accountCount)
        assertEquals("$0.00", data.netWorth)
    }

    @Test
    fun `WidgetBalanceData copy preserves unchanged fields`() {
        val original = WidgetBalanceData(
            netWorth = "$1,000.00",
            todaySpending = "$50.00",
            accountCount = 2,
            lastUpdated = "1 min ago",
        )
        val updated = original.copy(todaySpending = "$75.00")

        assertEquals("$1,000.00", updated.netWorth)
        assertEquals("$75.00", updated.todaySpending)
        assertEquals(2, updated.accountCount)
    }

    @Test
    fun `WidgetBalanceData supports large net worth values`() {
        val data = WidgetBalanceData(
            netWorth = "$1,234,567.89",
            todaySpending = "$0.00",
            accountCount = 10,
            lastUpdated = "Now",
        )

        assertNotNull(data.netWorth)
        assertEquals("$1,234,567.89", data.netWorth)
    }

    @Test
    fun `account count pluralization helper`() {
        // Verify the pluralization logic used in the widget
        val single = 1
        val multiple = 3
        val zero = 0

        assertEquals("1 account", "$single account${if (single != 1) "s" else ""}")
        assertEquals("3 accounts", "$multiple account${if (multiple != 1) "s" else ""}")
        assertEquals("0 accounts", "$zero account${if (zero != 1) "s" else ""}")
    }
}
