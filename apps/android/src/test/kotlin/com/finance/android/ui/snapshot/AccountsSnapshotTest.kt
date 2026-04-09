// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.snapshot

import com.finance.android.ui.data.SampleData
import com.finance.android.ui.screens.AccountDetailScreen
import com.finance.android.ui.screens.AccountsEmptyState
import com.finance.android.ui.screens.AccountsList
import com.finance.android.ui.viewmodel.AccountGroup
import com.finance.models.AccountType
import com.finance.models.types.Cents
import org.junit.Rule
import org.junit.Test

/**
 * Paparazzi snapshot tests for the Accounts list and detail screens.
 *
 * Captures golden images for the account list (grouped by type),
 * empty state, and account detail view in light/dark/high-contrast
 * modes at both 1.0× and 2.0× font scales.
 */
class AccountsSnapshotTest {

    @get:Rule
    val paparazzi = SnapshotTestConfig.paparazzi()

    // ── Account list ────────────────────────────────────────────────────────

    private fun sampleGroups() = listOf(
        AccountGroup(
            AccountType.CHECKING, "Checking",
            SampleData.accounts.filter { it.type == AccountType.CHECKING },
            Cents(524_73L), "\$524.73",
        ),
        AccountGroup(
            AccountType.SAVINGS, "Savings",
            SampleData.accounts.filter { it.type == AccountType.SAVINGS },
            Cents(18_670_00L), "\$18,670.00",
        ),
        AccountGroup(
            AccountType.CREDIT_CARD, "Credit Cards",
            SampleData.accounts.filter { it.type == AccountType.CREDIT_CARD },
            Cents(2_370_51L), "\$2,370.51",
        ),
        AccountGroup(
            AccountType.INVESTMENT, "Investments",
            SampleData.accounts.filter { it.type == AccountType.INVESTMENT },
            Cents(99_990_00L), "\$99,990.00",
        ),
    )

    @Test
    fun accountList_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                AccountsList(groups = sampleGroups(), onAccountClick = {})
            }
        }
    }

    @Test
    fun accountList_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                AccountsList(groups = sampleGroups(), onAccountClick = {})
            }
        }
    }

    @Test
    fun accountList_highContrast_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.NORMAL) {
                AccountsList(groups = sampleGroups(), onAccountClick = {})
            }
        }
    }

    @Test
    fun accountList_light_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.LARGE) {
                AccountsList(groups = sampleGroups(), onAccountClick = {})
            }
        }
    }

    @Test
    fun accountList_dark_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.LARGE) {
                AccountsList(groups = sampleGroups(), onAccountClick = {})
            }
        }
    }

    @Test
    fun accountList_highContrast_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.LARGE) {
                AccountsList(groups = sampleGroups(), onAccountClick = {})
            }
        }
    }

    // ── Account empty state ─────────────────────────────────────────────────

    @Test
    fun accountEmpty_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                AccountsEmptyState()
            }
        }
    }

    @Test
    fun accountEmpty_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                AccountsEmptyState()
            }
        }
    }

    // ── Account detail ──────────────────────────────────────────────────────

    @Test
    fun accountDetail_light_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.NORMAL) {
                AccountDetailScreen(
                    account = SampleData.accounts.first(),
                    transactions = SampleData.transactions.take(5),
                    onBack = {},
                )
            }
        }
    }

    @Test
    fun accountDetail_dark_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.NORMAL) {
                AccountDetailScreen(
                    account = SampleData.accounts.first(),
                    transactions = SampleData.transactions.take(5),
                    onBack = {},
                )
            }
        }
    }

    @Test
    fun accountDetail_highContrast_1x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.NORMAL) {
                AccountDetailScreen(
                    account = SampleData.accounts.first(),
                    transactions = SampleData.transactions.take(5),
                    onBack = {},
                )
            }
        }
    }

    @Test
    fun accountDetail_light_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.LIGHT, FontScale.LARGE) {
                AccountDetailScreen(
                    account = SampleData.accounts.first(),
                    transactions = SampleData.transactions.take(5),
                    onBack = {},
                )
            }
        }
    }

    @Test
    fun accountDetail_dark_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.DARK, FontScale.LARGE) {
                AccountDetailScreen(
                    account = SampleData.accounts.first(),
                    transactions = SampleData.transactions.take(5),
                    onBack = {},
                )
            }
        }
    }

    @Test
    fun accountDetail_highContrast_2x() {
        paparazzi.snapshot {
            SnapshotThemeWrapper(ThemeMode.HIGH_CONTRAST, FontScale.LARGE) {
                AccountDetailScreen(
                    account = SampleData.accounts.first(),
                    transactions = SampleData.transactions.take(5),
                    onBack = {},
                )
            }
        }
    }
}
