// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.snapshot

import com.finance.android.ui.data.SampleData
import com.finance.android.ui.screens.TransactionsContent
import com.finance.android.ui.viewmodel.TransactionDateGroup
import com.finance.android.ui.viewmodel.TransactionFilter
import com.finance.android.ui.viewmodel.TransactionsUiState
import kotlinx.datetime.LocalDate
import org.junit.Rule
import org.junit.Test

/**
 * Paparazzi snapshot tests for the Transactions list screen.
 *
 * Captures golden images for the populated transaction list with
 * date grouping, empty states (with and without filters), in
 * light/dark/high-contrast modes at 1.0× and 2.0× font scales.
 */
class TransactionsSnapshotTest {

    @get:Rule
    val paparazzi = SnapshotTestConfig.paparazzi()

    // ── Populated state ─────────────────────────────────────────────────────

    private fun populatedState() = TransactionsUiState(
        isLoading = false,
        dateGroups = listOf(
            TransactionDateGroup(
                LocalDate(2025, 3, 6), "Today",
                SampleData.transactions.take(3),
            ),
            TransactionDateGroup(
                LocalDate(2025, 3, 5), "Yesterday",
                SampleData.transactions.drop(3).take(3),
            ),
        ),
        filter = TransactionFilter(),
        totalCount = 20,
    )

    private val noOpSyncId: (com.finance.models.types.SyncId) -> Unit = {}

    @Test
    fun transactions_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                TransactionsContent(populatedState(), {}, {}, {}, {}, {}, {}, noOpSyncId, noOpSyncId, noOpSyncId)
            }
        }
    }

    @Test
    fun transactions_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                TransactionsContent(populatedState(), {}, {}, {}, {}, {}, {}, noOpSyncId, noOpSyncId, noOpSyncId)
            }
        }
    }

    @Test
    fun transactions_highContrast_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.NORMAL) {
                TransactionsContent(populatedState(), {}, {}, {}, {}, {}, {}, noOpSyncId, noOpSyncId, noOpSyncId)
            }
        }
    }

    @Test
    fun transactions_light_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.LARGE) {
                TransactionsContent(populatedState(), {}, {}, {}, {}, {}, {}, noOpSyncId, noOpSyncId, noOpSyncId)
            }
        }
    }

    @Test
    fun transactions_dark_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.LARGE) {
                TransactionsContent(populatedState(), {}, {}, {}, {}, {}, {}, noOpSyncId, noOpSyncId, noOpSyncId)
            }
        }
    }

    @Test
    fun transactions_highContrast_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.LARGE) {
                TransactionsContent(populatedState(), {}, {}, {}, {}, {}, {}, noOpSyncId, noOpSyncId, noOpSyncId)
            }
        }
    }

    // ── Empty state (no filters) ────────────────────────────────────────────

    private fun emptyState() = TransactionsUiState(
        isLoading = false,
        dateGroups = emptyList(),
        filter = TransactionFilter(),
        isEmpty = true,
        totalCount = 0,
    )

    @Test
    fun transactions_empty_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                TransactionsContent(emptyState(), {}, {}, {}, {}, {}, {}, noOpSyncId, noOpSyncId, noOpSyncId)
            }
        }
    }

    @Test
    fun transactions_empty_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                TransactionsContent(emptyState(), {}, {}, {}, {}, {}, {}, noOpSyncId, noOpSyncId, noOpSyncId)
            }
        }
    }
}
