package com.finance.desktop

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme

/**
 * Root composable for the Finance Windows desktop application.
 *
 * Applies [FinanceDesktopTheme] (Material 3 with design-token colors) and
 * renders the main application shell. This is the top-level composable
 * that will host navigation, sidebar, and content areas as the app grows.
 */
@Composable
fun FinanceApp() {
    FinanceDesktopTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.AccountBalance,
                    contentDescription = "Finance application icon",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.height(64.dp),
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Finance",
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Finance application title"
                    },
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Your personal finance tracker for Windows",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
