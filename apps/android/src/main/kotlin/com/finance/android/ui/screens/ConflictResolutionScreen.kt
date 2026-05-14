// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Merge
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.finance.android.ui.viewmodel.ConflictItem
import com.finance.android.ui.viewmodel.ConflictResolutionUiState
import com.finance.android.ui.viewmodel.ConflictResolutionViewModel
import com.finance.android.ui.viewmodel.ResolutionStrategy
import org.koin.compose.viewmodel.koinViewModel

/**
 * Screen displaying sync conflicts with side-by-side diff view.
 *
 * Users can resolve each conflict individually or apply a bulk resolution
 * strategy. Each conflict shows the local and remote values for
 * conflicting fields.
 *
 * ## Accessibility
 * - All action buttons have `contentDescription`.
 * - Conflict cards are grouped with semantic descriptions.
 * - Section headings use `semantics { heading() }`.
 *
 * @param onNavigateBack Callback to navigate back.
 * @param viewModel [ConflictResolutionViewModel] injected via Koin.
 */
@Composable
fun ConflictResolutionScreen(
    onNavigateBack: () -> Unit,
    viewModel: ConflictResolutionViewModel = koinViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    when {
        uiState.isLoading -> LoadingState()
        uiState.conflicts.isEmpty() -> EmptyConflictsState(
            resolvedCount = uiState.resolvedCount,
            onGoBack = onNavigateBack,
        )
        else -> ConflictsListContent(
            uiState = uiState,
            onResolve = viewModel::resolveConflict,
            onResolveAll = viewModel::resolveAll,
        )
    }
}

@Composable
private fun LoadingState() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .semantics { contentDescription = "Loading sync conflicts" },
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}

@Composable
private fun EmptyConflictsState(
    resolvedCount: Int,
    onGoBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Default.Sync,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(bottom = 16.dp),
        )
        Text(
            text = if (resolvedCount > 0) {
                "All $resolvedCount conflict(s) resolved!"
            } else {
                "No sync conflicts"
            },
            style = MaterialTheme.typography.titleLarge,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Your data is in sync across all devices.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = onGoBack,
            modifier = Modifier.semantics { contentDescription = "Go back" },
        ) {
            Text("Done")
        }
    }
}

@Composable
private fun ConflictsListContent(
    uiState: ConflictResolutionUiState,
    onResolve: (String, ResolutionStrategy) -> Unit,
    onResolveAll: (ResolutionStrategy) -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Text(
                text = "Sync Conflicts (${uiState.conflicts.size})",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
        }

        // Bulk resolution bar
        item {
            BulkResolutionBar(onResolveAll = onResolveAll)
        }

        items(uiState.conflicts, key = { it.id }) { conflict ->
            ConflictCard(
                conflict = conflict,
                onResolve = { strategy -> onResolve(conflict.id, strategy) },
                isResolving = uiState.isResolving,
            )
        }
    }
}

@Composable
private fun BulkResolutionBar(
    onResolveAll: (ResolutionStrategy) -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            TextButton(
                onClick = { onResolveAll(ResolutionStrategy.KEEP_LOCAL) },
                modifier = Modifier.semantics {
                    contentDescription = "Keep all local versions"
                },
            ) {
                Icon(Icons.Default.PhoneAndroid, contentDescription = null)
                Spacer(modifier = Modifier.width(4.dp))
                Text("All Local")
            }
            TextButton(
                onClick = { onResolveAll(ResolutionStrategy.KEEP_REMOTE) },
                modifier = Modifier.semantics {
                    contentDescription = "Keep all remote versions"
                },
            ) {
                Icon(Icons.Default.Cloud, contentDescription = null)
                Spacer(modifier = Modifier.width(4.dp))
                Text("All Remote")
            }
        }
    }
}

@Composable
private fun ConflictCard(
    conflict: ConflictItem,
    onResolve: (ResolutionStrategy) -> Unit,
    isResolving: Boolean,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header
            Text(
                text = "${conflict.entityType} — ${conflict.entityId.take(8)}…",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics {
                    contentDescription = "Conflict in ${conflict.entityType}"
                },
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Side-by-side diff
            Row(modifier = Modifier.fillMaxWidth()) {
                // Local column
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Local",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(
                        text = conflict.localTimestamp,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    conflict.conflictFields.forEach { field ->
                        val value = conflict.localValue[field] ?: "—"
                        Text(
                            text = "$field: $value",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }

                Spacer(modifier = Modifier.width(8.dp))

                // Remote column
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Remote",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(
                        text = conflict.remoteTimestamp,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    conflict.conflictFields.forEach { field ->
                        val value = conflict.remoteValue[field] ?: "—"
                        Text(
                            text = "$field: $value",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            // Resolution actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                OutlinedButton(
                    onClick = { onResolve(ResolutionStrategy.KEEP_LOCAL) },
                    enabled = !isResolving,
                    modifier = Modifier.semantics {
                        contentDescription = "Keep local version of this record"
                    },
                ) {
                    Icon(Icons.Default.PhoneAndroid, contentDescription = null)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Local")
                }
                OutlinedButton(
                    onClick = { onResolve(ResolutionStrategy.KEEP_REMOTE) },
                    enabled = !isResolving,
                    modifier = Modifier.semantics {
                        contentDescription = "Keep remote version of this record"
                    },
                ) {
                    Icon(Icons.Default.Cloud, contentDescription = null)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Remote")
                }
                Button(
                    onClick = { onResolve(ResolutionStrategy.MERGE) },
                    enabled = !isResolving,
                    modifier = Modifier.semantics {
                        contentDescription = "Merge local and remote versions"
                    },
                ) {
                    Icon(Icons.Default.Merge, contentDescription = null)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Merge")
                }
            }
        }
    }
}
