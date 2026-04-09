// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.snapshot

import com.finance.android.ui.screens.GoalsContent
import com.finance.android.ui.viewmodel.GoalItemUi
import com.finance.android.ui.viewmodel.GoalsUiState
import com.finance.models.types.SyncId
import org.junit.Rule
import org.junit.Test

/**
 * Paparazzi snapshot tests for the Goals tracking screen.
 *
 * Captures golden images for the populated goals list with progress bars,
 * empty state, and error state in light/dark/high-contrast modes at
 * 1.0× and 2.0× font scales.
 */
class GoalsSnapshotTest {

    @get:Rule
    val paparazzi = SnapshotTestConfig.paparazzi()

    // ── Populated state ─────────────────────────────────────────────────────

    private fun populatedState() = GoalsUiState(
        isLoading = false,
        activeCount = 2,
        completedCount = 1,
        goals = listOf(
            GoalItemUi(
                id = SyncId("1"),
                name = "Emergency Fund",
                targetFormatted = "\$10,000.00",
                currentFormatted = "\$3,500.00",
                remainingFormatted = "\$6,500.00",
                progressPercent = 0.35f,
                targetDate = "Dec 31, 2025",
                isCompleted = false,
                icon = "\uD83D\uDEE1\uFE0F",
            ),
            GoalItemUi(
                id = SyncId("2"),
                name = "Vacation",
                targetFormatted = "\$5,000.00",
                currentFormatted = "\$5,000.00",
                remainingFormatted = "\$0.00",
                progressPercent = 1.0f,
                targetDate = "Jun 15, 2025",
                isCompleted = true,
                icon = "\u2708\uFE0F",
            ),
            GoalItemUi(
                id = SyncId("3"),
                name = "New Laptop",
                targetFormatted = "\$2,000.00",
                currentFormatted = "\$800.00",
                remainingFormatted = "\$1,200.00",
                progressPercent = 0.4f,
                targetDate = null,
                isCompleted = false,
                icon = null,
            ),
        ),
    )

    @Test
    fun goals_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                GoalsContent(populatedState(), {}, {})
            }
        }
    }

    @Test
    fun goals_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                GoalsContent(populatedState(), {}, {})
            }
        }
    }

    @Test
    fun goals_highContrast_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.NORMAL) {
                GoalsContent(populatedState(), {}, {})
            }
        }
    }

    @Test
    fun goals_light_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.LARGE) {
                GoalsContent(populatedState(), {}, {})
            }
        }
    }

    @Test
    fun goals_dark_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.LARGE) {
                GoalsContent(populatedState(), {}, {})
            }
        }
    }

    @Test
    fun goals_highContrast_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.LARGE) {
                GoalsContent(populatedState(), {}, {})
            }
        }
    }

    // ── Empty state ─────────────────────────────────────────────────────────

    @Test
    fun goals_empty_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                GoalsContent(
                    GoalsUiState(isLoading = false, activeCount = 0, completedCount = 0, goals = emptyList()),
                    {}, {},
                )
            }
        }
    }

    @Test
    fun goals_empty_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                GoalsContent(
                    GoalsUiState(isLoading = false, activeCount = 0, completedCount = 0, goals = emptyList()),
                    {}, {},
                )
            }
        }
    }

    // ── Error state ─────────────────────────────────────────────────────────

    @Test
    fun goals_error_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                GoalsContent(
                    GoalsUiState(
                        isLoading = false,
                        errorMessage = "Unable to load goals. Pull down to retry.",
                    ),
                    {}, {},
                )
            }
        }
    }

    @Test
    fun goals_error_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                GoalsContent(
                    GoalsUiState(
                        isLoading = false,
                        errorMessage = "Unable to load goals. Pull down to retry.",
                    ),
                    {}, {},
                )
            }
        }
    }
}
