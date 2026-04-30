// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.AllocationSlice
import com.finance.desktop.viewmodel.HoldingUi
import com.finance.desktop.viewmodel.InvestmentUiState
import com.finance.desktop.viewmodel.InvestmentViewModel
import com.finance.desktop.viewmodel.PerformancePoint
import com.finance.desktop.viewmodel.PerformanceRange
import kotlin.math.cos
import kotlin.math.sin

// =============================================================================
// Investment Portfolio Screen — Sprint 22
// =============================================================================

/** Palette for the allocation pie chart slices. */
private val AllocationColors = listOf(
    Color(0xFF3B82F6), // Blue
    Color(0xFF22C55E), // Green
    Color(0xFFF59E0B), // Amber
    Color(0xFFEF4444), // Red
    Color(0xFF8B5CF6), // Purple
    Color(0xFF06B6D4), // Cyan
)

/**
 * Investment Portfolio screen with portfolio summary, holdings table,
 * Canvas performance line chart, and Canvas allocation donut chart.
 *
 * Narrator reads portfolio totals, each holding's details, and chart summaries.
 * High contrast colours adapt via [MaterialTheme.colorScheme].
 */
@Composable
fun InvestmentScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<InvestmentViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(
                modifier = Modifier.semantics { contentDescription = "Loading portfolio data" },
            )
        }
        return
    }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Investment Portfolio screen" },
        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
    ) {
        // Header
        item {
            Text(
                text = "Investment Portfolio",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Investment Portfolio heading"
                },
            )
        }

        // Summary card
        item { PortfolioSummaryCard(state) }

        // Charts row: Performance + Allocation
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
            ) {
                PerformanceChartCard(
                    data = state.performanceData,
                    selectedRange = state.selectedRange,
                    onRangeChange = viewModel::setPerformanceRange,
                    isPositive = state.isTotalPositive,
                    modifier = Modifier.weight(1.5f),
                )
                AllocationChartCard(
                    data = state.allocationData,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        // Holdings table
        item {
            Text(
                text = "Holdings",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Holdings table"
                },
            )
        }

        // Table header
        item { HoldingsTableHeader() }

        // Holding rows
        items(state.holdings, key = { it.id }) { holding ->
            HoldingRow(holding)
        }
    }
}

// ─── Portfolio summary card ──────────────────────────────────────────────────

@Composable
private fun PortfolioSummaryCard(state: InvestmentUiState) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = buildString {
                    append("Portfolio value: ${state.totalPortfolioValue}. ")
                    append("Today: ${state.totalDayChange} (${state.totalDayChangePercent}). ")
                    append("Total return: ${state.totalReturn} (${state.totalReturnPercent}).")
                }
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ShowChart,
                    contentDescription = null,
                    modifier = Modifier.size(32.dp),
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                Text(
                    text = "Total Portfolio Value",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            Text(
                text = state.totalPortfolioValue,
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxxl),
            ) {
                ChangeIndicator(
                    label = "Today",
                    change = state.totalDayChange,
                    changePercent = state.totalDayChangePercent,
                    isPositive = state.isDayPositive,
                )
                ChangeIndicator(
                    label = "Total Return",
                    change = state.totalReturn,
                    changePercent = state.totalReturnPercent,
                    isPositive = state.isTotalPositive,
                )
            }
        }
    }
}

@Composable
private fun ChangeIndicator(
    label: String,
    change: String,
    changePercent: String,
    isPositive: Boolean,
) {
    val color = if (isPositive) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = if (isPositive) Icons.AutoMirrored.Filled.TrendingUp
                else Icons.AutoMirrored.Filled.TrendingDown,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
            Text(
                text = "$change ($changePercent)",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = color,
            )
        }
    }
}

// ─── Performance chart (Canvas) ──────────────────────────────────────────────

@Composable
private fun PerformanceChartCard(
    data: List<PerformancePoint>,
    selectedRange: PerformanceRange,
    onRangeChange: (PerformanceRange) -> Unit,
    isPositive: Boolean,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(modifier = modifier) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Text(
                text = "Performance",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            // Range selector chips
            Row(horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs)) {
                PerformanceRange.entries.forEach { range ->
                    val label = when (range) {
                        PerformanceRange.ONE_WEEK -> "1W"
                        PerformanceRange.ONE_MONTH -> "1M"
                        PerformanceRange.THREE_MONTHS -> "3M"
                        PerformanceRange.SIX_MONTHS -> "6M"
                        PerformanceRange.ONE_YEAR -> "1Y"
                        PerformanceRange.ALL_TIME -> "All"
                    }
                    FilterChip(
                        selected = selectedRange == range,
                        onClick = { onRangeChange(range) },
                        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.semantics {
                            contentDescription = "$label performance range"
                        },
                    )
                }
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            // Canvas chart
            val lineColor = if (isPositive) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error
            val fillColor = lineColor.copy(alpha = 0.1f)

            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .semantics {
                        contentDescription = "Performance chart showing portfolio value over time"
                    },
            ) {
                if (data.isEmpty()) return@Canvas

                val minVal = data.minOf { it.value }
                val maxVal = data.maxOf { it.value }
                val range = (maxVal - minVal).coerceAtLeast(1f)
                val stepX = size.width / (data.size - 1).coerceAtLeast(1)
                val padding = 4f

                // Build path
                val linePath = Path()
                val fillPath = Path()

                data.forEachIndexed { i, point ->
                    val x = i * stepX
                    val y = padding + (size.height - 2 * padding) * (1f - (point.value - minVal) / range)

                    if (i == 0) {
                        linePath.moveTo(x, y)
                        fillPath.moveTo(x, size.height)
                        fillPath.lineTo(x, y)
                    } else {
                        linePath.lineTo(x, y)
                        fillPath.lineTo(x, y)
                    }
                }

                // Close fill path
                fillPath.lineTo((data.size - 1) * stepX, size.height)
                fillPath.close()

                // Draw fill
                drawPath(fillPath, fillColor, style = Fill)

                // Draw line
                drawPath(
                    linePath,
                    lineColor,
                    style = Stroke(width = 2.5f, cap = StrokeCap.Round, join = StrokeJoin.Round),
                )

                // Draw end dot
                val lastX = (data.size - 1) * stepX
                val lastY = padding + (size.height - 2 * padding) *
                    (1f - (data.last().value - minVal) / range)
                drawCircle(lineColor, radius = 4f, center = Offset(lastX, lastY))
            }
        }
    }
}

