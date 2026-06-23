// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.desktop.crypto.DashboardLayout
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.CryptoDashboardUiState
import com.finance.desktop.viewmodel.CryptoDashboardViewModel
import com.finance.desktop.viewmodel.CryptoPositionUi

// =============================================================================
// Crypto Portfolio Dashboard — Issue #2176
//
// A responsive, ultrawide-first dashboard. Width drives the column count via the
// pure DashboardLayout breakpoint logic, so a 1440px+ monitor fans summary stats
// and holdings cards out side by side rather than compressing into a tall scroll.
//
// Accessibility: every movement is conveyed with an icon + text label and a
// spoken contentDescription — never by colour alone. The freshness chip is a
// polite live region so Narrator announces staleness changes.
// =============================================================================

/** Slice palette — paired with text labels so colour is never the only cue. */
private val AllocationPalette = listOf(
    Color(0xFF3B82F6),
    Color(0xFF22C55E),
    Color(0xFFF59E0B),
    Color(0xFF8B5CF6),
    Color(0xFF06B6D4),
    Color(0xFFEF4444),
)

@Composable
fun CryptoDashboardScreen(modifier: Modifier = Modifier) {
    // Self-contained construction: the offline mock source ships today; the live
    // adapter is injected here once #2702 (market-data credentials) lands.
    // TODO(human): Replace with the live CryptoPriceSource + real holdings source
    // (DI-provided) when the #2702 refresh pipeline and credentials are available.
    val viewModel = remember { CryptoDashboardViewModel() }
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(
                modifier = Modifier.semantics { contentDescription = "Loading crypto portfolio" },
            )
        }
        return
    }

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val widthDp = maxWidth.value.toInt()
        val summaryColumns = DashboardLayout.summaryColumns(DashboardLayout.tierForWidth(widthDp))
        val holdingsColumns = DashboardLayout.holdingsColumns(widthDp)
        val multiPanel = DashboardLayout.isMultiPanel(widthDp)
        val holdingsWeight = DashboardLayout.holdingsPanelWeight(widthDp)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(FinanceDesktopTheme.spacing.xxl)
                .semantics { contentDescription = "Crypto portfolio dashboard" },
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
        ) {
            DashboardHeader(state, onRefresh = viewModel::refresh)

            SummaryStatsGrid(state, columns = summaryColumns)

            if (multiPanel) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
                ) {
                    HoldingsPanel(
                        state = state,
                        columns = holdingsColumns,
                        modifier = Modifier.weight(holdingsWeight),
                    )
                    AllocationPanel(
                        state = state,
                        modifier = Modifier.weight(1f - holdingsWeight),
                    )
                }
            } else {
                HoldingsPanel(state = state, columns = holdingsColumns)
                AllocationPanel(state = state)
            }
        }
    }
}

// ─── Header + freshness ──────────────────────────────────────────────────────

@Composable
private fun DashboardHeader(state: CryptoDashboardUiState, onRefresh: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Crypto Portfolio",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Crypto Portfolio heading"
                },
            )
            Text(
                text = "Source: ${state.sourceName}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        FreshnessChip(state)

        IconButton(
            onClick = onRefresh,
            modifier = Modifier.semantics { contentDescription = "Refresh prices" },
        ) {
            if (state.isRefreshing) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Icon(Icons.Filled.Refresh, contentDescription = null)
            }
        }
    }
}

@Composable
private fun FreshnessChip(state: CryptoDashboardUiState) {
    val description = "${state.stalenessLabel}. ${state.lastUpdatedLabel}."
    AssistChip(
        onClick = {},
        enabled = false,
        label = {
            Column {
                Text(state.lastUpdatedLabel, style = MaterialTheme.typography.labelMedium)
                Text(state.stalenessLabel, style = MaterialTheme.typography.labelSmall)
            }
        },
        leadingIcon = {
            // Icon distinguishes stale vs live in addition to any colour change.
            if (state.isStale) {
                Icon(Icons.Filled.Warning, contentDescription = null, Modifier.size(18.dp))
            } else {
                Icon(Icons.Filled.Refresh, contentDescription = null, Modifier.size(18.dp))
            }
        },
        colors = AssistChipDefaults.assistChipColors(
            disabledContainerColor = if (state.isStale) {
                MaterialTheme.colorScheme.errorContainer
            } else {
                MaterialTheme.colorScheme.secondaryContainer
            },
        ),
        modifier = Modifier.semantics {
            contentDescription = description
            liveRegion = LiveRegionMode.Polite
        },
    )
}

