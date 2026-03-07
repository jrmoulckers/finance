package com.finance.android.ui.components.charts

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.finance.android.ui.theme.FinanceTheme

/**
 * An entry for the month-over-month budget comparison chart.
 *
 * @property categoryName Category being compared (e.g., "Groceries").
 * @property thisMonth Spending amount this month (dollars).
 * @property lastMonth Spending amount last month (dollars).
 * @property thisMonthFormatted Display string for this month (e.g., "$450").
 * @property lastMonthFormatted Display string for last month (e.g., "$380").
 */
data class ComparisonEntry(
    val categoryName: String,
    val thisMonth: Float,
    val lastMonth: Float,
    val thisMonthFormatted: String,
    val lastMonthFormatted: String,
)

/** Color for the "this month" bar in comparison charts. */
private val ThisMonthColor = Color(0xFF648FFF)

/** Color for the "last month" bar in comparison charts. */
private val LastMonthColor = Color(0xFFB0BEC5)

/**
 * Side-by-side grouped bar chart comparing this month vs last month per category.
 *
 * Each category shows two bars for easy month-over-month comparison.
 *
 * @param entries Comparison data per category.
 * @param modifier Modifier for layout.
 */
@Composable
fun BudgetComparisonChart(
    entries: List<ComparisonEntry>,
    modifier: Modifier = Modifier,
) {
    if (entries.isEmpty()) return

    val animatedProgress = remember { Animatable(0f) }

    LaunchedEffect(entries) {
        animatedProgress.snapTo(0f)
        animatedProgress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 700, easing = FastOutSlowInEasing),
        )
    }

    val maxValue = entries.maxOf { maxOf(it.thisMonth, it.lastMonth) }.coerceAtLeast(1f)

    val combinedLabel = buildString {
        append("Month comparison chart. ")
        entries.forEach { entry ->
            append("${entry.categoryName}: this month ${entry.thisMonthFormatted}, ")
            append("last month ${entry.lastMonthFormatted}. ")
        }
    }

    val density = LocalDensity.current
    val labelSizeSp = 10.sp
    val valueSizeSp = 9.sp
    val labelSizePx = with(density) { labelSizeSp.toPx() }
    val valueSizePx = with(density) { valueSizeSp.toPx() }

    Column(modifier = modifier) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(200.dp)
                .semantics { contentDescription = combinedLabel },
        ) {
            val groupCount = entries.size
            val groupSpacing = 20.dp.toPx()
            val barSpacing = 4.dp.toPx()
            val paddingBottom = labelSizePx + 12.dp.toPx()
            val paddingTop = valueSizePx + 8.dp.toPx()
            val chartHeight = size.height - paddingBottom - paddingTop
            val totalGroupWidth = (size.width - groupSpacing * (groupCount + 1)) / groupCount
            val barWidth = ((totalGroupWidth - barSpacing) / 2f).coerceAtLeast(12.dp.toPx())

            entries.forEachIndexed { index, entry ->
                val groupX = groupSpacing + index * (totalGroupWidth + groupSpacing)

                // This month bar
                val thisBarHeight = (entry.thisMonth / maxValue) * chartHeight * animatedProgress.value
                val thisBarY = paddingTop + chartHeight - thisBarHeight
                drawRoundRect(
                    color = ThisMonthColor,
                    topLeft = Offset(groupX, thisBarY),
                    size = Size(barWidth, thisBarHeight),
                    cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx()),
                )

                drawContext.canvas.nativeCanvas.drawText(
                    entry.thisMonthFormatted,
                    groupX + barWidth / 2f,
                    thisBarY - 3.dp.toPx(),
                    android.graphics.Paint().apply {
                        textSize = valueSizePx
                        color = android.graphics.Color.DKGRAY
                        textAlign = android.graphics.Paint.Align.CENTER
                        isAntiAlias = true
                    },
                )

                // Last month bar
                val lastBarX = groupX + barWidth + barSpacing
                val lastBarHeight = (entry.lastMonth / maxValue) * chartHeight * animatedProgress.value
                val lastBarY = paddingTop + chartHeight - lastBarHeight
                drawRoundRect(
                    color = LastMonthColor,
                    topLeft = Offset(lastBarX, lastBarY),
                    size = Size(barWidth, lastBarHeight),
                    cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx()),
                )

                drawContext.canvas.nativeCanvas.drawText(
                    entry.lastMonthFormatted,
                    lastBarX + barWidth / 2f,
                    lastBarY - 3.dp.toPx(),
                    android.graphics.Paint().apply {
                        textSize = valueSizePx
                        color = android.graphics.Color.DKGRAY
                        textAlign = android.graphics.Paint.Align.CENTER
                        isAntiAlias = true
                    },
                )

                // Category label
                val groupCenterX = groupX + (barWidth * 2 + barSpacing) / 2f
                drawContext.canvas.nativeCanvas.drawText(
                    entry.categoryName.take(8),
                    groupCenterX,
                    size.height - 2.dp.toPx(),
                    android.graphics.Paint().apply {
                        textSize = labelSizePx
                        color = android.graphics.Color.DKGRAY
                        textAlign = android.graphics.Paint.Align.CENTER
                        isAntiAlias = true
                    },
                )
            }
        }

        // Legend
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spacer(modifier = Modifier.weight(1f))
            Canvas(
                modifier = Modifier
                    .size(12.dp)
                    .semantics { contentDescription = "This month legend indicator" },
            ) {
                drawRoundRect(color = ThisMonthColor, cornerRadius = CornerRadius(2.dp.toPx()))
            }
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = "This Month",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.semantics {
                    contentDescription = "This month legend label"
                },
            )
            Spacer(modifier = Modifier.width(16.dp))
            Canvas(
                modifier = Modifier
                    .size(12.dp)
                    .semantics { contentDescription = "Last month legend indicator" },
            ) {
                drawRoundRect(color = LastMonthColor, cornerRadius = CornerRadius(2.dp.toPx()))
            }
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = "Last Month",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.semantics {
                    contentDescription = "Last month legend label"
                },
            )
            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

@Preview(showBackground = true, name = "Budget Comparison Chart")
@Composable
private fun BudgetComparisonChartPreview() {
    FinanceTheme(dynamicColor = false) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Month-over-Month",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics {
                    contentDescription = "Month-over-Month comparison chart title"
                },
            )
            BudgetComparisonChart(
                entries = listOf(
                    ComparisonEntry("Groceries", 450f, 380f, "$450", "$380"),
                    ComparisonEntry("Dining", 280f, 320f, "$280", "$320"),
                    ComparisonEntry("Transport", 150f, 170f, "$150", "$170"),
                    ComparisonEntry("Utilities", 180f, 175f, "$180", "$175"),
                ),
            )
        }
    }
}
