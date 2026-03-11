// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.onboarding

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.finance.android.FinanceApp

/**
 * Navigation route constants for the onboarding / main-app boundary.
 */
private object OnboardingRoutes {
    const val ONBOARDING = "onboarding"
    const val MAIN_APP = "main"
}

/**
 * Top-level composable that decides whether to show the onboarding flow or the
 * main application based on the persisted `isOnboardingComplete` flag.
 *
 * Place this at the root of your `setContent {}` block (e.g. in `MainActivity`):
 *
 * ```kotlin
 * setContent {
 *     FinanceTheme {
 *         OnboardingNavigation()
 *     }
 * }
 * ```
 *
 * The navigation graph contains two destinations:
 * - **onboarding** — the multi-step [OnboardingScreen]
 * - **main** — the full [FinanceApp] with bottom bar, FAB, and all screens
 *
 * After the user completes or skips onboarding the graph navigates to "main"
 * and removes the onboarding back-stack entry so pressing Back does not return
 * to onboarding.
 */
@Composable
fun OnboardingNavigation() {
    val context = LocalContext.current
    val navController = rememberNavController()

    val startDestination = if (OnboardingViewModel.isOnboardingComplete(context)) {
        OnboardingRoutes.MAIN_APP
    } else {
        OnboardingRoutes.ONBOARDING
    }

    NavHost(
        navController = navController,
        startDestination = startDestination,
    ) {
        composable(OnboardingRoutes.ONBOARDING) {
            val onboardingViewModel: OnboardingViewModel = viewModel()

            OnboardingScreen(
                viewModel = onboardingViewModel,
                onOnboardingComplete = {
                    navController.navigate(OnboardingRoutes.MAIN_APP) {
                        // Remove onboarding from the back stack so the user
                        // cannot navigate back into it.
                        popUpTo(OnboardingRoutes.ONBOARDING) { inclusive = true }
                    }
                },
            )
        }

        composable(OnboardingRoutes.MAIN_APP) {
            FinanceApp()
        }
    }
}
