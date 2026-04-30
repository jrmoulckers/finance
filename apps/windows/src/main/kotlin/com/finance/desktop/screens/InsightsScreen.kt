// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Analytics
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.core.analytics.Trend
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.CategorySpendingUi
import com.finance.desktop.viewmodel.InsightsTab
import com.finance.desktop.viewmodel.InsightsViewModel
import com.finance.desktop.viewmodel.MonthlyComparisonUi
import com.finance.desktop.viewmodel.NetWorthPointUi
import com.finance.desktop.viewmodel.SpendingInsightUi

// ── Chart color palette ──────────────────────────────────────────────

private val chartColors = listOf(
    Color(0xFF3B82F6), // Blue
    Color(0xFF22C55E), // Green
    Color(0xFFF59E0B), // Amber
    Color(0xFFEF4444), // Red
    Color(0xFF8B5CF6), // Purple
    Color(0xFF06B6D4), // Cyan
    Color(0xFFF97316), // Orange
    Color(0xFFEC4899), // Pink
)

/**
 * Financial Insights Dashboard.
 *
 * Multi-panel layout with spending breakdown pie chart, income vs. expense
 * bar chart, category trends, and net worth line chart. Consumes KMP shared
 * [ReportGenerator] analytics through [InsightsViewModel].
 *
 * Narrator accessibility: heading semantics, content descriptions on all
 * charts and data points, tab navigation support.
 */
@Composable
fun InsightsScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<InsightsViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading insights"
                },
            )
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Financial Insights screen" },
    ) {
        // ── Header ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.Analytics,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                Text(
                    text = "Financial Insights",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.semantics { heading() },
                )
            }
            IconButton(
                onClick = { viewModel.refresh() },
                modifier = Modifier.semantics {
                    contentDescription = "Refresh insights"
                },
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null)
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        // ── Tab bar ──
        val tabs = InsightsTab.entries
        TabRow(
            selectedTabIndex = tabs.indexOf(state.selectedTab),
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ) {
            tabs.forEach { tab ->
                Tab(
                    selected = state.selectedTab == tab,
                    onClick = { viewModel.selectTab(tab) },
                    text = {
                        Text(
                            text = tab.name.lowercase().replaceFirstChar { it.uppercase() },
                            fontWeight = if (state.selectedTab == tab) FontWeight.SemiBold
                            else FontWeight.Normal,
                        )
                    },
                    modifier = Modifier.semantics {
                        contentDescription = "${tab.name} tab"
                    },
                )
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Tab content ──
        when (state.selectedTab) {
            InsightsTab.OVERVIEW -> OverviewTab(state.categorySpending, state.monthlyComparisons, state.totalSpendingFormatted)
            InsightsTab.CATEGORIES -> CategoriesTab(state.categorySpending, state.totalSpendingFormatted)
            InsightsTab.TRENDS -> TrendsTab(state.spendingInsights, state.netWorthHistory)
        }
    }
}

// ── Overview tab ─────────────────────────────────────────────────────

@Composable
private fun OverviewTab(
    categorySpending: List<CategorySpendingUi>,
    monthlyComparisons: List<MonthlyComparisonUi>,
    totalSpendingFormatted: String,
) {
    Row(
        modifier = Modifier.fillMaxSize(),
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
    ) {
        // Left: donut chart + category list
        Column(
            modifier = Modifier.weight(1f).fillMaxHeight(),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
        ) {
            ElevatedCard(
                modifier = Modifier.fillMaxWidth().semantics {
                    contentDescription = "Spending breakdown: $totalSpendingFormatted total this month"
                },
            ) {
                Column(
                    modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "Spending This Month",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { heading() },
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                    DonutChart(
                        items = categorySpending,
                        centerLabel = totalSpendingFormatted,
                        modifier = Modifier.size(180.dp),
                    )
                }
            }

            // Category legend
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
            ) {
                items(categorySpending) { cat ->
                    CategoryLegendRow(cat)
                }
            }
        }

        // Right: income vs expense bars
        Column(
            modifier = Modifier.weight(1f).fillMaxHeight(),
        ) {
            ElevatedCard(modifier = Modifier.fillMaxSize()) {
                Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl)) {
                    Text(
                        text = "Income vs. Expenses",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { heading() },
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                    IncomeExpenseChart(
                        comparisons = monthlyComparisons,
                        modifier = Modifier.fillMaxWidth().weight(1f),
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                    // Legend
                    Row(horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg)) {
                        LegendDot(Color(0xFF22C55E), "Income")
                        LegendDot(Color(0xFFEF4444), "Expenses")
                    }
                }
            }
        }
    }
}

