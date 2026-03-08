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
 * Goals placeholder screen.
 *
 * Will eventually display savings goals with progress bars.
 */
@Composable
fun GoalsScreen(
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceTheme.spacing.lg)
            .semantics { contentDescription = "Goals screen" },
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Goals",
            style = MaterialTheme.typography.headlineLarge,
            modifier = Modifier.semantics {
                contentDescription = "Goals heading"
            },
        )
        Text(
            text = "Your savings goals",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(top = FinanceTheme.spacing.sm)
                .semantics { contentDescription = "Your savings goals" },
        )
    }
}

@Preview(showBackground = true, name = "Goals")
@Composable
private fun GoalsScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        GoalsScreen()
    }
}
