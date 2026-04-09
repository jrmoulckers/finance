// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

/**
 * Composite "Planning" screen that hosts Budgets and Goals behind an
 * internal [TabRow].
 *
 * This replaces the former separate bottom-navigation entries for
 * Budgets and Goals, consolidating them into a single top-level tab.
 *
 * The selected tab index is preserved across configuration changes via
 * [rememberSaveable]. Child screens ([BudgetsScreen], [GoalsScreen])
 * retain their own ViewModel state scoped to the [NavBackStackEntry].
 *
 * @param onCreateBudget Called when the user taps the FAB on the Budgets tab.
 * @param onCreateGoal   Called when the user taps the FAB on the Goals tab.
 * @param modifier       Modifier applied to the root layout.
 */
@Composable
fun PlanningScreen(
    onCreateBudget: () -> Unit = {},
    onCreateGoal: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }

    Column(modifier = modifier.fillMaxSize()) {
        TabRow(
            selectedTabIndex = selectedTab,
            modifier = Modifier.semantics {
                contentDescription = "Planning section tabs"
            },
        ) {
            Tab(
                selected = selectedTab == 0,
                onClick = { selectedTab = 0 },
                text = { Text("Budgets") },
                modifier = Modifier.semantics {
                    contentDescription = "Budgets tab"
                },
            )
            Tab(
                selected = selectedTab == 1,
                onClick = { selectedTab = 1 },
                text = { Text("Goals") },
                modifier = Modifier.semantics {
                    contentDescription = "Goals tab"
                },
            )
        }

        when (selectedTab) {
            0 -> BudgetsScreen(onCreateBudget = onCreateBudget)
            1 -> GoalsScreen(onCreateGoal = onCreateGoal)
        }
    }
}
