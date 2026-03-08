// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.components.states

import androidx.compose.animation.core.InfiniteTransition
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Creates a shimmer brush effect using [InfiniteTransition].
 *
 * The shimmer translates a linear gradient across the surface to
 * indicate that content is loading.
 */
@Composable
private fun shimmerBrush(transition: InfiniteTransition): Brush {
    val shimmerColors = listOf(
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.9f),
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.9f),
    )

    val translateAnim by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
        ),
        label = "shimmer_translate",
    )

    return Brush.linearGradient(
        colors = shimmerColors,
        start = Offset(translateAnim - 200f, translateAnim - 200f),
        end = Offset(translateAnim, translateAnim),
    )
}

/**
 * A single shimmer skeleton element.
 *
 * @param width Width of the skeleton box.
 * @param height Height of the skeleton box.
 * @param shape Shape to clip the skeleton (e.g. [RoundedCornerShape], [CircleShape]).
 * @param modifier Additional [Modifier] applied to the box.
 */
@Composable
fun SkeletonBox(
    width: Dp,
    height: Dp,
    shape: Shape = RoundedCornerShape(8.dp),
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition(label = "skeleton_shimmer")
    val brush = shimmerBrush(transition)

    Box(
        modifier = modifier
            .size(width = width, height = height)
            .background(brush = brush, shape = shape)
            // Not individually focusable — parent announces "Loading content"
            .clearAndSetSemantics { },
    )
}

// ---------------------------------------------------------------------------
// Skeleton row building block
// ---------------------------------------------------------------------------

/**
 * A single shimmer row that mimics a transaction list item:
 * circle icon + two text lines on the left, amount on the right.
 */
@Composable
private fun TransactionRowSkeleton(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "tx_row_shimmer")
    val brush = shimmerBrush(transition)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Category icon placeholder
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(brush = brush, shape = CircleShape),
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            // Title
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.6f)
                    .height(14.dp)
                    .background(brush = brush, shape = RoundedCornerShape(4.dp)),
            )
            Spacer(modifier = Modifier.height(6.dp))
            // Subtitle / date
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.35f)
                    .height(12.dp)
                    .background(brush = brush, shape = RoundedCornerShape(4.dp)),
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        // Amount
        Box(
            modifier = Modifier
                .width(56.dp)
                .height(14.dp)
                .background(brush = brush, shape = RoundedCornerShape(4.dp)),
        )
    }
}

// ---------------------------------------------------------------------------
// Pre-built skeleton variants
// ---------------------------------------------------------------------------

/**
 * Skeleton loader for the transaction list screen.
 * Renders 5 shimmer rows mimicking the real transaction list.
 *
 * The entire composable is announced as **"Loading content"** by TalkBack
 * and individual skeleton elements are not focusable.
 */
@Composable
fun TransactionListSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.semantics(mergeDescendants = true) {
            contentDescription = "Loading content"
        },
    ) {
        repeat(5) {
            TransactionRowSkeleton()
        }
    }
}

/**
 * Skeleton loader for the dashboard screen.
 * Includes a large net-worth card placeholder and budget ring placeholders.
 */
@Composable
fun DashboardSkeleton(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "dashboard_shimmer")
    val brush = shimmerBrush(transition)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = "Loading content"
            },
    ) {
        // Net worth card
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(160.dp)
                .background(brush = brush, shape = RoundedCornerShape(16.dp)),
        )
        Spacer(modifier = Modifier.height(24.dp))

        // Budget rings row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            repeat(3) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .background(brush = brush, shape = CircleShape),
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .width(48.dp)
                            .height(12.dp)
                            .background(brush = brush, shape = RoundedCornerShape(4.dp)),
                    )
                }
            }
        }
    }
}

/**
 * Skeleton loader for the budget list screen.
 * Renders 4 budget-card placeholders with progress bars.
 */
@Composable
fun BudgetListSkeleton(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "budget_shimmer")
    val brush = shimmerBrush(transition)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = "Loading content"
            },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        repeat(4) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                tonalElevation = 1.dp,
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // Category name
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.45f)
                            .height(16.dp)
                            .background(brush = brush, shape = RoundedCornerShape(4.dp)),
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    // Progress bar
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .background(brush = brush, shape = RoundedCornerShape(4.dp)),
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    // Spent / limit text
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.3f)
                            .height(12.dp)
                            .background(brush = brush, shape = RoundedCornerShape(4.dp)),
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

@Preview(showBackground = true, name = "SkeletonBox")
@Composable
private fun SkeletonBoxPreview() {
    MaterialTheme {
        SkeletonBox(width = 120.dp, height = 24.dp)
    }
}

@Preview(showBackground = true, name = "TransactionListSkeleton")
@Composable
private fun TransactionListSkeletonPreview() {
    MaterialTheme {
        TransactionListSkeleton()
    }
}

@Preview(showBackground = true, name = "DashboardSkeleton")
@Composable
private fun DashboardSkeletonPreview() {
    MaterialTheme {
        DashboardSkeleton()
    }
}

@Preview(showBackground = true, name = "BudgetListSkeleton")
@Composable
private fun BudgetListSkeletonPreview() {
    MaterialTheme {
        BudgetListSkeleton()
    }
}
