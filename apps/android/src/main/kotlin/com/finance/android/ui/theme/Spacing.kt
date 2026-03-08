// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Custom spacing scale derived from packages/design-tokens/tokens/primitive/spacing.json.
 *
 * Exposed through a [CompositionLocal] so every composable in the tree can
 * access spacing values via `FinanceTheme.spacing`.
 */
@Immutable
data class Spacing(
    val none: Dp = 0.dp,
    val xs: Dp = 4.dp,      // spacing.1
    val sm: Dp = 8.dp,      // spacing.2
    val md: Dp = 12.dp,     // spacing.3
    val lg: Dp = 16.dp,     // spacing.4
    val xl: Dp = 20.dp,     // spacing.5
    val xxl: Dp = 24.dp,    // spacing.6
    val xxxl: Dp = 32.dp,   // spacing.8
    val huge: Dp = 40.dp,   // spacing.10
    val massive: Dp = 48.dp, // spacing.12
    val colossal: Dp = 64.dp, // spacing.16
    val epic: Dp = 80.dp,   // spacing.20
)

val LocalSpacing = staticCompositionLocalOf { Spacing() }
