// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import com.finance.android.ui.theme.FinanceTheme

/**
 * Budgets placeholder screen.
 *
 * Will eventually display budget categories with progress indicators.
 */
@Composable
fun BudgetsScreen(
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceTheme.spacing.lg)
            .semantics { contentDescription = "Budgets screen" },
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Budgets",
            style = MaterialTheme.typography.headlineLarge,
            modifier = Modifier.semantics {
                contentDescription = "Budgets heading"
            },
        )
        Text(
            text = "Track your spending",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(top = FinanceTheme.spacing.sm)
                .semantics { contentDescription = "Track your spending" },
        )
    }
}

@Preview(showBackground = true, name = "Budgets - Light")
@Preview(showBackground = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Budgets - Dark")
@Composable
private fun BudgetsScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        BudgetsScreen()
    }
}
