// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.education

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme

/**
 * Financial glossary screen — lists all financial concepts with expandable
 * explanations (#378).
 *
 * Provides a searchable reference for users to learn about financial
 * terminology used throughout the app.
 *
 * @param onBack Navigation callback for the back button.
 * @param modifier Modifier for the screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FinancialGlossaryScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val concepts = remember {
        FinancialConceptContent.all().entries.toList().sortedBy { it.value.title }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Financial Glossary",
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Financial Glossary screen"
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics { contentDescription = "Navigate back" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        modifier = modifier,
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(
                items = concepts,
                key = { it.key.name },
            ) { (_, info) ->
                EducationTooltipCard(info = info)
            }
        }
    }
}

@Preview(showBackground = true, showSystemUi = true, name = "Glossary - Light")
@Composable
private fun GlossaryPreview() {
    FinanceTheme(dynamicColor = false) {
        FinancialGlossaryScreen()
    }
}
