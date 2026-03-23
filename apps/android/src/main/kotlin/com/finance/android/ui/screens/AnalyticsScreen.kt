// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.AnalyticsPeriod
import com.finance.android.ui.viewmodel.AnalyticsUiState
import com.finance.android.ui.viewmodel.AnalyticsViewModel
import com.finance.android.ui.viewmodel.CategorySpending
import com.finance.android.ui.viewmodel.IncomeExpenseComparison
import com.finance.android.ui.viewmodel.MonthlyTrendPoint
import com.finance.android.ui.viewmodel.PayeeSpending
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import org.koin.compose.viewmodel.koinViewModel

// ── Chart color constants ────────────────────────────────────────────
private val IncomeGreen = Color(0xFF2E7D32)
private val IncomeGreenLight = Color(0xFF66BB6A)

/**
 * Analytics / Spending Trends screen.
 *
 * Displays period-filtered spending breakdowns, monthly income-vs-expense
 * trends, top payees, and savings rate. All charts are rendered with
 * Compose [Canvas] — no external chart library is used.
 *
 * Every interactive and informational element carries a
 * [contentDescription] for TalkBack compatibility.
 */
@Composable
fun AnalyticsScreen(
    modifier: Modifier = Modifier,
    viewModel: AnalyticsViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .semantics { contentDescription = "Loading analytics" },
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading indicator"
                },
            )
        }
        return
    }

    AnalyticsContent(
        state = state,
        onPeriodSelected = viewModel::selectPeriod,
        modifier = modifier,
    )
}

/**
 * Stateless analytics content composable that renders the full screen layout.
 *
 * Separated from [AnalyticsScreen] for preview and testing support.
 */
