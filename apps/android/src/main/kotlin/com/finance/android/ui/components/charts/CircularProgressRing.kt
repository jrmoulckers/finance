package com.finance.android.ui.components.charts

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.Chart1
import com.finance.android.ui.theme.Chart2
import com.finance.android.ui.theme.Chart3
import com.finance.android.ui.theme.Chart4
import com.finance.android.ui.theme.Chart5
import com.finance.android.ui.theme.Chart6
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.theme.Green600
import com.finance.android.ui.theme.Amber600
import com.finance.android.ui.theme.Neutral400

/**
 * Color-blind safe palette for financial chart components.
 *
 * Budget health colors use green/amber/neutral for distinguishability.
 * Category palette uses the IBM CVD-safe design-token colors.
 */
object ChartColors {
    /** Budget health — green for utilization below 80%. */
    val BudgetHealthy = Green600

    /** Budget health — amber for utilization 80–100%. */
    val BudgetWarning = Amber600

    /** Budget health — neutral gray for utilization above 100%. */
    val BudgetOver = Neutral400

    /** Light gray background track for arcs and bars. */
    val BudgetTrack = Color(0xFFE0E0E0)

    /** Color-blind safe category palette (IBM CVD-safe from design tokens). */
    val CategoryPalette = listOf(Chart1, Chart2, Chart3, Chart4, Chart5, Chart6)

    /** Returns the appropriate color for a given budget utilization fraction. */
    fun forUtilization(utilization: Float): Color = when {
        utilization < 0.80f -> BudgetHealthy
        utilization <= 1.00f -> BudgetWarning
        else -> BudgetOver
    }
}

/**
 * A circular progress ring that visualizes budget utilization from 0% to 150%.
 *
 * The arc color transitions automatically based on utilization:
 * - **Green** when < 80%
 * - **Amber** when 80–100%
 * - **Neutral gray** when > 100%
 *
 * The arc animates smoothly when the utilization value changes.
 *
 * @param utilization Budget utilization as a fraction (0.75 = 75%).
 * @param centerText Primary text shown in the center (e.g., "$150").
 * @param subtitleText Secondary text below center (e.g., "of $200").
 * @param accessibilityLabel Full TalkBack description.
 * @param size Diameter of the ring.
 * @param strokeWidth Width of the arc stroke.
 * @param maxUtilization Maximum representable utilization (default 1.5 = 150%).
 */
@Composable
fun CircularProgressRing(
    utilization: Float,
    centerText: String,
    subtitleText: String,
    accessibilityLabel: String,
    modifier: Modifier = Modifier,
    size: Dp = 96.dp,
    strokeWidth: Dp = 8.dp,
    maxUtilization: Float = 1.5f,
) {
    val animatedProgress = remember { Animatable(0f) }

    LaunchedEffect(utilization) {
        animatedProgress.animateTo(
            targetValue = utilization.coerceIn(0f, maxUtilization),
            animationSpec = tween(durationMillis = 800, easing = FastOutSlowInEasing),
        )
    }

    val arcColor = ChartColors.forUtilization(utilization)
    val trackColor = ChartColors.BudgetTrack

    Box(
        modifier = modifier
            .size(size)
            .semantics { contentDescription = accessibilityLabel },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(size)) {
            val strokePx = strokeWidth.toPx()
            val arcSize = Size(
                width = this.size.width - strokePx,
                height = this.size.height - strokePx,
            )
            val topLeft = Offset(strokePx / 2f, strokePx / 2f)

            // Background track — full circle
            drawArc(
                color = trackColor,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokePx, cap = StrokeCap.Round),
            )

            // Foreground progress arc — maps utilization to sweep angle
            val sweepAngle = (animatedProgress.value / maxUtilization) * 360f
            drawArc(
                color = arcColor,
                startAngle = -90f,
                sweepAngle = sweepAngle,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokePx, cap = StrokeCap.Round),
            )
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = centerText,
                style = MaterialTheme.typography.labelLarge,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = subtitleText,
                style = MaterialTheme.typography.labelSmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Preview(showBackground = true, name = "Healthy (75%)")
@Composable
private fun CircularProgressRingHealthyPreview() {
    FinanceTheme(dynamicColor = false) {
        CircularProgressRing(
            utilization = 0.75f,
            centerText = "$150",
            subtitleText = "of $200",
            accessibilityLabel = "Groceries budget: 75% used, $150 of $200, $50 remaining",
        )
    }
}

@Preview(showBackground = true, name = "Warning (90%)")
@Composable
private fun CircularProgressRingWarningPreview() {
    FinanceTheme(dynamicColor = false) {
        CircularProgressRing(
            utilization = 0.90f,
            centerText = "$180",
            subtitleText = "of $200",
            accessibilityLabel = "Dining budget: 90% used, $180 of $200, $20 remaining",
        )
    }
}

@Preview(showBackground = true, name = "Over (120%)")
@Composable
private fun CircularProgressRingOverPreview() {
    FinanceTheme(dynamicColor = false) {
        CircularProgressRing(
            utilization = 1.20f,
            centerText = "$240",
            subtitleText = "of $200",
            accessibilityLabel = "Entertainment budget: 120% used, $40 over budget",
        )
    }
}
