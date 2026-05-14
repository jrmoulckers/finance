// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.ContextMenuArea
import androidx.compose.foundation.ContextMenuItem
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.WidgetBoardItem
import com.finance.desktop.viewmodel.WidgetBoardViewModel
import com.finance.desktop.widgets.WidgetSize

// =============================================================================
// Widget Board Screen — Manage Windows 11 widgets with drag-to-reorder
// =============================================================================

/**
 * Widget Board management screen for the desktop Finance application.
 *
 * Allows users to:
 * - Enable/disable individual widgets
 * - Resize widgets (Small, Medium, Large)
 * - Reorder widgets via up/down buttons
 * - Refresh all widget content
 *
 * When the app is packaged as MSIX, widgets appear in the Windows 11
 * Widget Board. When unpackaged, this screen shows an informational
 * banner explaining the requirement.
 *
 * Narrator reads widget name, status, current size, and available actions
 * for each card.
 */
@Composable
@Suppress("LongMethod") // Widget board grid composable
fun WidgetBoardScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<WidgetBoardViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading widget board"
                },
            )
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Widget Board screen" },
    ) {
        // ── Header ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "Widget Board",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Widget Board heading"
                    },
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                Text(
                    text = "Configure widgets for the Windows 11 Widget Board",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Button(
                onClick = { viewModel.refreshWidgets() },
                enabled = !state.isRefreshing,
                modifier = Modifier.semantics {
                    contentDescription = "Refresh all widgets"
                },
            ) {
                if (state.isRefreshing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(Icons.Filled.Refresh, contentDescription = null)
                }
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text("Refresh All")
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        // ── MSIX info banner ──
        if (!state.isPackaged) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.tertiaryContainer,
                tonalElevation = 1.dp,
            ) {
                Row(
                    modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Filled.Dashboard,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onTertiaryContainer,
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                    Text(
                        text = "Widget Board integration requires the app to be packaged as MSIX. " +
                            "You can still configure widgets here for when the app is installed from the Store.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                        modifier = Modifier.semantics {
                            contentDescription =
                                "Information: Widget Board requires MSIX packaging for full integration"
                        },
                    )
                }
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        }

        // ── Error banner ──
        state.errorMessage?.let { error ->
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.errorContainer,
            ) {
                Text(
                    text = error,
                    modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        // ── Widget list ──
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
        ) {
            items(state.widgets, key = { it.type.id }) { widget ->
                WidgetBoardCard(
                    item = widget,
                    onToggle = { viewModel.toggleWidget(widget.type) },
                    onResize = { newSize -> viewModel.resizeWidget(widget.type, newSize) },
                    onMoveUp = { viewModel.moveWidgetUp(widget.type) },
                    onMoveDown = { viewModel.moveWidgetDown(widget.type) },
                )
            }
        }
    }
}

// =============================================================================
// Widget Board Card
// =============================================================================

@Composable
@Suppress("LongMethod") // Widget detail composable
private fun WidgetBoardCard(
    item: WidgetBoardItem,
    onToggle: () -> Unit,
    onResize: (WidgetSize) -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
) {
    val statusLabel = if (item.enabled) "enabled" else "disabled"
    val accessibilityLabel = buildString {
        append("${item.type.displayName} widget, $statusLabel, ")
        append("size ${item.size.displayName}")
    }

    ContextMenuArea(
        items = {
            listOf(
                ContextMenuItem(if (item.enabled) "Disable" else "Enable") { onToggle() },
                ContextMenuItem("Move Up") { onMoveUp() },
                ContextMenuItem("Move Down") { onMoveDown() },
            )
        },
    ) {
        ElevatedCard(
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = accessibilityLabel },
            colors = CardDefaults.elevatedCardColors(
                containerColor = if (item.enabled) {
                    MaterialTheme.colorScheme.surface
                } else {
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                },
            ),
        ) {
            Column(
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
            ) {
                // Top row: widget info + toggle + reorder
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(
                            Icons.Filled.Widgets,
                            contentDescription = null,
                            tint = if (item.enabled) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            modifier = Modifier.size(24.dp),
                        )
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                        Column {
                            Text(
                                text = item.type.displayName,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = item.type.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    // Reorder + toggle buttons
                    Row {
                        IconButton(
                            onClick = onMoveUp,
                            modifier = Modifier.semantics {
                                contentDescription = "Move ${item.type.displayName} up"
                            },
                        ) {
                            Icon(
                                Icons.Filled.ArrowUpward,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                        IconButton(
                            onClick = onMoveDown,
                            modifier = Modifier.semantics {
                                contentDescription = "Move ${item.type.displayName} down"
                            },
                        ) {
                            Icon(
                                Icons.Filled.ArrowDownward,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                        IconButton(
                            onClick = onToggle,
                            modifier = Modifier.semantics {
                                contentDescription =
                                    if (item.enabled) "Disable ${item.type.displayName}" else "Enable ${item.type.displayName}"
                            },
                        ) {
                            Icon(
                                if (item.enabled) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                                contentDescription = null,
                                tint = if (item.enabled) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                    }
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                // Size selection chips
                Row(
                    horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
                ) {
                    Text(
                        text = "Size:",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.align(Alignment.CenterVertically),
                    )
                    item.type.supportedSizes.forEach { size ->
                        FilterChip(
                            selected = item.size == size,
                            onClick = { onResize(size) },
                            label = { Text(size.displayName) },
                            modifier = Modifier.semantics {
                                contentDescription =
                                    "${size.displayName} size${if (item.size == size) ", selected" else ""}"
                            },
                        )
                    }
                }
            }
        }
    }
}