@Composable
private fun AnalyticsContent(
    state: AnalyticsUiState,
    onPeriodSelected: (AnalyticsPeriod) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // ── Period selector ──────────────────────────────────────
        item(key = "period-selector") {
            PeriodSelector(
                selectedPeriod = state.selectedPeriod,
                onPeriodSelected = onPeriodSelected,
            )
        }

        // ── Summary cards ────────────────────────────────────────
        item(key = "summary-cards") {
            SummaryCardsRow(
                totalSpent = state.totalSpent,
                totalIncome = state.totalIncome,
                savingsRate = state.savingsRate,
            )
        }

        // ── Spending by category donut chart ─────────────────────
        if (state.spendingByCategory.isNotEmpty()) {
            item(key = "category-header") {
                SectionHeader(title = "Spending by Category")
            }
            item(key = "category-donut") {
                SpendingDonutChart(
                    categories = state.spendingByCategory,
                    totalSpent = state.totalSpent,
                    currency = state.currency,
                )
            }
            item(key = "category-legend") {
                CategoryLegend(
                    categories = state.spendingByCategory,
                    currency = state.currency,
                )
            }
        }

        // ── Monthly trend bar chart ──────────────────────────────
        if (state.monthlyTrend.isNotEmpty()) {
            item(key = "trend-header") {
                SectionHeader(title = "Monthly Trend")
            }
            item(key = "trend-chart") {
                MonthlyTrendChart(
                    data = state.monthlyTrend,
                    currency = state.currency,
                )
            }
        }

        // ── Top payees ───────────────────────────────────────────
        if (state.topPayees.isNotEmpty()) {
            item(key = "payees-header") {
                SectionHeader(title = "Top Payees")
            }
            itemsIndexed(
                items = state.topPayees,
                key = { _, payee -> "payee-${payee.payee}" },
            ) { index, payee ->
                TopPayeeItem(
                    rank = index + 1,
                    payee = payee,
                    currency = state.currency,
                )
            }
        }

        // ── Income vs expense bar ────────────────────────────────
        state.incomeVsExpense?.let { comparison ->
            item(key = "comparison-header") {
                SectionHeader(title = "Income vs Expense")
            }
            item(key = "comparison-bar") {
                IncomeVsExpenseBar(
                    comparison = comparison,
                    currency = state.currency,
                )
            }
        }

        // Bottom spacer for FAB clearance
        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Period Selector
// ═══════════════════════════════════════════════════════════════════════

/**
 * Horizontally scrollable row of [FilterChip]s for selecting the analytics
 * time period. Each chip announces its selected state to TalkBack.
 */
@Composable
private fun PeriodSelector(
    selectedPeriod: AnalyticsPeriod,
    onPeriodSelected: (AnalyticsPeriod) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(horizontal = 4.dp),
    ) {
        items(AnalyticsPeriod.entries.toList(), key = { it.name }) { period ->
            val isSelected = period == selectedPeriod
            FilterChip(
                selected = isSelected,
                onClick = { onPeriodSelected(period) },
                label = { Text(period.label) },
                modifier = Modifier.semantics {
                    contentDescription = if (isSelected) {
                        "${period.label}, selected"
                    } else {
                        "${period.label}, not selected"
                    }
                },
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Summary Cards
// ═══════════════════════════════════════════════════════════════════════

/** Row of three summary metric cards: Total Spent, Total Income, Savings Rate. */
@Composable
private fun SummaryCardsRow(
    totalSpent: String,
    totalIncome: String,
    savingsRate: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SummaryCard(
            label = "Spent",
            value = totalSpent,
            icon = Icons.Filled.TrendingDown,
            iconTint = MaterialTheme.colorScheme.error,
            modifier = Modifier.weight(1f),
        )
        SummaryCard(
            label = "Income",
            value = totalIncome,
            icon = Icons.Filled.AttachMoney,
            iconTint = IncomeGreen,
            modifier = Modifier.weight(1f),
        )
        SummaryCard(
            label = "Saved",
            value = savingsRate,
            icon = Icons.Filled.Savings,
            iconTint = MaterialTheme.colorScheme.tertiary,
            modifier = Modifier.weight(1f),
        )
    }
}

/** Individual summary metric card with icon, label, and formatted value. */
@Composable
private fun SummaryCard(
    label: String,
    value: String,
    icon: ImageVector,
    iconTint: Color,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.semantics {
            contentDescription = "$label: $value"
        },
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Spending by Category — Donut Chart
// ═══════════════════════════════════════════════════════════════════════

/**
 * Resolves the chart color palette from Material 3 theme tokens.
 *
 * The first four categories use primary, secondary, tertiary, and error;
 * additional categories cycle through container variants.
 */
@Composable
private fun chartColors(): List<Color> = listOf(
    MaterialTheme.colorScheme.primary,
    MaterialTheme.colorScheme.secondary,
    MaterialTheme.colorScheme.tertiary,
    MaterialTheme.colorScheme.error,
    MaterialTheme.colorScheme.primaryContainer,
    MaterialTheme.colorScheme.secondaryContainer,
    MaterialTheme.colorScheme.tertiaryContainer,
    MaterialTheme.colorScheme.errorContainer,
    MaterialTheme.colorScheme.surfaceVariant,
    MaterialTheme.colorScheme.inversePrimary,
)

/**
 * Donut chart rendering spending proportions by category.
 *
 * Uses [Canvas] to draw arc segments coloured per category. The total
 * spent amount is displayed in the centre of the donut. A comprehensive
 * [contentDescription] is generated so TalkBack can announce all
 * category breakdowns.
 */
@Composable
private fun SpendingDonutChart(
    categories: List<CategorySpending>,
    totalSpent: String,
    currency: Currency,
    modifier: Modifier = Modifier,
) {
    val colors = chartColors()
    val sweepAnimProgress by animateFloatAsState(
        targetValue = 1f,
        animationSpec = tween(durationMillis = 800),
        label = "donut-sweep",
    )

    // Build accessibility description for all category data
    val a11yDescription = remember(categories, totalSpent) {
        buildString {
            append("Spending by category donut chart. Total spent: $totalSpent. ")
            categories.forEach { cat ->
                val formatted = CurrencyFormatter.format(cat.amount, currency)
                append("${cat.name}: $formatted, ${cat.percentage.toInt()}%. ")
            }
        }
    }

    ElevatedCard(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = a11yDescription },
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            val strokeWidth = 32.dp
            val gapDegrees = 2f

            Canvas(modifier = Modifier.size(200.dp)) {
                val sw = strokeWidth.toPx()
                val arcSize = Size(size.width - sw, size.height - sw)
                val topLeft = Offset(sw / 2, sw / 2)

                // Background track
                drawArc(
                    color = Color.LightGray.copy(alpha = 0.2f),
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = sw, cap = StrokeCap.Butt),
                )

                // Category arcs
                var currentAngle = -90f
                categories.forEach { cat ->
                    val sweepAngle =
                        (cat.percentage / 100f) * 360f * sweepAnimProgress - gapDegrees
                    if (sweepAngle > 0f) {
                        val color = colors.getOrElse(cat.colorIndex % colors.size) {
                            colors.first()
                        }
                        drawArc(
                            color = color,
                            startAngle = currentAngle + gapDegrees / 2,
                            sweepAngle = sweepAngle,
                            useCenter = false,
                            topLeft = topLeft,
                            size = arcSize,
                            style = Stroke(width = sw, cap = StrokeCap.Round),
                        )
                    }
                    currentAngle += (cat.percentage / 100f) * 360f
                }
            }

            // Centre total label
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "Total",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = totalSpent,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

/**
 * Legend listing each category with its colour swatch, name, amount, and percentage.
 *
 * Categories are displayed in descending order by amount (matching the donut chart).
 * Each item has a [contentDescription] for TalkBack.
 */
@Composable
private fun CategoryLegend(
    categories: List<CategorySpending>,
    currency: Currency,
    modifier: Modifier = Modifier,
) {
    val colors = chartColors()

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        categories.forEach { cat ->
            val color = colors.getOrElse(cat.colorIndex % colors.size) { colors.first() }
            val formatted = CurrencyFormatter.format(cat.amount, currency)
            val pct = "${cat.percentage.toInt()}%"

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription =
                            "${cat.name}: $formatted, $pct of spending"
                    },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Colour swatch
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(color),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = cat.name,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = formatted,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = pct,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Monthly Trend — Bar Chart
// ═══════════════════════════════════════════════════════════════════════

/**
 * Side-by-side bar chart comparing monthly income (green) and expense (red).
 *
 * Uses [Canvas] to draw paired vertical bars for each month. X-axis shows
 * month abbreviations; bars are scaled to the maximum value. A full
 * accessibility description is provided via [contentDescription].
 */
@Composable
private fun MonthlyTrendChart(
    data: List<MonthlyTrendPoint>,
    currency: Currency,
    modifier: Modifier = Modifier,
) {
    val expenseColor = MaterialTheme.colorScheme.error
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant

    val animProgress by animateFloatAsState(
        targetValue = 1f,
        animationSpec = tween(durationMillis = 600),
        label = "bar-grow",
    )

    val maxValue = remember(data) {
        data.maxOfOrNull {
            maxOf(it.income.amount, it.expense.amount)
        }?.coerceAtLeast(1L) ?: 1L
    }

    val a11yDescription = remember(data) {
        buildString {
            append("Monthly income vs expense bar chart. ")
            data.forEach { pt ->
                val inc = CurrencyFormatter.format(pt.income, currency)
                val exp = CurrencyFormatter.format(pt.expense, currency)
                append("${pt.label}: income $inc, expense $exp. ")
            }
        }
    }

    val density = LocalDensity.current
    val labelSizePx = with(density) { 10.sp.toPx() }

    ElevatedCard(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = a11yDescription },
    ) {
        Column(Modifier.padding(16.dp)) {
            // Legend row
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                ChartLegendDot(color = IncomeGreenLight, label = "Income")
                ChartLegendDot(color = expenseColor, label = "Expense")
            }
            Spacer(Modifier.height(12.dp))

            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
            ) {
                val chartHeight = size.height - labelSizePx - 16f
                val barGroupWidth = size.width / data.size
                val barWidth = barGroupWidth * 0.3f
                val gap = barGroupWidth * 0.05f

                data.forEachIndexed { index, point ->
                    val groupX = index * barGroupWidth
                    val incomeHeight =
                        (point.income.amount.toFloat() / maxValue) * chartHeight * animProgress
                    val expenseHeight =
                        (point.expense.amount.toFloat() / maxValue) * chartHeight * animProgress

                    // Income bar (left)
                    val incomeLeft = groupX + (barGroupWidth - 2 * barWidth - gap) / 2
                    drawRoundBar(
                        color = IncomeGreenLight,
                        left = incomeLeft,
                        barWidth = barWidth,
                        barHeight = incomeHeight,
                        chartHeight = chartHeight,
                    )

                    // Expense bar (right)
                    val expenseLeft = incomeLeft + barWidth + gap
                    drawRoundBar(
                        color = expenseColor,
                        left = expenseLeft,
                        barWidth = barWidth,
                        barHeight = expenseHeight,
                        chartHeight = chartHeight,
                    )

                    // Month label
                    drawContext.canvas.nativeCanvas.drawText(
                        point.label,
                        groupX + barGroupWidth / 2,
                        size.height,
                        android.graphics.Paint().apply {
                            color = labelColor.toArgb()
                            textSize = labelSizePx
                            textAlign = android.graphics.Paint.Align.CENTER
                            isAntiAlias = true
                        },
                    )
                }
            }
        }
    }
}

/** Draws a single vertical bar with rounded top corners. */
private fun DrawScope.drawRoundBar(
    color: Color,
    left: Float,
    barWidth: Float,
    barHeight: Float,
    chartHeight: Float,
) {
    if (barHeight <= 0f) return
    val top = chartHeight - barHeight
    drawRoundRect(
        color = color,
        topLeft = Offset(left, top),
        size = Size(barWidth, barHeight),
        cornerRadius = CornerRadius(barWidth / 4, barWidth / 4),
    )
}

/** Small coloured dot + label for chart legends. */
@Composable
private fun ChartLegendDot(
    color: Color,
    label: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.semantics {
            contentDescription = "$label legend indicator"
        },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(color),
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Top Payees
// ═══════════════════════════════════════════════════════════════════════

/**
 * Single item in the top payees list showing rank, payee name, amount, and
 * transaction count. All values are announced to TalkBack via
 * [contentDescription].
 */
@Composable
private fun TopPayeeItem(
    rank: Int,
    payee: PayeeSpending,
    currency: Currency,
    modifier: Modifier = Modifier,
) {
    val formatted = CurrencyFormatter.format(payee.amount, currency)
    val txnLabel = if (payee.transactionCount == 1) "transaction" else "transactions"

    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription =
                    "Number $rank: ${payee.payee}, $formatted, " +
                        "${payee.transactionCount} $txnLabel"
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Rank badge
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "$rank",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = payee.payee,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${payee.transactionCount} $txnLabel",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = formatted,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Income vs Expense — Horizontal Bar
// ═══════════════════════════════════════════════════════════════════════

/**
 * Horizontal comparison bars showing income (green) vs expense (red).
 *
 * Each bar is scaled proportionally so the larger of income/expense fills
 * the available width. The net amount is displayed below the bars.
 * Full [contentDescription] is provided for TalkBack.
 */
@Composable
private fun IncomeVsExpenseBar(
    comparison: IncomeExpenseComparison,
    currency: Currency,
    modifier: Modifier = Modifier,
) {
    val expenseColor = MaterialTheme.colorScheme.error
    val incomeFmt = CurrencyFormatter.format(comparison.income, currency)
    val expenseFmt = CurrencyFormatter.format(comparison.expense, currency)
    val netFmt = CurrencyFormatter.format(comparison.net, currency, showSign = true)
    val netIsPositive = comparison.net.isPositive() || comparison.net.isZero()

    val a11yDescription =
        "Income vs expense comparison. Income: $incomeFmt. Expense: $expenseFmt. Net: $netFmt"

    ElevatedCard(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = a11yDescription },
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            val maxAmount = maxOf(comparison.income.amount, comparison.expense.amount)
                .coerceAtLeast(1L)
            val incomeFraction = comparison.income.amount.toFloat() / maxAmount
            val expenseFraction = comparison.expense.amount.toFloat() / maxAmount

            val incomeAnimated by animateFloatAsState(
                targetValue = incomeFraction,
                animationSpec = tween(600),
                label = "income-bar",
            )
            val expenseAnimated by animateFloatAsState(
                targetValue = expenseFraction,
                animationSpec = tween(600),
                label = "expense-bar",
            )

            // Income bar
            HorizontalMetricBar(
                label = "Income",
                value = incomeFmt,
                fraction = incomeAnimated,
                color = IncomeGreen,
            )
            Spacer(Modifier.height(12.dp))

            // Expense bar
            HorizontalMetricBar(
                label = "Expense",
                value = expenseFmt,
                fraction = expenseAnimated,
                color = expenseColor,
            )
            Spacer(Modifier.height(12.dp))

            // Net amount
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "Net",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = netFmt,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = if (netIsPositive) IncomeGreen else expenseColor,
                )
            }
        }
    }
}

