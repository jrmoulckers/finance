// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.share

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.accessibility.financeSemantic
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/**
 * Teen privacy-safe sharing of savings wins and badge unlocks (#2210).
 *
 * Turns goal milestones, completions, badges, and streaks into celebratory
 * share cards while defaulting to hiding dollar amounts, then shares via the
 * Android Sharesheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareWinScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ShareWinViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Share a Win",
                        modifier = Modifier.semantics {
                            contentDescription = "Share a savings win"
                            heading()
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
        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "preview") { PreviewCard(state) }

            item(key = "pick-header") {
                Text(
                    "Pick a win",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
            }

            items(state.wins, key = { it.id }) { win ->
                WinRow(win = win, selected = win.id == state.selectedWinId, onSelect = { viewModel.selectWin(win.id) })
            }

            item(key = "privacy") {
                PrivacyControls(state = state, viewModel = viewModel)
            }

            item(key = "share") {
                Button(
                    onClick = {
                        val send = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, viewModel.shareText())
                        }
                        context.startActivity(Intent.createChooser(send, "Share your win"))
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .financeSemantic("Share to apps"),
                ) {
                    Icon(Icons.Filled.Share, contentDescription = null)
                    Text("  Share", style = MaterialTheme.typography.titleMedium)
                }
            }
        }
    }
}

@Composable
private fun PreviewCard(state: ShareWinUiState) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (state.isFullyPrivate) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(
                        Icons.Filled.Lock,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        "Private — no balances shared",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            Text(
                state.previewCaption,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.financeSemantic("Preview: ${state.previewCaption}"),
            )
        }
    }
}

@Composable
private fun WinRow(win: ShareableWinUi, selected: Boolean, onSelect: () -> Unit) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .financeSemantic("${win.title}, ${win.subtitle}", if (selected) "Selected" else null),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(win.emoji, style = MaterialTheme.typography.headlineSmall)
            Column(modifier = Modifier.weight(1f)) {
                Text(win.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                Text(win.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Button(onClick = onSelect, enabled = !selected) {
                Text(if (selected) "Selected" else "Choose")
            }
        }
    }
}

@Composable
private fun PrivacyControls(state: ShareWinUiState, viewModel: ShareWinViewModel) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Privacy", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
            ToggleRow(
                label = "Hide dollar amounts",
                checked = state.options.hideAmounts,
                onChange = viewModel::setHideAmounts,
            )
            ToggleRow(
                label = "Show only percent complete",
                checked = state.options.showPercentOnly,
                onChange = viewModel::setShowPercentOnly,
            )
        }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            modifier = Modifier.financeSemantic(label, if (checked) "On" else "Off"),
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun ShareWinScreenPreview() {
    FinanceTheme {
        ShareWinScreen()
    }
}
