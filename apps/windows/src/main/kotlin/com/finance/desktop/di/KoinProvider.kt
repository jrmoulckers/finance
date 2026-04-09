// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import org.koin.core.context.GlobalContext

/**
 * Retrieves a dependency from the Koin global context for use in Compose Desktop.
 *
 * This is the desktop equivalent of `koinViewModel()` / `koinInject()` from the
 * Android/Compose Multiplatform Koin extensions. Since Compose Desktop does not
 * have a built-in Koin integration, we resolve directly from [GlobalContext].
 *
 * The resolved instance is [remember]ed so it survives recompositions.
 *
 * Usage:
 * ```kotlin
 * @Composable
 * fun DashboardScreen() {
 *     val viewModel = koinGet<DashboardViewModel>()
 *     val state by viewModel.uiState.collectAsState()
 *     // ...
 * }
 * ```
 */
@Composable
inline fun <reified T : Any> koinGet(): T {
    return remember { GlobalContext.get().get<T>() }
}
