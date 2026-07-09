// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Semantic finance colors that live outside the Material 3
 * [androidx.compose.material3.ColorScheme].
 *
 * These express domain semantics — positive money movement (income) and
 * cautionary thresholds (warning) — in a single place instead of hardcoding hex
 * literals across individual screens.
 *
 * Exposed through the [LocalFinanceColors] [androidx.compose.runtime.CompositionLocal]
 * and accessible within a themed tree via `FinanceTheme.financeColors`.
 */
@Immutable
data class FinanceSemanticColors(
    /** Positive money movement: income, gains, on-track budgets. */
    val income: Color,
    /** Cautionary thresholds: near-limit budgets, due-soon bills. */
    val warning: Color,
)

// Design-token references. Light and dark currently resolve to the same values so
// existing golden snapshots stay pixel-identical; dedicated dark-mode contrast
// tuning is tracked as a separate issue.
private val IncomeGreen = Color(0xFF2E7D32)
private val WarningOrange = Color(0xFFFF9800)

internal val LightFinanceColors = FinanceSemanticColors(
    income = IncomeGreen,
    warning = WarningOrange,
)

internal val DarkFinanceColors = FinanceSemanticColors(
    income = IncomeGreen,
    warning = WarningOrange,
)

/**
 * Resolves the [FinanceSemanticColors] for the current theme mode.
 */
internal fun financeSemanticColors(darkTheme: Boolean): FinanceSemanticColors =
    if (darkTheme) DarkFinanceColors else LightFinanceColors

/**
 * [androidx.compose.runtime.CompositionLocal] carrying the active
 * [FinanceSemanticColors].
 *
 * Defaults to the light palette so composables rendered outside [FinanceTheme]
 * still resolve sensible values.
 */
val LocalFinanceColors = staticCompositionLocalOf { LightFinanceColors }
