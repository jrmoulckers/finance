// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple

import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.koin.compose.viewmodel.koinViewModel

/**
 * Entry hub for the engaged-couples money workspace.
 *
 * Links to the five couple features (privacy, wedding, shared goals,
 * check-ins, debt planner) and lets partners personalize their display
 * names. Everything here is on-device and privacy-respecting.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoupleHubScreen(
    onBack: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenWedding: () -> Unit,
    onOpenGoals: () -> Unit,
    onOpenCheckIn: () -> Unit,
    onOpenDebt: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CoupleHubViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Our money") },
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
            IntroCard()
            ProfileCard(state, viewModel)

            Text(
                "Shared spaces",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .padding(top = 8.dp)
                    .semantics { heading() },
            )
            FeatureRow(
                icon = Icons.Filled.Lock,
                title = "Yours, mine & ours",
                subtitle = "Choose what stays private and what you share",
                onClick = onOpenPrivacy,
            )
            FeatureRow(
                icon = Icons.Filled.Favorite,
                title = "Wedding budget",
                subtitle = "Plan vendors, deposits, and per-guest costs together",
                onClick = onOpenWedding,
            )
            FeatureRow(
                icon = Icons.Filled.Home,
                title = "House down payment",
                subtitle = "Track shared goal contributions and milestones",
                onClick = onOpenGoals,
            )
            FeatureRow(
                icon = Icons.Filled.Forum,
                title = "Money check-ins",
                subtitle = "Supportive, opt-in conversations — not surveillance",
                onClick = onOpenCheckIn,
            )
            FeatureRow(
                icon = Icons.Filled.CreditCard,
                title = "Debt payoff planner",
                subtitle = "Compare avalanche vs. snowball as a team",
                onClick = onOpenDebt,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun IntroCard() {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                "Your shared money space",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                "Tools for engaged couples to plan together while keeping " +
                    "personal boundaries. Everything here stays on your device.",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun ProfileCard(state: CoupleHubUiState, viewModel: CoupleHubViewModel) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Who's who",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .weight(1f)
                        .semantics { heading() },
                )
                if (!state.isEditing) {
                    IconButton(
                        onClick = viewModel::startEditing,
                        modifier = Modifier.semantics { contentDescription = "Edit partner names" },
                    ) {
                        Icon(Icons.Filled.Edit, contentDescription = null)
                    }
                }
            }
            if (state.isEditing) {
                OutlinedTextField(
                    value = state.profile.partnerAName,
                    onValueChange = viewModel::updatePartnerAName,
                    label = { Text("Your name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.profile.partnerBName,
                    onValueChange = viewModel::updatePartnerBName,
                    label = { Text("Partner's name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.profile.sharedLabel,
                    onValueChange = viewModel::updateSharedLabel,
                    label = { Text("Shared label") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = viewModel::cancelEditing) { Text("Cancel") }
                    Button(onClick = viewModel::save) { Text("Save") }
                }
            } else {
                Text(
                    "${state.profile.partnerAName} · ${state.profile.partnerBName} · " +
                        "${state.profile.sharedLabel} (shared)",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }
    }
}

@Composable
private fun FeatureRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { contentDescription = "$title. $subtitle" },
    ) {
        Row(
            Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null)
        }
    }
}
