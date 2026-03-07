package com.finance.android.ui.sync

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

// ---------------------------------------------------------------------------
// UI State
// ---------------------------------------------------------------------------

/**
 * Immutable UI state consumed by [SyncStatusScreen].
 *
 * Produced by [SyncStatusViewModel] and collected via `collectAsStateWithLifecycle`.
 */
data class SyncStatusUiState(
    val syncIconState: SyncIconState = SyncIconState.SYNCED,
    val lastSyncRelative: String = "Just now",
    val pendingChangeCount: Int = 0,
    val pendingChanges: List<PendingChangeItem> = emptyList(),
    val conflicts: List<ConflictItem> = emptyList(),
    val isSyncingNow: Boolean = false,
)

/**
 * A single pending mutation displayed in the pending-changes list.
 */
data class PendingChangeItem(
    val id: String,
    val tableName: String,
    val operation: String,
    val summary: String,
)

/**
 * A pair of conflicting records shown in the conflict resolution section.
 */
data class ConflictItem(
    val id: String,
    val fieldName: String,
    val localValue: String,
    val remoteValue: String,
)

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/**
 * Detailed sync status screen reachable from Settings or from the top-bar
 * [SyncStatusIcon].
 *
 * Shows last sync time, pending mutations, conflict resolution controls,
 * and a manual sync trigger.
 *
 * @param uiState Current UI state produced by [SyncStatusViewModel].
 * @param onSyncNowClick Callback to trigger a manual sync cycle.
 * @param onKeepMine Callback for resolving a conflict in favour of the local version.
 * @param onKeepTheirs Callback for resolving a conflict in favour of the remote version.
 * @param onCancelConflict Callback to dismiss conflict resolution without choosing.
 * @param onNavigateBack Callback to pop the back-stack.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncStatusScreen(
    uiState: SyncStatusUiState,
    onSyncNowClick: () -> Unit,
    onKeepMine: (conflictId: String) -> Unit,
    onKeepTheirs: (conflictId: String) -> Unit,
    onCancelConflict: (conflictId: String) -> Unit,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Sync Status",
                        modifier = Modifier.semantics {
                            contentDescription = "Sync Status screen"
                            heading()
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.semantics {
                            contentDescription = "Navigate back"
                        },
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                        )
                    }
                },
            )
        },
        modifier = modifier,
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ── Current state + last sync ────────────────────────────────
            item(key = "status_header") {
                SyncStateHeader(
                    iconState = uiState.syncIconState,
                    lastSyncRelative = uiState.lastSyncRelative,
                )
            }

            // ── Offline explanation ──────────────────────────────────────
            if (uiState.syncIconState == SyncIconState.OFFLINE) {
                item(key = "offline_explanation") {
                    OfflineExplanation()
                }
            }

            // ── Pending changes ─────────────────────────────────────────
            item(key = "pending_header") {
                PendingChangesHeader(count = uiState.pendingChangeCount)
            }

            items(
                items = uiState.pendingChanges,
                key = { it.id },
            ) { change ->
                PendingChangeRow(change = change)
            }

            // ── Conflicts ───────────────────────────────────────────────
            if (uiState.conflicts.isNotEmpty()) {
                item(key = "conflict_header") {
                    ConflictSectionHeader()
                }

                items(
                    items = uiState.conflicts,
                    key = { it.id },
                ) { conflict ->
                    ConflictCard(
                        conflict = conflict,
                        onKeepMine = { onKeepMine(conflict.id) },
                        onKeepTheirs = { onKeepTheirs(conflict.id) },
                        onCancel = { onCancelConflict(conflict.id) },
                    )
                }
            }

            // ── Sync Now button ─────────────────────────────────────────
            item(key = "sync_now") {
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = onSyncNowClick,
                    enabled = !uiState.isSyncingNow &&
                        uiState.syncIconState != SyncIconState.OFFLINE,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            contentDescription = if (uiState.isSyncingNow) {
                                "Sync in progress"
                            } else {
                                "Sync now"
                            }
                        },
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Sync,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(text = if (uiState.isSyncingNow) "Syncing…" else "Sync Now")
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Sub-composables
// ---------------------------------------------------------------------------

@Composable
private fun SyncStateHeader(
    iconState: SyncIconState,
    lastSyncRelative: String,
) {
    val (icon: ImageVector, label: String) = when (iconState) {
        SyncIconState.SYNCED -> Icons.Outlined.CloudDone to "Synced"
        SyncIconState.SYNCING -> Icons.Outlined.CloudSync to "Syncing"
        SyncIconState.OFFLINE -> Icons.Outlined.CloudOff to "Offline"
        SyncIconState.ERROR -> Icons.Outlined.Cloud to "Error"
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                contentDescription = "$label. Last synced $lastSyncRelative"
            },
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(40.dp),
        )
        Spacer(modifier = Modifier.width(16.dp))
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Last synced $lastSyncRelative",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun OfflineExplanation() {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = "You are currently offline. Changes you make will be saved " +
                "locally and synced automatically when your connection is restored.",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .padding(16.dp)
                .semantics {
                    contentDescription =
                        "You are currently offline. Changes will sync when connected."
                },
        )
    }
}

@Composable
private fun PendingChangesHeader(count: Int) {
    val label = when (count) {
        0 -> "No changes waiting to sync"
        1 -> "1 change waiting to sync"
        else -> "$count changes waiting to sync"
    }

    Text(
        text = label,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.semantics {
            contentDescription = label
            heading()
        },
    )
}

@Composable
private fun PendingChangeRow(change: PendingChangeItem) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .semantics(mergeDescendants = true) {
                contentDescription =
                    "${change.operation} on ${change.tableName}: ${change.summary}"
            },
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = change.summary,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${change.operation} · ${change.tableName}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ConflictSectionHeader() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.semantics {
            contentDescription = "Conflicts requiring resolution"
            heading()
        },
    ) {
        Icon(
            imageVector = Icons.Outlined.Warning,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(20.dp),
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "Conflicts",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

@Composable
private fun ConflictCard(
    conflict: ConflictItem,
    onKeepMine: () -> Unit,
    onKeepTheirs: () -> Unit,
    onCancel: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                contentDescription =
                    "Conflict on ${conflict.fieldName}. " +
                        "Your value: ${conflict.localValue}. " +
                        "Their value: ${conflict.remoteValue}."
            },
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = conflict.fieldName,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Side-by-side comparison
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Mine",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                    Text(
                        text = conflict.localValue,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Theirs",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                    Text(
                        text = conflict.remoteValue,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            // Action buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(
                    onClick = onCancel,
                    modifier = Modifier.semantics {
                        contentDescription =
                            "Cancel conflict resolution for ${conflict.fieldName}"
                    },
                ) {
                    Text("Cancel")
                }
                Spacer(modifier = Modifier.width(8.dp))
                OutlinedButton(
                    onClick = onKeepTheirs,
                    modifier = Modifier.semantics {
                        contentDescription =
                            "Keep their value for ${conflict.fieldName}"
                    },
                ) {
                    Text("Keep Theirs")
                }
                Spacer(modifier = Modifier.width(8.dp))
                Button(
                    onClick = onKeepMine,
                    modifier = Modifier.semantics {
                        contentDescription =
                            "Keep my value for ${conflict.fieldName}"
                    },
                ) {
                    Text("Keep Mine")
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

@Preview(name = "Synced state", showBackground = true, showSystemUi = true)
@Composable
private fun SyncStatusScreenSyncedPreview() {
    MaterialTheme {
        SyncStatusScreen(
            uiState = SyncStatusUiState(
                syncIconState = SyncIconState.SYNCED,
                lastSyncRelative = "2 minutes ago",
                pendingChangeCount = 0,
            ),
            onSyncNowClick = {},
            onKeepMine = {},
            onKeepTheirs = {},
            onCancelConflict = {},
            onNavigateBack = {},
        )
    }
}

@Preview(name = "Offline state", showBackground = true, showSystemUi = true)
@Composable
private fun SyncStatusScreenOfflinePreview() {
    MaterialTheme {
        SyncStatusScreen(
            uiState = SyncStatusUiState(
                syncIconState = SyncIconState.OFFLINE,
                lastSyncRelative = "15 minutes ago",
                pendingChangeCount = 3,
                pendingChanges = listOf(
                    PendingChangeItem(
                        id = "1",
                        tableName = "transactions",
                        operation = "UPDATE",
                        summary = "Grocery purchase — \$42.50",
                    ),
                    PendingChangeItem(
                        id = "2",
                        tableName = "accounts",
                        operation = "UPDATE",
                        summary = "Checking balance adjustment",
                    ),
                    PendingChangeItem(
                        id = "3",
                        tableName = "categories",
                        operation = "INSERT",
                        summary = "New category: Subscriptions",
                    ),
                ),
            ),
            onSyncNowClick = {},
            onKeepMine = {},
            onKeepTheirs = {},
            onCancelConflict = {},
            onNavigateBack = {},
        )
    }
}

@Preview(name = "Conflicted state", showBackground = true, showSystemUi = true)
@Composable
private fun SyncStatusScreenConflictedPreview() {
    MaterialTheme {
        SyncStatusScreen(
            uiState = SyncStatusUiState(
                syncIconState = SyncIconState.ERROR,
                lastSyncRelative = "5 minutes ago",
                pendingChangeCount = 1,
                pendingChanges = listOf(
                    PendingChangeItem(
                        id = "1",
                        tableName = "budgets",
                        operation = "UPDATE",
                        summary = "Monthly grocery budget",
                    ),
                ),
                conflicts = listOf(
                    ConflictItem(
                        id = "c1",
                        fieldName = "budgets → Monthly Groceries → amount",
                        localValue = "\$500.00",
                        remoteValue = "\$450.00",
                    ),
                    ConflictItem(
                        id = "c2",
                        fieldName = "goals → Emergency Fund → target",
                        localValue = "\$10,000.00",
                        remoteValue = "\$12,000.00",
                    ),
                ),
            ),
            onSyncNowClick = {},
            onKeepMine = {},
            onKeepTheirs = {},
            onCancelConflict = {},
            onNavigateBack = {},
        )
    }
}
