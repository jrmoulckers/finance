package com.finance.android.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Animated circular progress ring for budget/goal visualisation.
 *
 * Renders a background track arc overlaid with an animated progress arc whose
 * color shifts based on the current percentage:
 * - **Green** for < 80 %
 * - **Amber** for 80-100 %
 * - **Neutral (gray)** for > 100 % (over-budget)
 *
 * The progress value is clamped to 0-150 % (sweep max 360 degrees).
 *
 * @param progress Fractional progress where 1.0 = 100 %. Values above 1.5 are clamped.
 * @param modifier Modifier applied to the outer [Box].
 * @param size Diameter of the ring.
 * @param strokeWidth Width of the progress arc stroke.
 * @param animationDurationMs Duration of the initial fill animation.
 * @param trackColor Color of the background track.
 * @param greenColor Color used when progress < 80 %.
 * @param amberColor Color used when progress is 80-100 %.
 * @param overBudgetColor Color used when progress > 100 %.
 * @param centerContent Optional composable rendered at the center of the ring.
 */
@Composable
fun CircularProgressRing(
    progress: Float,
    modifier: Modifier = Modifier,
    size: Dp = 120.dp,
    strokeWidth: Dp = 10.dp,
    animationDurationMs: Int = 800,
    trackColor: Color = MaterialTheme.colorScheme.surfaceVariant,
    greenColor: Color = Color(0xFF4CAF50),
    amberColor: Color = Color(0xFFFFC107),
    overBudgetColor: Color = MaterialTheme.colorScheme.outlineVariant,
    centerContent: @Composable (() -> Unit)? = null,
) {
    val clampedProgress = progress.coerceIn(0f, 1.5f)
    val animatedProgress = remember { Animatable(0f) }

    LaunchedEffect(clampedProgress) {
        animatedProgress.animateTo(
            targetValue = clampedProgress,
            animationSpec = tween(durationMillis = animationDurationMs),
        )
    }

    val progressColor = when {
        clampedProgress < 0.8f -> greenColor
        clampedProgress <= 1.0f -> amberColor
        else -> overBudgetColor
    }

    val percentLabel = "${(clampedProgress * 100).toInt()}%"

    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(size)
            .semantics {
                contentDescription = "Budget progress: $percentLabel"
            },
    ) {
        Canvas(modifier = Modifier.size(size)) {
            val stroke = strokeWidth.toPx()
            val arcSize = Size(
                width = this.size.width - stroke,
                height = this.size.height - stroke,
            )
            val topLeft = Offset(stroke / 2f, stroke / 2f)

            // Background track (full circle)
            drawArc(
                color = trackColor,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )

            // Progress arc: 150% maps to 360 degrees
            val sweepAngle = animatedProgress.value * 240f
            drawArc(
                color = progressColor,
                startAngle = -90f,
                sweepAngle = sweepAngle,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }

        centerContent?.invoke()
    }
}

// -- Previews -----------------------------------------------------------------

@Preview(showBackground = true, name = "CircularProgressRing - 0%")
@Composable
private fun ProgressRing0Preview() {
    MaterialTheme {
        CircularProgressRing(
            progress = 0f,
            centerContent = {
                Text(
                    text = "0%",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { contentDescription = "Zero percent" },
                )
            },
        )
    }
}

@Preview(showBackground = true, name = "CircularProgressRing - 50%")
@Composable
private fun ProgressRing50Preview() {
    MaterialTheme {
        CircularProgressRing(
            progress = 0.5f,
            centerContent = {
                Text(
                    text = "50%",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { contentDescription = "Fifty percent" },
                )
            },
        )
    }
}

@Preview(showBackground = true, name = "CircularProgressRing - 80%")
@Composable
private fun ProgressRing80Preview() {
    MaterialTheme {
        CircularProgressRing(
            progress = 0.8f,
            centerContent = {
                Text(
                    text = "80%",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { contentDescription = "Eighty percent" },
                )
            },
        )
    }
}

@Preview(showBackground = true, name = "CircularProgressRing - 100%")
@Composable
private fun ProgressRing100Preview() {
    MaterialTheme {
        CircularProgressRing(
            progress = 1.0f,
            centerContent = {
                Text(
                    text = "100%",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { contentDescription = "One hundred percent" },
                )
            },
        )
    }
}

@Preview(showBackground = true, name = "CircularProgressRing - 130%")
@Composable
private fun ProgressRing130Preview() {
    MaterialTheme {
        CircularProgressRing(
            progress = 1.3f,
            centerContent = {
                Text(
                    text = "130%",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics {
                        contentDescription = "One hundred thirty percent, over budget"
                    },
                )
            },
        )
    }
}

@Preview(showBackground = true, name = "CircularProgressRing - all states")
@Composable
private fun ProgressRingAllStatesPreview() {
    MaterialTheme {
        Row {
            listOf(0f, 0.5f, 0.8f, 1.0f, 1.3f).forEach { pct ->
                CircularProgressRing(
                    progress = pct,
                    size = 64.dp,
                    strokeWidth = 6.dp,
                    centerContent = {
                        Text(
                            text = "${(pct * 100).toInt()}%",
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.semantics {
                                contentDescription = "${(pct * 100).toInt()} percent"
                            },
                        )
                    },
                )
                Spacer(modifier = Modifier.width(8.dp))
            }
        }
    }
}
