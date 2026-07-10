// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme

enum class ConflictStrategy { KEEP_LOCAL, KEEP_REMOTE, MERGE, SKIP }

data class SyncConflict(
    val id: String, val entityType: String, val entityName: String,
    val localValue: String, val remoteValue: String, val fieldName: String,
    val localTimestamp: String, val remoteTimestamp: String,
    val resolution: ConflictStrategy? = null,
)

data class ConflictResolutionUiState(
    val conflicts: List<SyncConflict> = emptyList(),
    val selectedConflict: SyncConflict? = null,
    val isLoading: Boolean = false,
    val resolvedCount: Int = 0,
)

/**
 * Conflict resolution screen with list, detail, and resolution views.
 * Integrates with KMP sync engine conflict detection.
 */
@Composable
fun ConflictResolutionScreen(
    state: ConflictResolutionUiState,
    onSelectConflict: (SyncConflict) -> Unit,
    onResolve: (String, ConflictStrategy) -> Unit,
    onResolveAll: (ConflictStrategy) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxSize().padding(FinanceDesktopTheme.spacing.xxl)
        .semantics { contentDescription = "Conflict resolution screen" }) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Sync Conflicts", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() })
                Text("Resolve data conflicts between local and cloud", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (state.conflicts.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm)) {
                    OutlinedButton(onClick = { onResolveAll(ConflictStrategy.KEEP_LOCAL) }) { Text("Keep All Local") }
                    Button(onClick = { onResolveAll(ConflictStrategy.KEEP_REMOTE) }) { Text("Keep All Remote") }
                }
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        if (state.conflicts.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.CheckCircle, null, Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                    Text("No conflicts", style = MaterialTheme.typography.titleMedium)
                    Text("All data is synchronized", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else {
            Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl)) {
                // Conflict list
                ConflictListPanel(state.conflicts, state.selectedConflict?.id, onSelectConflict, Modifier.width(360.dp).fillMaxHeight())
                VerticalDivider(Modifier.fillMaxHeight())
                // Detail panel
                state.selectedConflict?.let { conflict ->
                    ConflictDetailPanel(conflict, onResolve, Modifier.weight(1f).fillMaxHeight())
                } ?: Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.Center) {
                    Text("Select a conflict to review", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun ConflictListPanel(conflicts: List<SyncConflict>, selectedId: String?, onSelect: (SyncConflict) -> Unit, modifier: Modifier) {
    Surface(modifier = modifier, shape = MaterialTheme.shapes.medium, tonalElevation = 1.dp) {
        Column(Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Text("Pending Conflicts ()", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading(); contentDescription = "Pending conflicts list" })
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            LazyColumn(verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm)) {
                items(conflicts, key = { it.id }) { conflict ->
                    val isSelected = conflict.id == selectedId
                    val bg = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface
                    Card(Modifier.fillMaxWidth().clickable { onSelect(conflict) }
                        .semantics { contentDescription = "${conflict.entityType}: ${conflict.entityName}, field: ${conflict.fieldName}${if (conflict.resolution != null) ", resolved" else ", pending"}" },
                        colors = CardDefaults.cardColors(containerColor = bg)) {
                        Row(Modifier.fillMaxWidth().padding(FinanceDesktopTheme.spacing.md), verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (conflict.resolution != null) Icons.Filled.CheckCircle else Icons.Filled.Warning, null,
                                tint = if (conflict.resolution != null) FinanceDesktopTheme.status.positive else MaterialTheme.colorScheme.error, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                            Column(Modifier.weight(1f)) {
                                Text(conflict.entityName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                                Text("${conflict.entityType} - ${conflict.fieldName}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ConflictDetailPanel(conflict: SyncConflict, onResolve: (String, ConflictStrategy) -> Unit, modifier: Modifier) {
    Column(modifier = modifier.padding(start = FinanceDesktopTheme.spacing.lg)) {
        Text("Conflict Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        Text("${conflict.entityType}: ${conflict.entityName}", style = MaterialTheme.typography.titleSmall)
        Text("Field: ${conflict.fieldName}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // Side-by-side comparison
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg)) {
            ComparisonCard("Local Value", conflict.localValue, conflict.localTimestamp, MaterialTheme.colorScheme.primaryContainer, Modifier.weight(1f))
            ComparisonCard("Remote Value", conflict.remoteValue, conflict.remoteTimestamp, MaterialTheme.colorScheme.secondaryContainer, Modifier.weight(1f))
        }
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        Text("Resolution Strategy", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md)) {
            OutlinedButton(onClick = { onResolve(conflict.id, ConflictStrategy.KEEP_LOCAL) }, Modifier.weight(1f).semantics { contentDescription = "Keep local value" }) {
                Icon(Icons.Filled.PhoneAndroid, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text("Keep Local") }
            OutlinedButton(onClick = { onResolve(conflict.id, ConflictStrategy.KEEP_REMOTE) }, Modifier.weight(1f).semantics { contentDescription = "Keep remote value" }) {
                Icon(Icons.Filled.Cloud, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text("Keep Remote") }
            Button(onClick = { onResolve(conflict.id, ConflictStrategy.MERGE) }, Modifier.weight(1f).semantics { contentDescription = "Merge both values" }) {
                Icon(Icons.Filled.Merge, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text("Merge") }
        }
    }
}

@Composable
private fun ComparisonCard(title: String, value: String, timestamp: String, bgColor: Color, modifier: Modifier) {
    ElevatedCard(modifier = modifier.semantics { contentDescription = "${title}: ${value}, updated ${timestamp}" },
        colors = CardDefaults.elevatedCardColors(containerColor = bgColor)) {
        Column(Modifier.fillMaxWidth().padding(FinanceDesktopTheme.spacing.lg)) {
            Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            Text(value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text("Updated: ${timestamp}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
