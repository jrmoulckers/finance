// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.streak

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Dashboard card showing the user's logging consistency streak.
 *
 * Design principles:
 * - **Non-manipulative**: no guilt language, no "don't break your streak!"
 * - **Dismissible**: users can hide the card without penalty
 * - **Informational**: the streak is a mirror, not a leash
 * - **Accessible**: full TalkBack descriptions, appropriate heading semantics
 *
 * @param viewModel The [StreakViewModel] providing streak state.
 * @param modifier Modifier applied to the card.
 */
@Composable
fun StreakCard(
    viewModel: StreakViewModel,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.uiState.collectAsState()

    StreakCardContent(
        state = state,
        onDismiss = { viewModel.dismissStreak() },
        modifier = modifier,
    )
}

/**
 * Stateless streak card content — useful for previews and testing.
 */
@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
fun StreakCardContent(
    state: StreakUiState,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = state.isVisible && !state.isLoading,
        enter = fadeIn() + slideInVertically(),
        exit = fadeOut() + slideOutVertically(),
    ) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
            ),
            modifier = modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = buildString {
                        append("Logging streak: ${state.currentStreak} days. ")
                        append(state.message)
                        if (state.longestStreak > 0) {
                            append(". Your longest streak is ${state.longestStreak} days.")
                        }
                    }
                },
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
            ) {
                // Header row with streak icon and dismiss button
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        // Streak flame icon
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.secondary.copy(alpha = 0.2f))
                                .semantics {
                                    contentDescription = "Logging streak icon"
                                },
                        ) {
                            Text(
                                text = if (state.currentStreak > 0) "🔥" else "📝",
                                style = MaterialTheme.typography.titleMedium,
                                textAlign = TextAlign.Center,
                            )
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column {
                            Text(
                                text = "Logging Streak",
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onSecondaryContainer,
                                modifier = Modifier.semantics { heading() },
                            )
                            Text(
                                text = "${state.currentStreak} ${if (state.currentStreak == 1) "day" else "days"}",
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSecondaryContainer,
                            )
                        }
                    }

                    // Dismiss button — no judgment, just a clean close
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier.semantics {
                            contentDescription = "Hide streak card"
                        },
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Hide streak card",
                            tint = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.6f),
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Positive message — NEVER guilt-tripping
                Text(
                    text = state.message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.8f),
                    modifier = Modifier.semantics {
                        contentDescription = state.message
                    },
                )

                // Show longest streak as a subtle footer when it's higher than current
                if (state.longestStreak > state.currentStreak && state.longestStreak > 0) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Longest: ${state.longestStreak} days",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.5f),
                        modifier = Modifier.semantics {
                            contentDescription = "Your longest streak is ${state.longestStreak} days"
                        },
                    )
                }
            }
        }
    }
}

// ── Previews ─────────────────────────────────────────────────────────────────

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Streak — Active (7 days)")
@Composable
private fun StreakCardActivePreview() {
    MaterialTheme {
        StreakCardContent(
            state = StreakUiState(
                currentStreak = 7,
                longestStreak = 14,
                message = "A whole week! You're building a great habit",
                isLoading = false,
            ),
            onDismiss = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Streak — No streak")
@Composable
private fun StreakCardNoStreakPreview() {
    MaterialTheme {
        StreakCardContent(
            state = StreakUiState(
                currentStreak = 0,
                longestStreak = 3,
                message = "Log a transaction to start tracking",
                isLoading = false,
            ),
            onDismiss = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Streak — New user (1 day)")
@Composable
private fun StreakCardOneDayPreview() {
    MaterialTheme {
        StreakCardContent(
            state = StreakUiState(
                currentStreak = 1,
                longestStreak = 1,
                message = "Nice — you logged today!",
                isLoading = false,
            ),
            onDismiss = {},
        )
    }
}
