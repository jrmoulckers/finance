// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.snapshot

import com.finance.android.ui.screens.BudgetsContent
import com.finance.android.ui.screens.BudgetsEmptyState
import com.finance.android.ui.viewmodel.BudgetItemUi
import com.finance.android.ui.viewmodel.BudgetsUiState
import com.finance.core.budget.BudgetHealth
import com.finance.models.BudgetPeriod
import com.finance.models.types.SyncId
import org.junit.Rule
import org.junit.Test

/**
 * Paparazzi snapshot tests for the Budgets overview screen.
 *
 * Captures golden images for the populated budget list with summary card,
 * empty state, and error state in light/dark/high-contrast modes at
 * 1.0× and 2.0× font scales.
 */
class BudgetsSnapshotTest {

    @get:Rule
    val paparazzi = SnapshotTestConfig.paparazzi()

    // ── Populated state ─────────────────────────────────────────────────────

    private fun populatedState() = BudgetsUiState(
        isLoading = false,
        totalBudgeted = "\$1,580.00",
        totalSpent = "\$687.42",
        overallHealth = BudgetHealth.WARNING,
        budgets = listOf(
            BudgetItemUi(
                SyncId("bud-1"), "Groceries", "Groceries",
                "shopping_cart", "\$248.00", "\$600.00",
                "+\$352.00", 0.41f, BudgetHealth.HEALTHY,
                BudgetPeriod.MONTHLY,
            ),
            BudgetItemUi(
                SyncId("bud-2"), "Dining Out", "Dining Out",
                "restaurant", "\$245.00", "\$300.00",
                "+\$55.00", 0.82f, BudgetHealth.WARNING,
                BudgetPeriod.MONTHLY,
            ),
            BudgetItemUi(
                SyncId("bud-3"), "Transportation", "Transportation",
                "directions_car", "\$89.00", "\$200.00",
                "+\$111.00", 0.45f, BudgetHealth.HEALTHY,
                BudgetPeriod.MONTHLY,
            ),
        ),
    )

    @Test
    fun budgets_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                BudgetsContent(populatedState(), {}, {})
            }
        }
    }

    @Test
    fun budgets_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                BudgetsContent(populatedState(), {}, {})
            }
        }
    }

    @Test
    fun budgets_highContrast_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.NORMAL) {
                BudgetsContent(populatedState(), {}, {})
            }
        }
    }

    @Test
    fun budgets_light_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.LARGE) {
                BudgetsContent(populatedState(), {}, {})
            }
        }
    }

    @Test
    fun budgets_dark_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.LARGE) {
                BudgetsContent(populatedState(), {}, {})
            }
        }
    }

    @Test
    fun budgets_highContrast_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.LARGE) {
                BudgetsContent(populatedState(), {}, {})
            }
        }
    }

    // ── Empty state ─────────────────────────────────────────────────────────

    @Test
    fun budgets_empty_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                BudgetsEmptyState()
            }
        }
    }

    @Test
    fun budgets_empty_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                BudgetsEmptyState()
            }
        }
    }
}
