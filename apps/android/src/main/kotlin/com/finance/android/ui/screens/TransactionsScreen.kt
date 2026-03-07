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
 * Transactions list placeholder screen.
 *
 * Will eventually display a filterable, searchable transaction feed.
 */
@Composable
fun TransactionsScreen(
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceTheme.spacing.lg)
            .semantics { contentDescription = "Transactions screen" },
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Transactions",
            style = MaterialTheme.typography.headlineLarge,
            modifier = Modifier.semantics {
                contentDescription = "Transactions heading"
            },
        )
        Text(
            text = "Your recent transactions",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(top = FinanceTheme.spacing.sm)
                .semantics { contentDescription = "Your recent transactions" },
        )
    }
}

@Preview(showBackground = true, name = "Transactions")
@Composable
private fun TransactionsScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        TransactionsScreen()
    }
}