// ─── Summary stats ───────────────────────────────────────────────────────────

@Composable
private fun SummaryStatsGrid(state: CryptoDashboardUiState, columns: Int) {
    val stats = listOf(
        Triple("Total value", state.totalValue, null),
        Triple("24h change", "${state.total24hChange} (${state.total24hChangePercent})", state.is24hPositive),
        Triple("Total profit / loss", "${state.totalPnl} (${state.totalPnlPercent})", state.isPnlPositive),
        Triple("Assets held", state.positions.size.toString(), null),
    )
    LazyVerticalGrid(
        columns = GridCells.Fixed(columns),
        modifier = Modifier.fillMaxWidth().height(((stats.size + columns - 1) / columns * 112).dp),
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
        userScrollEnabled = false,
    ) {
        items(stats) { (label, value, positive) ->
            SummaryStatCard(label = label, value = value, positive = positive)
        }
    }
}

@Composable
private fun SummaryStatCard(label: String, value: String, positive: Boolean?) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "$label: $value" },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (positive != null) {
                    DirectionIcon(positive)
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
                }
                Text(
                    text = value,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = positive.toAmountColor(),
                )
            }
        }
    }
}

// ─── Holdings ────────────────────────────────────────────────────────────────

@Composable
private fun HoldingsPanel(
    state: CryptoDashboardUiState,
    columns: Int,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Text(
            text = "Holdings",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Holdings"
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
        LazyVerticalGrid(
            columns = GridCells.Fixed(columns),
            modifier = Modifier.fillMaxWidth().height((((state.positions.size + columns - 1) / columns) * 148).dp),
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
            userScrollEnabled = false,
        ) {
            items(state.positions, key = { it.id }) { position ->
                HoldingCard(position)
            }
        }
    }
}

@Composable
private fun HoldingCard(position: CryptoPositionUi) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = position.accessibilityLabel },
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = position.symbol,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = position.name,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (position.isStale) {
                    Icon(
                        Icons.Filled.Warning,
                        contentDescription = "Price may be out of date",
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
            Text(
                text = position.value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "${position.quantity} ${position.symbol} @ ${position.price}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
            Row(verticalAlignment = Alignment.CenterVertically) {
                DirectionIcon(position.is24hPositive)
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
                Text(
                    text = "24h ${position.change24hPercent}",
                    style = MaterialTheme.typography.bodySmall,
                    color = position.is24hPositive.toAmountColor(),
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                Text(
                    text = "P/L ${position.pnlPercent}",
                    style = MaterialTheme.typography.bodySmall,
                    color = position.isPnlPositive.toAmountColor(),
                )
            }
        }
    }
}

// ─── Allocation ──────────────────────────────────────────────────────────────

@Composable
private fun AllocationPanel(state: CryptoDashboardUiState, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(
            text = "Allocation",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Allocation by asset"
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
                state.positions.forEachIndexed { index, position ->
                    AllocationRow(position, AllocationPalette[index % AllocationPalette.size])
                    if (index < state.positions.lastIndex) {
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                    }
                }
            }
        }
    }
}

@Composable
private fun AllocationRow(position: CryptoPositionUi, swatch: Color) {
    Column(
        modifier = Modifier.semantics {
            contentDescription = "${position.name}: ${position.allocationLabel}% of portfolio"
        },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(swatch),
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
            Text(
                text = position.symbol,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "${position.allocationLabel}%",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
        LinearProgressIndicator(
            progress = { position.allocationPercent },
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp)),
            color = swatch,
        )
    }
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

@Composable
private fun DirectionIcon(positive: Boolean) {
    if (positive) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.TrendingUp,
            contentDescription = "up",
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
    } else {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.TrendingDown,
            contentDescription = "down",
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.error,
        )
    }
}

@Composable
private fun Boolean?.toAmountColor(): Color = when (this) {
    true -> MaterialTheme.colorScheme.primary
    false -> MaterialTheme.colorScheme.error
    null -> MaterialTheme.colorScheme.onSurface
}
