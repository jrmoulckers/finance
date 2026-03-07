package com.finance.android.ui.components.charts

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
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
 * A single entry for the spending bar chart.
 *
 * @property label Category or item label (e.g., "Groceries").
 * @property value Numeric value for the bar height.
 * @property formattedValue Display string for the value (e.g., "$450").
 * @property color Bar color (use [ChartColors.CategoryPalette]).
 * @property accessibilityLabel TalkBack description (e.g., "Groceries: $450").
 */
data class BarChartEntry(
    val label: String,
    val value: Float,
    val formattedValue: String,
    val color: Color,
    val accessibilityLabel: String,
)

/**
 * A vertical bar chart for spending by category.
 *
 * Each bar is color-coded and labeled with its category name and amount.
 * Bars animate in on first composition and when values change.
 *
 * TalkBack announces each bar via the combined accessibility label.
 *
 * @param entries List of bar chart entries to display.
 * @param modifier Modifier for layout customization.
 */
@Composable
fun SpendingBarChart(
    entries: List<BarChartEntry>,
    modifier: Modifier = Modifier,
) {
    if (entries.isEmpty()) return

    val animatedProgress = remember { Animatable(0f) }

    LaunchedEffect(entries) {
        animatedProgress.snapTo(0f)
        animatedProgress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 600, easing = FastOutSlowInEasing),
        )
    }

    val maxValue = entries.maxOf { it.value }.coerceAtLeast(1f)
    val combinedLabel = entries.joinToString(". ") { it.accessibilityLabel }
    val density = LocalDensity.current
    val labelSizeSp = 11.sp
    val valueSizeSp = 10.sp
    val labelSizePx = with(density) { labelSizeSp.toPx() }
    val valueSizePx = with(density) { valueSizeSp.toPx() }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(220.dp)
            .semantics { contentDescription = "Spending chart. $combinedLabel" },
    ) {
        val barCount = entries.size
        val totalWidth = size.width
        val chartHeight = size.height - labelSizePx - valueSizePx - 24.dp.toPx()
        val barSpacing = 12.dp.toPx()
        val barWidth = ((totalWidth - barSpacing * (barCount + 1)) / barCount)
            .coerceAtLeast(16.dp.toPx())

        entries.forEachIndexed { index, entry ->
            val barHeight = (entry.value / maxValue) * chartHeight * animatedProgress.value
            val x = barSpacing + index * (barWidth + barSpacing)
            val y = chartHeight - barHeight + valueSizePx + 8.dp.toPx()

            // Bar rectangle
            drawRoundRect(
                color = entry.color,
                topLeft = Offset(x, y),
                size = Size(barWidth, barHeight),
                cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
            )

            // Value label above bar
            drawContext.canvas.nativeCanvas.drawText(
                entry.formattedValue,
                x + barWidth / 2f,
                y - 4.dp.toPx(),
                android.graphics.Paint().apply {
                    textSize = valueSizePx
                    color = android.graphics.Color.DKGRAY
                    textAlign = android.graphics.Paint.Align.CENTER
                    isAntiAlias = true
                },
            )

            // Category label below bar
            drawContext.canvas.nativeCanvas.drawText(
                entry.label.take(8),
                x + barWidth / 2f,
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
}

@Preview(showBackground = true, name = "Spending Bar Chart")
@Composable
private fun SpendingBarChartPreview() {
    FinanceTheme(dynamicColor = false) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Spending by Category",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics {
                    contentDescription = "Spending by Category chart title"
                },
            )
            SpendingBarChart(
                entries = listOf(
                    BarChartEntry("Groceries", 450f, "$450", ChartColors.CategoryPalette[0], "Groceries: $450"),
                    BarChartEntry("Dining", 280f, "$280", ChartColors.CategoryPalette[1], "Dining: $280"),
                    BarChartEntry("Transport", 150f, "$150", ChartColors.CategoryPalette[2], "Transport: $150"),
                    BarChartEntry("Entertain", 200f, "$200", ChartColors.CategoryPalette[3], "Entertainment: $200"),
                    BarChartEntry("Utilities", 180f, "$180", ChartColors.CategoryPalette[4], "Utilities: $180"),
                ),
            )
        }
    }
}
