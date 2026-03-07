package com.finance.android.ui.components.charts

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.finance.android.ui.theme.FinanceTheme

/**
 * A single data point on the trend line chart.
 *
 * @property label X-axis label (e.g., "Jan", "Feb").
 * @property value Y-axis value in display units (dollars).
 * @property formattedValue Display string for the value (e.g., "$12,500").
 */
data class TrendPoint(
    val label: String,
    val value: Float,
    val formattedValue: String,
)

/**
 * A trend line, consisting of ordered data points and styling.
 *
 * @property points Data points in chronological order.
 * @property color Line color (use color-blind safe palette).
 * @property label Legend label (e.g., "Net Worth").
 */
data class TrendLine(
    val points: List<TrendPoint>,
    val color: Color,
    val label: String,
)

/**
 * A monthly trend line chart for financial data (net worth, spending, income).
 *
 * Supports multiple trend lines, touch-to-inspect interaction, and a
 * color-blind safe palette. X-axis shows months; Y-axis shows currency amounts.
 *
 * @param lines One or more trend lines to render.
 * @param modifier Modifier for layout.
 * @param onPointSelected Callback when a data point is tapped.
 */
@Composable
fun TrendLineChart(
    lines: List<TrendLine>,
    modifier: Modifier = Modifier,
    onPointSelected: ((lineIndex: Int, pointIndex: Int) -> Unit)? = null,
) {
    if (lines.isEmpty() || lines.all { it.points.isEmpty() }) return

    val animatedProgress = remember { Animatable(0f) }

    LaunchedEffect(lines) {
        animatedProgress.snapTo(0f)
        animatedProgress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 1000, easing = FastOutSlowInEasing),
        )
    }

    val allValues = lines.flatMap { line -> line.points.map { it.value } }
    val minValue = allValues.minOrNull() ?: 0f
    val maxValue = allValues.maxOrNull() ?: 1f
    val valueRange = (maxValue - minValue).coerceAtLeast(1f)
    val maxPoints = lines.maxOf { it.points.size }

    var selectedPointIndex by remember { mutableIntStateOf(-1) }

    val density = LocalDensity.current
    val labelSizeSp = 10.sp
    val labelSizePx = with(density) { labelSizeSp.toPx() }

    val combinedLabel = buildString {
        append("Trend chart. ")
        lines.forEach { line ->
            append("${line.label}: ")
            line.points.lastOrNull()?.let { append(it.formattedValue) }
            append(". ")
        }
    }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(200.dp)
            .semantics { contentDescription = combinedLabel }
            .pointerInput(lines) {
                detectTapGestures { offset ->
                    val paddingLeft = 48.dp.toPx()
                    val paddingRight = 16.dp.toPx()
                    val chartWidth = size.width - paddingLeft - paddingRight
                    if (maxPoints <= 1) return@detectTapGestures

                    val stepX = chartWidth / (maxPoints - 1)
                    val tappedIndex = ((offset.x - paddingLeft) / stepX)
                        .toInt()
                        .coerceIn(0, maxPoints - 1)

                    selectedPointIndex = tappedIndex
                    onPointSelected?.invoke(0, tappedIndex)
                }
            },
    ) {
        val paddingLeft = 48.dp.toPx()
        val paddingRight = 16.dp.toPx()
        val paddingTop = 24.dp.toPx()
        val paddingBottom = labelSizePx + 16.dp.toPx()

        val chartWidth = size.width - paddingLeft - paddingRight
        val chartHeight = size.height - paddingTop - paddingBottom

        // Y-axis grid lines and labels (4 ticks)
        val tickCount = 4
        for (i in 0..tickCount) {
            val fraction = i.toFloat() / tickCount
            val y = paddingTop + chartHeight * (1f - fraction)
            val value = minValue + valueRange * fraction

            drawLine(
                color = Color(0xFFE0E0E0),
                start = Offset(paddingLeft, y),
                end = Offset(size.width - paddingRight, y),
                strokeWidth = 1.dp.toPx(),
            )

            val labelText = when {
                value >= 1_000_000 -> "$${(value / 1_000_000).toInt()}M"
                value >= 1_000 -> "$${(value / 1_000).toInt()}K"
                else -> "$${value.toInt()}"
            }
            drawContext.canvas.nativeCanvas.drawText(
                labelText,
                paddingLeft - 6.dp.toPx(),
                y + labelSizePx / 3f,
                android.graphics.Paint().apply {
                    textSize = labelSizePx
                    color = android.graphics.Color.GRAY
                    textAlign = android.graphics.Paint.Align.RIGHT
                    isAntiAlias = true
                },
            )
        }

        // Draw each trend line
        lines.forEach { trendLine ->
            val points = trendLine.points
            if (points.size < 2) return@forEach

            val stepX = chartWidth / (points.size - 1)

            val pointPositions = points.mapIndexed { index, point ->
                val x = paddingLeft + index * stepX
                val normalizedValue = (point.value - minValue) / valueRange
                val y = paddingTop + chartHeight * (1f - normalizedValue)
                Offset(x, y)
            }

            val animatedCount = (points.size * animatedProgress.value).toInt()
                .coerceIn(1, points.size)

            // Line path
            val path = Path()
            pointPositions.take(animatedCount).forEachIndexed { index, pos ->
                if (index == 0) path.moveTo(pos.x, pos.y)
                else path.lineTo(pos.x, pos.y)
            }

            drawPath(
                path = path,
                color = trendLine.color,
                style = Stroke(
                    width = 2.5.dp.toPx(),
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round,
                ),
            )

            // Data point dots
            pointPositions.take(animatedCount).forEachIndexed { index, pos ->
                val isSelected = index == selectedPointIndex
                val dotRadius = if (isSelected) 6.dp.toPx() else 3.5.dp.toPx()

                drawCircle(color = trendLine.color, radius = dotRadius, center = pos)

                if (isSelected) {
                    drawCircle(
                        color = Color.White,
                        radius = dotRadius - 2.dp.toPx(),
                        center = pos,
                    )
                    drawCircle(color = trendLine.color, radius = 2.dp.toPx(), center = pos)
                }
            }
        }

        // X-axis labels
        val xLabels = lines.firstOrNull()?.points?.map { it.label } ?: emptyList()
        if (xLabels.isNotEmpty() && maxPoints > 1) {
            val stepX = chartWidth / (maxPoints - 1)
            val labelStep = if (xLabels.size > 6) xLabels.size / 6 else 1
            xLabels.forEachIndexed { index, label ->
                if (index % labelStep == 0 || index == xLabels.lastIndex) {
                    val x = paddingLeft + index * stepX
                    drawContext.canvas.nativeCanvas.drawText(
                        label,
                        x,
                        size.height - 2.dp.toPx(),
                        android.graphics.Paint().apply {
                            textSize = labelSizePx
                            color = android.graphics.Color.GRAY
                            textAlign = android.graphics.Paint.Align.CENTER
                            isAntiAlias = true
                        },
                    )
                }
            }
        }

        // Selected point tooltip
        if (selectedPointIndex in 0 until maxPoints) {
            val firstLine = lines.firstOrNull() ?: return@Canvas
            if (selectedPointIndex < firstLine.points.size) {
                val point = firstLine.points[selectedPointIndex]
                val stepX = chartWidth / (firstLine.points.size - 1)
                val x = paddingLeft + selectedPointIndex * stepX
                val normalizedValue = (point.value - minValue) / valueRange
                val y = paddingTop + chartHeight * (1f - normalizedValue)

                val tooltipText = "${point.label}: ${point.formattedValue}"
                val tooltipPaint = android.graphics.Paint().apply {
                    textSize = labelSizePx * 1.1f
                    color = android.graphics.Color.WHITE
                    textAlign = android.graphics.Paint.Align.CENTER
                    isAntiAlias = true
                }
                val textWidth = tooltipPaint.measureText(tooltipText)
                val tooltipPadding = 6.dp.toPx()

                drawRoundRect(
                    color = Color(0xDD333333),
                    topLeft = Offset(
                        x - textWidth / 2 - tooltipPadding,
                        y - labelSizePx * 1.1f - tooltipPadding * 3,
                    ),
                    size = Size(
                        textWidth + tooltipPadding * 2,
                        labelSizePx * 1.1f + tooltipPadding * 2,
                    ),
                    cornerRadius = CornerRadius(4.dp.toPx()),
                )

                drawContext.canvas.nativeCanvas.drawText(
                    tooltipText,
                    x,
                    y - tooltipPadding * 2,
                    tooltipPaint,
                )
            }
        }
    }
}

@Preview(showBackground = true, name = "Trend Line Chart")
@Composable
private fun TrendLineChartPreview() {
    FinanceTheme(dynamicColor = false) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Net Worth Trend",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics {
                    contentDescription = "Net Worth Trend chart title"
                },
            )
            TrendLineChart(
                lines = listOf(
                    TrendLine(
                        points = listOf(
                            TrendPoint("Jan", 10000f, "$10,000"),
                            TrendPoint("Feb", 10500f, "$10,500"),
                            TrendPoint("Mar", 11200f, "$11,200"),
                            TrendPoint("Apr", 10800f, "$10,800"),
                            TrendPoint("May", 11500f, "$11,500"),
                            TrendPoint("Jun", 12500f, "$12,500"),
                        ),
                        color = ChartColors.CategoryPalette[0],
                        label = "Net Worth",
                    ),
                ),
            )
        }
    }
}
