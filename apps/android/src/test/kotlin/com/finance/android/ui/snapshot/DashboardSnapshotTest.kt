// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.snapshot

import com.finance.android.ui.data.SampleData
import com.finance.android.ui.screens.DashboardContent
import com.finance.android.ui.viewmodel.BudgetStatusUi
import com.finance.android.ui.viewmodel.DashboardUiState
import com.finance.core.budget.BudgetHealth
import com.finance.models.types.Currency
import org.junit.Rule
import org.junit.Test

/**
 * Paparazzi snapshot tests for the Dashboard screen.
 *
 * Captures golden images in light/dark/high-contrast modes at both
 * 1.0× and 2.0× font scales. Covers populated, empty, and over-budget states.
 */
class DashboardSnapshotTest {

    @get:Rule
    val paparazzi = SnapshotTestConfig.paparazzi()

    // ── Populated state ─────────────────────────────────────────────────────

    private fun populatedState() = DashboardUiState(
        isLoading = false,
        netWorthFormatted = "\$116,899.22",
        todaySpendingFormatted = "\$28.78",
        monthlySpendingFormatted = "\$1,247.63",
        budgetStatuses = listOf(
            BudgetStatusUi("Groceries", "\$248", "\$600", "+\$352", 0.41f, BudgetHealth.HEALTHY, null),
            BudgetStatusUi("Dining", "\$245", "\$300", "+\$55", 0.82f, BudgetHealth.WARNING, null),
            BudgetStatusUi("Transport", "\$89", "\$200", "+\$111", 0.45f, BudgetHealth.HEALTHY, null),
        ),
        recentTransactions = SampleData.transactions.take(5),
        currency = Currency.USD,
    )

    @Test
    fun dashboard_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                DashboardContent(populatedState(), {}, {}, {}, {}, {})
            }
        }
    }

    @Test
    fun dashboard_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                DashboardContent(populatedState(), {}, {}, {}, {}, {})
            }
        }
    }

    @Test
    fun dashboard_highContrast_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.NORMAL) {
                DashboardContent(populatedState(), {}, {}, {}, {}, {})
            }
        }
    }

    @Test
    fun dashboard_light_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.LARGE) {
                DashboardContent(populatedState(), {}, {}, {}, {}, {})
            }
        }
    }

    @Test
    fun dashboard_dark_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.LARGE) {
                DashboardContent(populatedState(), {}, {}, {}, {}, {})
            }
        }
    }

    @Test
    fun dashboard_highContrast_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.LARGE) {
                DashboardContent(populatedState(), {}, {}, {}, {}, {})
            }
        }
    }

    // ── Empty state ─────────────────────────────────────────────────────────

    private fun emptyState() = DashboardUiState(
        isLoading = false,
        netWorthFormatted = "\$0.00",
        todaySpendingFormatted = "\$0.00",
        monthlySpendingFormatted = "\$0.00",
        budgetStatuses = emptyList(),
        recentTransactions = emptyList(),
        currency = Currency.USD,
    )

    @Test
    fun dashboard_empty_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                DashboardContent(emptyState(), {}, {}, {}, {}, {})
            }
        }
    }

    @Test
    fun dashboard_empty_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                DashboardContent(emptyState(), {}, {}, {}, {}, {})
            }
        }
    }

    // ── Over budget state ───────────────────────────────────────────────────

    private fun overBudgetState() = DashboardUiState(
        isLoading = false,
        netWorthFormatted = "\$42,350.00",
        todaySpendingFormatted = "\$156.40",
        monthlySpendingFormatted = "\$3,892.15",
        budgetStatuses = listOf(
            BudgetStatusUi("Dining", "\$380", "\$300", "-\$80", 1.27f, BudgetHealth.OVER, null),
            BudgetStatusUi("Shopping", "\$510", "\$500", "-\$10", 1.02f, BudgetHealth.OVER, null),
            BudgetStatusUi("Groceries", "\$580", "\$600", "+\$20", 0.97f, BudgetHealth.WARNING, null),
        ),
        recentTransactions = SampleData.transactions.take(3),
        currency = Currency.USD,
    )

    @Test
    fun dashboard_overBudget_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                DashboardContent(overBudgetState(), {}, {}, {}, {}, {})
            }
        }
    }

    @Test
    fun dashboard_overBudget_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                DashboardContent(overBudgetState(), {}, {}, {}, {}, {})
            }
        }
    }
}
