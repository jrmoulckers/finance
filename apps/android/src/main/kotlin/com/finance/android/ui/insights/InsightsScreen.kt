// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.insights

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
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
import com.finance.core.insights.HealthAssessment
import com.finance.core.insights.TrendDirection
import org.koin.compose.viewmodel.koinViewModel

/** Chart color palette for spending category breakdown. */
private val chartColors = listOf(
    Color(0xFF2196F3), Color(0xFF4CAF50), Color(0xFFFF9800),
    Color(0xFFE91E63), Color(0xFF9C27B0), Color(0xFF00BCD4),
    Color(0xFF795548), Color(0xFFFF5722), Color(0xFF607D8B),
    Color(0xFF3F51B5),
)

/**
 * Financial Insights Dashboard screen (#241).
 *
 * Displays spending category breakdown, trends, income vs expense
 * summary, financial health score, and recommendations.
 */
@Composable
fun InsightsScreen(
    modifier: Modifier = Modifier,
    viewModel: InsightsViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .semantics { contentDescription = "Loading insights" },
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics { contentDescription = "Loading indicator" },
            )
        }
        return
    }

    InsightsContent(state = state, modifier = modifier)
}

@Composable
internal fun InsightsContent(
    state: InsightsUiState,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Health score hero card
        item(key = "health-score") {
            HealthScoreCard(
                score = state.healthScore,
                assessment = state.healthAssessment,
            )
        }

        // Income vs expense summary
        state.incomeExpense?.let { summary ->
            item(key = "income-expense") {
                IncomeExpenseCard(summary = summary)
            }
        }

        // Spending breakdown header
        if (state.categoryBreakdown.isNotEmpty()) {
            item(key = "breakdown-header") {
                Text(
                    text = "Spending Breakdown",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Spending Breakdown section"
                    },
                )
            }

            // Donut chart
            item(key = "donut-chart") {
                SpendingDonutChart(categories = state.categoryBreakdown)
            }

            // Category list
            items(state.categoryBreakdown, key = { it.name }) { category ->
                CategoryBreakdownItem(category = category)
            }
        }

        // Trends
        if (state.categoryTrends.isNotEmpty()) {
            item(key = "trends-header") {
                Text(
                    text = "Spending Trends",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Spending Trends section"
                    },
                )
            }

            items(state.categoryTrends, key = { it.name }) { trend ->
                TrendItem(trend = trend)
            }
        }

        // Health components
        if (state.healthComponents.isNotEmpty()) {
            item(key = "health-header") {
                Text(
                    text = "Health Score Breakdown",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Health Score Breakdown section"
                    },
                )
            }

            items(state.healthComponents, key = { it.name }) { component ->
                HealthComponentItem(component = component)
            }
        }

        // Recommendations
        if (state.recommendations.isNotEmpty()) {
            item(key = "recs-header") {
                Text(
                    text = "Recommendations",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Recommendations section"
                    },
                )
            }

            items(state.recommendations) { rec ->
                RecommendationItem(text = rec)
            }
        }

        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

// ── Health Score Card ────────────────────────────────────────────────