// ─── Allocation chart (Canvas donut) ─────────────────────────────────────────

@Composable
private fun AllocationChartCard(
    data: List<AllocationSlice>,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(modifier = modifier) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Allocation",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { heading() },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

            // Donut chart
            Canvas(
                modifier = Modifier
                    .size(180.dp)
                    .semantics {
                        contentDescription = buildString {
                            append("Asset allocation: ")
                            data.forEach { append("${it.label} ${(it.percent * 100).toInt()}%, ") }
                        }
                    },
            ) {
                val strokeWidth = 36f
                val radius = (size.minDimension - strokeWidth) / 2
                val center = Offset(size.width / 2, size.height / 2)
                var startAngle = -90f

                data.forEach { slice ->
                    val sweep = slice.percent * 360f
                    val color = AllocationColors[slice.colorIndex % AllocationColors.size]

                    drawArc(
                        color = color,
                        startAngle = startAngle,
                        sweepAngle = sweep,
                        useCenter = false,
                        topLeft = Offset(center.x - radius, center.y - radius),
                        size = androidx.compose.ui.geometry.Size(radius * 2, radius * 2),
                        style = Stroke(width = strokeWidth, cap = StrokeCap.Butt),
                    )
                    startAngle += sweep
                }
            }

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

            // Legend
            data.forEach { slice ->
                val color = AllocationColors[slice.colorIndex % AllocationColors.size]
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp)
                        .semantics {
                            contentDescription = "${slice.label}: ${(slice.percent * 100).toInt()}%"
                        },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(color),
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text(
                        text = slice.label,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = "${(slice.percent * 100).toInt()}%",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

// ─── Holdings table ──────────────────────────────────────────────────────────

@Composable
private fun HoldingsTableHeader() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MaterialTheme.colorScheme.surfaceVariant,
                RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp),
            )
            .padding(horizontal = FinanceDesktopTheme.spacing.lg, vertical = FinanceDesktopTheme.spacing.md),
    ) {
        Text("Symbol", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.width(80.dp))
        Text("Name", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        Text("Shares", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.width(80.dp), textAlign = TextAlign.End)
        Text("Price", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.width(100.dp), textAlign = TextAlign.End)
        Text("Value", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.width(110.dp), textAlign = TextAlign.End)
        Text("Day", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.width(110.dp), textAlign = TextAlign.End)
        Text("Total", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.width(120.dp), textAlign = TextAlign.End)
    }
}

@Composable
private fun HoldingRow(holding: HoldingUi) {
    val dayColor = if (holding.isPositive) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error
    val totalColor = if (holding.totalReturn.startsWith("+")) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = buildString {
                    append("${holding.symbol} ${holding.name}: ")
                    append("${holding.shares} shares at ${holding.pricePerShare}, ")
                    append("value ${holding.totalValue}, ")
                    append("today ${holding.dayChange} (${holding.dayChangePercent}), ")
                    append("total return ${holding.totalReturn} (${holding.totalReturnPercent})")
                }
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = FinanceDesktopTheme.spacing.lg, vertical = FinanceDesktopTheme.spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Symbol
            Text(
                text = holding.symbol,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.width(80.dp),
            )
            // Name
            Text(
                text = holding.name,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            // Shares
            Text(
                text = holding.shares,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.width(80.dp),
                textAlign = TextAlign.End,
            )
            // Price
            Text(
                text = holding.pricePerShare,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.width(100.dp),
                textAlign = TextAlign.End,
            )
            // Value
            Text(
                text = holding.totalValue,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.width(110.dp),
                textAlign = TextAlign.End,
            )
            // Day change
            Column(
                modifier = Modifier.width(110.dp),
                horizontalAlignment = Alignment.End,
            ) {
                Text(
                    text = holding.dayChange,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = dayColor,
                )
                Text(
                    text = holding.dayChangePercent,
                    style = MaterialTheme.typography.labelSmall,
                    color = dayColor,
                )
            }
            // Total return
            Column(
                modifier = Modifier.width(120.dp),
                horizontalAlignment = Alignment.End,
            ) {
                Text(
                    text = holding.totalReturn,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = totalColor,
                )
                Text(
                    text = holding.totalReturnPercent,
                    style = MaterialTheme.typography.labelSmall,
                    color = totalColor,
                )
            }
        }
    }
}