/**
 * A single labelled horizontal bar with a fill percentage.
 *
 * Renders as a rounded rectangle track with a coloured fill overlay.
 */
@Composable
private fun HorizontalMetricBar(
    label: String,
    value: String,
    fraction: Float,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.height(4.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(12.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction.coerceIn(0f, 1f))
                    .height(12.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(color),
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Shared section header
// ═══════════════════════════════════════════════════════════════════════

/** Accessible section header with heading semantics for TalkBack navigation. */
@Composable
private fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        modifier = modifier.semantics {
            heading()
            contentDescription = "$title section"
        },
    )
}

// ═══════════════════════════════════════════════════════════════════════
// Previews
// ═══════════════════════════════════════════════════════════════════════

@Preview(showBackground = true, showSystemUi = true, name = "Analytics - Light")
@Preview(
    showBackground = true,
    showSystemUi = true,
    uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES,
    name = "Analytics - Dark",
)
@Composable
private fun AnalyticsScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        AnalyticsContent(
            state = AnalyticsUiState(
                isLoading = false,
                selectedPeriod = AnalyticsPeriod.MONTH,
                totalSpent = "$1,247.63",
                totalIncome = "$4,100.00",
                savingsRate = "69%",
                spendingByCategory = listOf(
                    CategorySpending("Groceries", Cents(45_000L), 35f, 0),
                    CategorySpending("Dining Out", Cents(25_000L), 20f, 1),
                    CategorySpending("Transportation", Cents(18_000L), 14f, 2),
                    CategorySpending("Shopping", Cents(15_000L), 12f, 3),
                    CategorySpending("Entertainment", Cents(12_000L), 10f, 4),
                    CategorySpending("Utilities", Cents(9_763L), 9f, 5),
                ),
                monthlyTrend = listOf(
                    MonthlyTrendPoint("Oct", Cents(400_000L), Cents(280_000L)),
                    MonthlyTrendPoint("Nov", Cents(410_000L), Cents(310_000L)),
                    MonthlyTrendPoint("Dec", Cents(450_000L), Cents(350_000L)),
                    MonthlyTrendPoint("Jan", Cents(400_000L), Cents(290_000L)),
                    MonthlyTrendPoint("Feb", Cents(420_000L), Cents(320_000L)),
                    MonthlyTrendPoint("Mar", Cents(410_000L), Cents(124_763L)),
                ),
                incomeVsExpense = IncomeExpenseComparison(
                    income = Cents(410_000L),
                    expense = Cents(124_763L),
                    net = Cents(285_237L),
                ),
                topPayees = listOf(
                    PayeeSpending("Whole Foods Market", Cents(25_000L), 4),
                    PayeeSpending("Costco", Cents(15_678L), 2),
                    PayeeSpending("Uber", Cents(14_500L), 3),
                    PayeeSpending("Target", Cents(6_742L), 1),
                    PayeeSpending("Starbucks", Cents(5_850L), 2),
                ),
                currency = Currency.USD,
            ),
            onPeriodSelected = {},
        )
    }
}

@Preview(showBackground = true, name = "Analytics - Empty - Light")
@Composable
private fun AnalyticsEmptyPreview() {
    FinanceTheme(dynamicColor = false) {
        AnalyticsContent(
            state = AnalyticsUiState(
                isLoading = false,
                selectedPeriod = AnalyticsPeriod.WEEK,
            ),
            onPeriodSelected = {},
        )
    }
}
