// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.investment

import android.content.res.Configuration
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.core.investment.AssetClass
import org.koin.compose.viewmodel.koinViewModel

// Color palette for donut chart and legend
private val assetColors = mapOf(
    AssetClass.STOCKS to Color(0xFF2196F3),
    AssetClass.BONDS to Color(0xFF4CAF50),
    AssetClass.CASH to Color(0xFF9E9E9E),
    AssetClass.REAL_ESTATE to Color(0xFFFF9800),
    AssetClass.COMMODITIES to Color(0xFFFFD700),
    AssetClass.CRYPTO to Color(0xFF9C27B0),
    AssetClass.ALTERNATIVES to Color(0xFF795548),
    AssetClass.OTHER to Color(0xFF607D8B),
)

/**
 * Investment Portfolio View screen (#1119).
 *
 * Shows portfolio summary, holdings list, performance line chart,
 * and asset allocation donut chart with gain/loss coloring.
 * Full TalkBack accessibility.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvestmentPortfolioScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: InvestmentViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Portfolio",
                        modifier = Modifier.semantics {
                            contentDescription = "Investment Portfolio"
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
                    .padding(padding)
                    .semantics { contentDescription = "Loading portfolio data" },
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.semantics { contentDescription = "Loading" },
                )
            }
            return@Scaffold
        }

        InvestmentContent(
            state = state,
            modifier = Modifier.padding(padding),
        )
    }
}

@Composable
internal fun InvestmentContent(
    state: InvestmentUiState,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Portfolio summary card
        item(key = "summary") {
            PortfolioSummaryCard(
                name = state.portfolioName,
                totalValue = state.totalValueFormatted,
                gainLoss = state.totalGainLossFormatted,
                returnPercent = state.totalReturnPercent,
                isProfit = state.isOverallProfit,
                holdingCount = state.holdingCount,
            )
        }

        // Performance line chart
        if (state.performanceHistory.isNotEmpty()) {
            item(key = "chart") {
                Text(
                    "Performance",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Performance chart"
                    },
                )
                Spacer(Modifier.height(8.dp))
                PerformanceLineChart(
                    data = state.performanceHistory,
                    isProfit = state.isOverallProfit,
                )
            }
        }

        // Asset allocation donut
        if (state.allocation.isNotEmpty()) {
            item(key = "allocation") {
                Text(
                    "Asset Allocation",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Asset allocation breakdown"
                    },
                )
                Spacer(Modifier.height(8.dp))
                AssetAllocationChart(allocation = state.allocation)
            }
        }

        // Holdings header
        if (state.holdings.isNotEmpty()) {
            item(key = "holdings-header") {
                Text(
                    "Holdings (${state.holdingCount})",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "${state.holdingCount} holdings"
                    },
                )
            }

            items(state.holdings, key = { it.id }) { holding ->
                HoldingCard(holding)
            }
        }

        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
private fun PortfolioSummaryCard(
    name: String,
    totalValue: String,
    gainLoss: String,
    returnPercent: String,
    isProfit: Boolean,
    holdingCount: Int,
) {
    val gainLossColor = if (isProfit) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "$name: Total value $totalValue, " +
                    "gain/loss $gainLoss ($returnPercent), $holdingCount holdings"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(Modifier.padding(24.dp)) {
            Text(
                name,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                totalValue,
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (isProfit) Icons.Filled.TrendingUp else Icons.Filled.TrendingDown,
                    contentDescription = null,
                    tint = gainLossColor,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    "$gainLoss ($returnPercent)",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = gainLossColor,
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                "$holdingCount holdings",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
            )
        }
    }
}

/**
 * Performance line chart drawn with Compose Canvas.
 */
