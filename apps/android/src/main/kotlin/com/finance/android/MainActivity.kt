package com.finance.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.finance.android.ui.theme.FinanceTheme

/**
 * Single-activity host for the Compose UI.
 *
 * All navigation is handled within Compose via navigation-compose.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            FinanceTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    FinancePlaceholder(modifier = Modifier.padding(innerPadding))
                }
            }
        }
    }
}

@Composable
fun FinancePlaceholder(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .semantics { contentDescription = "Finance home screen" },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "Finance",
            modifier = Modifier.semantics { contentDescription = "Finance app title" },
        )
    }
}
