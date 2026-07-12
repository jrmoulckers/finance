// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.checkin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/**
 * Supportive couples money check-in (#2150).
 *
 * Opt-in weekly/monthly ritual with neutral summaries (category totals, spend,
 * wedding pace) and collaborative discussion prompts. Designed to feel like a
 * conversation, not a surveillance report.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoneyCheckInScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CheckInViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Money check-in") },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics { contentDescription = "Go back" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(4.dp))
            OptInCard(state, viewModel)

            if (state.enabled) {
                IntroCard(state)
                SummaryCard(state)
                PromptsCard(state)
                Button(
                    onClick = viewModel::completeCheckIn,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Mark this check-in complete" },
                ) {
                    Icon(Icons.Filled.Check, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("We talked it through")
                }
                if (state.completedCount > 0) {
                    Text(
                        "You've completed ${state.completedCount} check-in(s) together. Nice teamwork.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun OptInCard(state: CheckInUiState, viewModel: CheckInViewModel) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Couples check-ins",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(
                        "A gentle, opt-in rhythm to talk about money together",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = state.enabled,
                    onCheckedChange = viewModel::setEnabled,
                    modifier = Modifier.semantics { contentDescription = "Enable couples check-ins" },
                )
            }
            if (state.enabled) {
                Text("How often?", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CheckInFrequency.entries.forEach { f ->
                        FilterChip(
                            selected = state.frequency == f,
                            onClick = { viewModel.setFrequency(f) },
                            label = { Text(f.displayName) },
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Share summaries with each other", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            "Category totals only — never individual transactions",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(
                        checked = state.shareSummaries,
                        onCheckedChange = viewModel::setShareSummaries,
                        modifier = Modifier.semantics { contentDescription = "Share summaries" },
                    )
                }
                Text(
                    state.lastCheckInText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun IntroCard(state: CheckInUiState) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                if (state.isDue) "Time for a check-in" else "You're up to date",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(CheckInContent.INTRO, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun SummaryCard(state: CheckInUiState) {
    if (!state.shareSummaries) {
        Card(Modifier.fillMaxWidth()) {
            Text(
                "Summaries are private right now. Turn on sharing above to review together.",
                Modifier.padding(16.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                "The big picture (${state.frequency.displayName.lowercase()})",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                "${state.totalSpentFormatted} across ${state.transactionCount} expenses",
                style = MaterialTheme.typography.bodyLarge,
            )
            if (state.topCategories.isNotEmpty()) {
                HorizontalDivider()
                state.topCategories.forEach { c ->
                    Row {
                        Text(c.name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        Text(c.amountFormatted, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            HorizontalDivider()
            Text(
                "Wedding paid so far: ${state.weddingPaidFormatted}",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                "Totals only — this is a conversation starter, not a ledger review.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PromptsCard(state: CheckInUiState) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                "Talk about",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            state.prompts.forEach { p ->
                Column {
                    Text(
                        p.topic,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(p.prompt, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@androidx.compose.ui.tooling.preview.Preview(showBackground = true)
@Composable
@Suppress("UnusedPrivateMember")
private fun MoneyCheckInScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        // Live data comes from the ViewModel.
    }
}