@Composable
private fun HealthScoreCard(score: Int, assessment: HealthAssessment) {
    val scoreColor = when (assessment) {
        HealthAssessment.EXCELLENT -> Color(0xFF2E7D32)
        HealthAssessment.GOOD -> Color(0xFF4CAF50)
        HealthAssessment.FAIR -> Color(0xFFFF9800)
        HealthAssessment.NEEDS_ATTENTION -> Color(0xFFFF5722)
        HealthAssessment.CRITICAL -> Color(0xFFC62828)
    }
    val assessmentLabel = when (assessment) {
        HealthAssessment.EXCELLENT -> "Excellent"
        HealthAssessment.GOOD -> "Good"
        HealthAssessment.FAIR -> "Fair"
        HealthAssessment.NEEDS_ATTENTION -> "Needs Attention"
        HealthAssessment.CRITICAL -> "Critical"
    }
    val animatedProgress by animateFloatAsState(
        targetValue = score / 100f,
        animationSpec = tween(1000),
        label = "health-score",
    )

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Financial health score: $score out of 100, $assessmentLabel"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(
            Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Financial Health",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(16.dp))
            Box(Modifier.size(120.dp), contentAlignment = Alignment.Center) {
                val trackColor = MaterialTheme.colorScheme.surfaceVariant
                Canvas(Modifier.size(120.dp)) {
                    val sw = 10.dp.toPx()
                    val arcSize = Size(size.width - sw, size.height - sw)
                    val topLeft = Offset(sw / 2, sw / 2)
                    drawArc(trackColor, -90f, 360f, false, topLeft, arcSize, style = Stroke(sw, cap = StrokeCap.Round))
                    drawArc(scoreColor, -90f, animatedProgress * 360f, false, topLeft, arcSize, style = Stroke(sw, cap = StrokeCap.Round))
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "$score",
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                    Text(
                        text = assessmentLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = scoreColor,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

// ── Income vs Expense Card ───────────────────────────────────────────

@Composable
private fun IncomeExpenseCard(summary: IncomeExpenseUi) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Income: ${summary.incomeFormatted}. " +
                    "Expenses: ${summary.expenseFormatted}. " +
                    "Net: ${summary.netCashFlowFormatted}. " +
                    "Savings rate: ${summary.savingsRateFormatted}."
            },
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                IncomeExpenseColumn(label = "Income", amount = summary.incomeFormatted, color = Color(0xFF2E7D32))
                IncomeExpenseColumn(label = "Expenses", amount = summary.expenseFormatted, color = MaterialTheme.colorScheme.error)
                IncomeExpenseColumn(
                    label = "Net",
                    amount = summary.netCashFlowFormatted,
                    color = if (summary.isPositiveCashFlow) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error,
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Filled.Favorite,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = "Savings Rate: ${summary.savingsRateFormatted}",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun IncomeExpenseColumn(label: String, amount: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(amount, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = color)
    }
}

// ── Spending Donut Chart ─────────────────────────────────────────────

@Composable
private fun SpendingDonutChart(categories: List<CategorySpendingUi>) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(180.dp)
            .semantics {
                contentDescription = "Spending breakdown chart with ${categories.size} categories"
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(160.dp)) {
            val sw = 24.dp.toPx()
            val arcSize = Size(size.width - sw, size.height - sw)
            val topLeft = Offset(sw / 2, sw / 2)
            var startAngle = -90f

            categories.forEach { cat ->
                val sweep = (cat.percentage / 100.0 * 360.0).toFloat()
                val color = chartColors[cat.colorIndex % chartColors.size]
                drawArc(color, startAngle, sweep, false, topLeft, arcSize, style = Stroke(sw, cap = StrokeCap.Butt))
                startAngle += sweep
            }
        }
    }
}

// ── Category Breakdown Item ──────────────────────────────────────────

@Composable
private fun CategoryBreakdownItem(category: CategorySpendingUi) {
    val changeText = category.changePercent?.let { pct ->
        val sign = if (pct > 0) "+" else ""
        "$sign${pct.toInt()}% vs last month"
    } ?: "New this month"

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${category.name}: ${category.amountFormatted}, " +
                    "${category.percentage.toInt()}% of total. $changeText"
            },
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Color dot
            Canvas(Modifier.size(12.dp)) {
                drawCircle(chartColors[category.colorIndex % chartColors.size])
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(category.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text(changeText, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(category.amountFormatted, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                Text("${category.percentage.toInt()}%", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ── Trend Item ───────────────────────────────────────────────────────

@Composable
private fun TrendItem(trend: CategoryTrendUi) {
    val (icon, trendLabel, trendColor) = when (trend.direction) {
        TrendDirection.INCREASING -> Triple(Icons.Filled.TrendingUp, "Increasing", MaterialTheme.colorScheme.error)
        TrendDirection.DECREASING -> Triple(Icons.Filled.TrendingDown, "Decreasing", Color(0xFF2E7D32))
        TrendDirection.STABLE -> Triple(Icons.Filled.Remove, "Stable", MaterialTheme.colorScheme.onSurfaceVariant)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${trend.name}: $trendLabel. Average ${trend.averageFormatted} per month."
            },
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = trendColor, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(trend.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text(trendLabel, style = MaterialTheme.typography.labelSmall, color = trendColor)
            }
            Text(
                text = "${trend.averageFormatted}/mo",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

// ── Health Component Item ────────────────────────────────────────────

@Composable
private fun HealthComponentItem(component: HealthComponentUi) {
    val progressColor = when {
        component.score >= 70 -> Color(0xFF2E7D32)
        component.score >= 40 -> Color(0xFFFF9800)
        else -> MaterialTheme.colorScheme.error
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${component.name}: score ${component.score} out of 100. ${component.explanation}"
            },
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(component.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text("${component.score}/100", style = MaterialTheme.typography.labelMedium, color = progressColor, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { component.score / 100f },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp)),
                color = progressColor,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = component.explanation,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ── Recommendation Item ──────────────────────────────────────────────

@Composable
private fun RecommendationItem(text: String) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Recommendation: $text" },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
        ),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            Icon(
                Icons.Filled.ArrowUpward,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onTertiaryContainer,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onTertiaryContainer,
            )
        }
    }
}

// ── Previews ─────────────────────────────────────────────────────────

@Preview(showBackground = true, showSystemUi = true, name = "Insights - Light")
@Preview(
    showBackground = true,
    showSystemUi = true,
    uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES,
    name = "Insights - Dark",
)
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun InsightsScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        InsightsContent(
            state = InsightsUiState(
                isLoading = false,
                healthScore = 72,
                healthAssessment = HealthAssessment.GOOD,
                incomeExpense = IncomeExpenseUi(
                    incomeFormatted = "$5,200.00",
                    expenseFormatted = "$3,800.00",
                    netCashFlowFormatted = "+$1,400.00",
                    savingsRateFormatted = "27%",
                    isPositiveCashFlow = true,
                ),
                categoryBreakdown = listOf(
                    CategorySpendingUi("Groceries", "$680", 24.0, 1, -5.0, "$715", 0),
                    CategorySpendingUi("Dining", "$420", 15.0, 2, 12.0, "$375", 1),
                    CategorySpendingUi("Transport", "$280", 10.0, 3, null, "$0", 2),
                ),
                categoryTrends = listOf(
                    CategoryTrendUi("Groceries", TrendDirection.DECREASING, "$700", -5.0),
                    CategoryTrendUi("Dining", TrendDirection.INCREASING, "$390", 12.0),
                    CategoryTrendUi("Transport", TrendDirection.STABLE, "$275", 2.0),
                ),
                healthComponents = listOf(
                    HealthComponentUi("Savings Rate", 80, "Excellent savings rate of 27%"),
                    HealthComponentUi("Budget Adherence", 75, "3 of 4 budgets within limit"),
                    HealthComponentUi("Debt Ratio", 65, "Healthy debt level (28% ratio)"),
                ),
                recommendations = listOf(
                    "Your dining spending is trending up — consider setting a tighter budget",
                ),
            ),
        )
    }
}