// ── Categories tab ───────────────────────────────────────────────────

@Composable
private fun CategoriesTab(
    categorySpending: List<CategorySpendingUi>,
    totalSpendingFormatted: String,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Category Breakdown — $totalSpendingFormatted total",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            items(categorySpending) { cat ->
                CategoryBarRow(cat)
            }
        }
    }
}

// ── Trends tab ───────────────────────────────────────────────────────

@Composable
private fun TrendsTab(
    insights: List<SpendingInsightUi>,
    netWorthHistory: List<NetWorthPointUi>,
) {
    Row(
        modifier = Modifier.fillMaxSize(),
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
    ) {
        // Left: spending insights
        Column(modifier = Modifier.weight(1f).fillMaxHeight()) {
            Text(
                text = "Spending Trends",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            if (insights.isEmpty()) {
                Text(
                    text = "Not enough data for trends yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
                ) {
                    items(insights) { insight ->
                        InsightRow(insight)
                    }
                }
            }
        }

        // Right: net worth chart
        Column(modifier = Modifier.weight(1f).fillMaxHeight()) {
            ElevatedCard(modifier = Modifier.fillMaxSize()) {
                Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl)) {
                    Text(
                        text = "Net Worth Over Time",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { heading() },
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                    NetWorthLineChart(
                        points = netWorthHistory,
                        modifier = Modifier.fillMaxWidth().weight(1f),
                    )
                }
            }
        }
    }
}

// ── Chart composables ────────────────────────────────────────────────

/**
 * Donut (ring) chart showing category spending proportions.
 */
@Composable
private fun DonutChart(
    items: List<CategorySpendingUi>,
    centerLabel: String,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val strokeWidth = 28.dp.toPx()
            val radius = (size.minDimension - strokeWidth) / 2
            val center = Offset(size.width / 2, size.height / 2)
            val arcSize = Size(radius * 2, radius * 2)
            val topLeft = Offset(center.x - radius, center.y - radius)

            var startAngle = -90f
            items.forEach { item ->
                val sweep = item.percentage / 100f * 360f
                val color = chartColors[item.colorIndex % chartColors.size]
                drawArc(
                    color = color,
                    startAngle = startAngle,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Butt),
                )
                startAngle += sweep
            }

            // Gap ring
            if (items.isEmpty()) {
                drawArc(
                    color = Color.LightGray,
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Butt),
                )
            }
        }
        Text(
            text = centerLabel,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
    }
}

/**
 * Grouped bar chart for income vs. expenses over months.
 */
@Composable
private fun IncomeExpenseChart(
    comparisons: List<MonthlyComparisonUi>,
    modifier: Modifier = Modifier,
) {
    val incomeColor = Color(0xFF22C55E)
    val expenseColor = Color(0xFFEF4444)

    val accessibilityText = comparisons.joinToString("; ") {
        "${it.label}: income ${it.incomeFormatted}, expense ${it.expenseFormatted}"
    }

    Canvas(
        modifier = modifier.semantics {
            contentDescription = "Income vs Expense chart. $accessibilityText"
        },
    ) {
        if (comparisons.isEmpty()) return@Canvas
        val maxVal = comparisons.maxOf { maxOf(it.incomeAmount, it.expenseAmount) }
            .coerceAtLeast(1)
        val barGroupWidth = size.width / comparisons.size
        val barWidth = barGroupWidth * 0.3f
        val gap = barGroupWidth * 0.05f

        comparisons.forEachIndexed { index, mc ->
            val x = index * barGroupWidth + barGroupWidth * 0.15f
            val incomeHeight = (mc.incomeAmount.toFloat() / maxVal) * size.height * 0.85f
            val expenseHeight = (mc.expenseAmount.toFloat() / maxVal) * size.height * 0.85f

            // Income bar
            drawRect(
                color = incomeColor,
                topLeft = Offset(x, size.height - incomeHeight),
                size = Size(barWidth, incomeHeight),
            )
            // Expense bar
            drawRect(
                color = expenseColor,
                topLeft = Offset(x + barWidth + gap, size.height - expenseHeight),
                size = Size(barWidth, expenseHeight),
            )
        }
    }
}

