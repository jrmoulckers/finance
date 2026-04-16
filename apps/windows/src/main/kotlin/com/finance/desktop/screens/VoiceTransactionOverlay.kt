// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.VoiceEntryPhase
import com.finance.desktop.viewmodel.VoiceTransactionViewModel

/**
 * Full-screen overlay for voice-driven transaction entry.
 *
 * Shows a modal overlay with:
 * - Pulsing microphone icon during listening
 * - Transcribed text display
 * - Parsed transaction confirmation with amount, category, date
 * - Confirm/Cancel/Retry actions
 * - Success and error states
 *
 * Accessibility: All states are announced via `liveRegion` semantics for
 * Narrator, with appropriate role and content description annotations.
 *
 * Activated via Ctrl+Shift+V keyboard shortcut.
 */
@Composable
fun VoiceTransactionOverlay(modifier: Modifier = Modifier) {
    val viewModel = koinGet<VoiceTransactionViewModel>()
    val state by viewModel.uiState.collectAsState()

    AnimatedVisibility(
        visible = state.isOverlayVisible,
        enter = fadeIn(tween(200)),
        exit = fadeOut(tween(200)),
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.6f))
                .semantics { contentDescription = "Voice transaction entry overlay" },
            contentAlignment = Alignment.Center,
        ) {
            Card(
                modifier = Modifier
                    .width(480.dp)
                    .padding(FinanceDesktopTheme.spacing.xxl),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
            ) {
                Column(
                    modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Voice Transaction",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.semantics {
                                heading()
                                contentDescription = "Voice transaction entry"
                            },
                        )
                        IconButton(
                            onClick = { viewModel.cancel() },
                            modifier = Modifier.semantics {
                                contentDescription = "Close voice entry"
                            },
                        ) {
                            Icon(Icons.Filled.Close, contentDescription = null)
                        }
                    }

                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

                    // Phase-specific content
                    when (state.phase) {
                        VoiceEntryPhase.IDLE -> IdleContent()
                        VoiceEntryPhase.LISTENING -> ListeningContent()
                        VoiceEntryPhase.PROCESSING -> ProcessingContent()
                        VoiceEntryPhase.CONFIRMING -> ConfirmingContent(
                            transcribedText = state.transcribedText,
                            amountFormatted = state.parsedTransaction?.amount?.let {
                                "$${it.amount / 100}.${"%02d".format(it.amount % 100)}"
                            } ?: "—",
                            category = state.parsedTransaction?.category ?: "Uncategorized",
                            description = state.parsedTransaction?.description ?: "—",
                            date = state.parsedTransaction?.date?.toString() ?: "Today",
                            isExpense = state.parsedTransaction?.isExpense ?: true,
                            confidence = state.parsedTransaction?.confidence ?: 0f,
                            onConfirm = { viewModel.confirmTransaction() },
                            onRetry = { viewModel.startListening() },
                            onCancel = { viewModel.cancel() },
                        )
                        VoiceEntryPhase.SUCCESS -> SuccessContent(
                            onDismiss = { viewModel.dismiss() },
                            onAnother = { viewModel.startListening() },
                        )
                        VoiceEntryPhase.ERROR -> ErrorContent(
                            message = state.errorMessage ?: "Unknown error",
                            onRetry = { viewModel.startListening() },
                            onCancel = { viewModel.cancel() },
                        )
                    }
                }
            }
        }
    }
}

// =============================================================================
// Phase composables
// =============================================================================

@Composable
private fun IdleContent() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.semantics {
            contentDescription = "Ready for voice input"
            liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite
        },
    ) {
        Icon(
            imageVector = Icons.Filled.Mic,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        Text(
            text = "Ready to listen",
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = "Say something like \"spent 42 on groceries\"",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ListeningContent() {
    val infiniteTransition = rememberInfiniteTransition(label = "listening-pulse")
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.9f,
        targetValue = 1.1f,
        animationSpec = infiniteRepeatable(
            animation = tween(600),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "mic-pulse",
    )
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.6f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(600),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "mic-alpha",
    )

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.semantics {
            contentDescription = "Listening for voice input"
            liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Assertive
        },
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .scale(scale)
                .alpha(alpha)
                .background(
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                    CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Mic,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
        }
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        Text(
            text = "Listening…",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            text = "Speak your transaction",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ProcessingContent() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.semantics {
            contentDescription = "Processing voice input"
            liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite
        },
    ) {
        CircularProgressIndicator(modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        Text(
            text = "Processing…",
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}

@Composable
private fun ConfirmingContent(
    transcribedText: String,
    amountFormatted: String,
    category: String,
    description: String,
    date: String,
    isExpense: Boolean,
    confidence: Float,
    onConfirm: () -> Unit,
    onRetry: () -> Unit,
    onCancel: () -> Unit,
) {
    val transactionType = if (isExpense) "Expense" else "Income"
    val confidencePercent = (confidence * 100).toInt()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Confirm transaction: $transactionType of $amountFormatted " +
                    "for $description in $category on $date"
                liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite
            },
    ) {
        // Transcribed text
        Text(
            text = "\"$transcribedText\"",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "You said: $transcribedText" },
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        HorizontalDivider()
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        // Parsed details
        TransactionDetailRow("Type", transactionType)
        TransactionDetailRow("Amount", amountFormatted)
        TransactionDetailRow("Category", category)
        TransactionDetailRow("Description", description)
        TransactionDetailRow("Date", date)
        TransactionDetailRow("Confidence", "$confidencePercent%")

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // Action buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            OutlinedButton(
                onClick = onCancel,
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Cancel voice transaction" },
            ) {
                Text("Cancel")
            }
            OutlinedButton(
                onClick = onRetry,
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Retry voice input" },
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("Retry")
            }
            Button(
                onClick = onConfirm,
                modifier = Modifier
                    .weight(1f)
                    .semantics {
                        contentDescription = "Confirm and save transaction"
                        role = Role.Button
                    },
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                ),
            ) {
                Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("Save")
            }
        }
    }
}

@Composable
private fun TransactionDetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .semantics { contentDescription = "$label: $value" },
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun SuccessContent(
    onDismiss: () -> Unit,
    onAnother: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.semantics {
            contentDescription = "Transaction saved successfully"
            liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Assertive
        },
    ) {
        Icon(
            imageVector = Icons.Filled.Check,
            contentDescription = null,
            modifier = Modifier
                .size(64.dp)
                .background(
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                    CircleShape,
                )
                .padding(12.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        Text(
            text = "Transaction Saved!",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
        Row(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            OutlinedButton(
                onClick = onDismiss,
                modifier = Modifier.semantics { contentDescription = "Close overlay" },
            ) {
                Text("Done")
            }
            Button(
                onClick = onAnother,
                modifier = Modifier.semantics { contentDescription = "Add another transaction by voice" },
            ) {
                Icon(Icons.Filled.Mic, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("Add Another")
            }
        }
    }
}

@Composable
private fun ErrorContent(
    message: String,
    onRetry: () -> Unit,
    onCancel: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.semantics {
            contentDescription = "Voice input error: $message"
            liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Assertive
        },
    ) {
        Icon(
            imageVector = Icons.Filled.Error,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.error,
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.error,
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
        Row(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            OutlinedButton(
                onClick = onCancel,
                modifier = Modifier.semantics { contentDescription = "Cancel voice input" },
            ) {
                Text("Cancel")
            }
            Button(
                onClick = onRetry,
                modifier = Modifier.semantics { contentDescription = "Try voice input again" },
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("Try Again")
            }
        }
    }
}