@Composable
private fun PerformanceLineChart(
    data: List<PerformancePoint>,
    isProfit: Boolean,
) {
    val lineColor = if (isProfit) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error
    val animProgress by animateFloatAsState(1f, animationSpec = tween(1000), label = "chart-anim")

    val description = "Performance chart showing ${data.size} months of data"

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = description },
    ) {
        Column(Modifier.padding(16.dp)) {
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
            ) {
                if (data.isEmpty()) return@Canvas

                val maxVal = data.maxOf { it.value }
                val minVal = data.minOf { it.value }
                val range = (maxVal - minVal).coerceAtLeast(1f)
                val stepX = size.width / (data.size - 1).coerceAtLeast(1)
                val padding = 8.dp.toPx()

                // Draw grid lines
                val gridColor = Color.Gray.copy(alpha = 0.2f)
                for (i in 0..4) {
                    val y = padding + (size.height - 2 * padding) * i / 4
                    drawLine(gridColor, Offset(0f, y), Offset(size.width, y), strokeWidth = 1f)
                }

                // Draw line path
                val path = Path()
                val points = data.mapIndexed { index, point ->
                    val x = index * stepX
                    val y = padding + (size.height - 2 * padding) * (1 - (point.value - minVal) / range)
                    Offset(x, y)
                }

                // Only draw up to animation progress
                val drawCount = (points.size * animProgress).toInt().coerceAtLeast(1)
                points.take(drawCount).forEachIndexed { index, point ->
                    if (index == 0) path.moveTo(point.x, point.y)
                    else path.lineTo(point.x, point.y)
                }

                drawPath(path, lineColor, style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round))

                // Draw data points
                points.take(drawCount).forEach { point ->
                    drawCircle(lineColor, radius = 4.dp.toPx(), center = point)
                    drawCircle(Color.White, radius = 2.dp.toPx(), center = point)
                }
            }

            // X-axis labels
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                data.forEachIndexed { i, point ->
                    if (i % 3 == 0 || i == data.size - 1) {
                        Text(
                            point.label,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

/**
 * Asset allocation donut chart drawn with Compose Canvas.
 */
@Composable
private fun AssetAllocationChart(allocation: List<AllocationSlice>) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Asset allocation: " +
                    allocation.joinToString(", ") { "${it.label} ${"%.0f".format(it.percentage)}%" }
            },
    ) {
        Row(
            Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Donut chart
            Box(
                modifier = Modifier
                    .size(140.dp)
                    .aspectRatio(1f),
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    val strokeWidth = 28.dp.toPx()
                    val arcSize = Size(size.width - strokeWidth, size.height - strokeWidth)
                    val topLeft = Offset(strokeWidth / 2, strokeWidth / 2)
                    var startAngle = -90f

                    allocation.forEach { slice ->
                        val sweepAngle = (slice.percentage / 100.0 * 360.0).toFloat()
                        val color = assetColors[slice.assetClass] ?: Color.Gray
                        drawArc(
                            color = color,
                            startAngle = startAngle,
                            sweepAngle = sweepAngle,
                            useCenter = false,
                            topLeft = topLeft,
                            size = arcSize,
                            style = Stroke(width = strokeWidth, cap = StrokeCap.Butt),
                        )
                        startAngle += sweepAngle
                    }
                }
            }

            Spacer(Modifier.width(16.dp))

            // Legend
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                allocation.forEach { slice ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val color = assetColors[slice.assetClass] ?: Color.Gray
                        Canvas(Modifier.size(12.dp)) {
                            drawCircle(color)
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "${slice.label} (${"%.0f".format(slice.percentage)}%)",
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HoldingCard(holding: HoldingUi) {
    val gainLossColor = if (holding.isProfit) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${holding.name} (${holding.symbol}): " +
                    "value ${holding.currentValueFormatted}, " +
                    "gain/loss ${holding.gainLossFormatted} (${holding.returnPercent})"
            },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (holding.isProfit) Icons.Filled.TrendingUp else Icons.Filled.TrendingDown,
                contentDescription = null,
                tint = gainLossColor,
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row {
                    Text(
                        holding.symbol,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        holding.assetClass,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    holding.name,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    holding.currentValueFormatted,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "${holding.gainLossFormatted} (${holding.returnPercent})",
                    style = MaterialTheme.typography.labelSmall,
                    color = gainLossColor,
                )
            }
        }
    }
}

// ── Previews ─────────────────────────────────────────────────────────

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Portfolio - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Portfolio - Dark")
@Composable
private fun InvestmentPortfolioPreview() {
    FinanceTheme(dynamicColor = false) {
        InvestmentContent(
            state = InvestmentUiState(
                isLoading = false,
                portfolioName = "My Portfolio",
                totalValueFormatted = "$78,650.00",
                totalGainLossFormatted = "+$10,870.00",
                totalReturnPercent = "+16.0%",
                isOverallProfit = true,
                holdingCount = 5,
                holdings = listOf(
                    HoldingUi("1", "AAPL", "Apple Inc.", "Stocks", "$9,250.00", "+$1,750.00", "+23.3%", true),
                    HoldingUi("2", "GOOGL", "Alphabet Inc.", "Stocks", "$15,800.00", "+$1,800.00", "+12.9%", true),
                    HoldingUi("3", "BND", "Vanguard Total Bond", "Bonds", "$7,400.00", "-$100.00", "-1.3%", false),
                ),
                allocation = listOf(
                    AllocationSlice(AssetClass.STOCKS, "Stocks", 48.0),
                    AllocationSlice(AssetClass.CRYPTO, "Crypto", 22.0),
                    AllocationSlice(AssetClass.BONDS, "Bonds", 15.0),
                    AllocationSlice(AssetClass.COMMODITIES, "Commodities", 15.0),
                ),
                performanceHistory = listOf(
                    PerformancePoint("Jan", 72000f), PerformancePoint("Apr", 76000f),
                    PerformancePoint("Jul", 79500f), PerformancePoint("Oct", 82500f),
                    PerformancePoint("Dec", 86500f),
                ),
            ),
        )
    }
}