/**
 * Line chart for net worth over time.
 */
@Composable
private fun NetWorthLineChart(
    points: List<NetWorthPointUi>,
    modifier: Modifier = Modifier,
) {
    val lineColor = MaterialTheme.colorScheme.primary
    val accessibilityText = points.joinToString("; ") {
        "${it.label}: ${it.formatted}"
    }

    Canvas(
        modifier = modifier.semantics {
            contentDescription = "Net worth chart. $accessibilityText"
        },
    ) {
        if (points.size < 2) return@Canvas
        val minVal = points.minOf { it.amount }
        val maxVal = points.maxOf { it.amount }
        val range = (maxVal - minVal).coerceAtLeast(1)

        val path = Path()
        points.forEachIndexed { index, point ->
            val x = index.toFloat() / (points.size - 1) * size.width
            val y = size.height - ((point.amount - minVal).toFloat() / range * size.height * 0.85f + size.height * 0.075f)
            if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }

        drawPath(
            path = path,
            color = lineColor,
            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
        )

        // Draw data points
        points.forEachIndexed { index, point ->
            val x = index.toFloat() / (points.size - 1) * size.width
            val y = size.height - ((point.amount - minVal).toFloat() / range * size.height * 0.85f + size.height * 0.075f)
            drawCircle(color = lineColor, radius = 5.dp.toPx(), center = Offset(x, y))
        }
    }
}

// ── Row composables ──────────────────────────────────────────────────

@Composable
private fun CategoryLegendRow(cat: CategorySpendingUi) {
    val color = chartColors[cat.colorIndex % chartColors.size]
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = FinanceDesktopTheme.spacing.sm, vertical = 2.dp)
            .semantics {
                contentDescription = "${cat.categoryName}: ${cat.amountFormatted}, ${cat.percentage.toInt()}%"
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Canvas(Modifier.size(12.dp)) {
            drawCircle(color = color)
        }
        Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
        Text(
            text = cat.categoryName,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = "${cat.percentage.toInt()}%",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
        Text(
            text = cat.amountFormatted,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun CategoryBarRow(cat: CategorySpendingUi) {
    val color = chartColors[cat.colorIndex % chartColors.size]
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = cat.categoryName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = "${cat.amountFormatted} (${cat.percentage.toInt()}%)",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            // Progress bar
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .semantics {
                        contentDescription = "${cat.categoryName}: ${cat.percentage.toInt()}% of total spending"
                    },
            ) {
                drawRoundRect(
                    color = color.copy(alpha = 0.2f),
                    size = size,
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(4.dp.toPx()),
                )
                drawRoundRect(
                    color = color,
                    size = Size(size.width * cat.percentage / 100f, size.height),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(4.dp.toPx()),
                )
            }
        }
    }
}

@Composable
private fun InsightRow(insight: SpendingInsightUi) {
    val trendColor = when (insight.trend) {
        Trend.UP -> MaterialTheme.colorScheme.error
        Trend.DOWN -> Color(0xFF22C55E)
        Trend.STABLE -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val trendIcon = when (insight.trend) {
        Trend.UP -> Icons.AutoMirrored.Filled.TrendingUp
        Trend.DOWN -> Icons.AutoMirrored.Filled.TrendingDown
        Trend.STABLE -> Icons.Filled.Remove
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${insight.categoryName}: ${insight.percentChange} change, " +
                    "current ${insight.currentFormatted}, previous ${insight.previousFormatted}"
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(FinanceDesktopTheme.spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = trendIcon,
                contentDescription = null,
                tint = trendColor,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = insight.categoryName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = "${insight.previousFormatted} → ${insight.currentFormatted}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = insight.percentChange,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = trendColor,
            )
        }
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.size(10.dp)) { drawCircle(color = color) }
        Spacer(Modifier.width(4.dp))
        Text(text = label, style = MaterialTheme.typography.labelSmall)
    }
}
