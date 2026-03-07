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
 * Dashboard placeholder screen.
 *
 * Displays a summary view of the user's financial status.
 */
@Composable
fun DashboardScreen(
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceTheme.spacing.lg)
            .semantics { contentDescription = "Dashboard screen" },
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Dashboard",
            style = MaterialTheme.typography.headlineLarge,
            modifier = Modifier.semantics {
                contentDescription = "Dashboard heading"
            },
        )
        Text(
            text = "Your financial overview",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(top = FinanceTheme.spacing.sm)
                .semantics { contentDescription = "Your financial overview" },
        )
    }
}

@Preview(showBackground = true, name = "Dashboard")
@Composable
private fun DashboardScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        DashboardScreen()
    }
}
