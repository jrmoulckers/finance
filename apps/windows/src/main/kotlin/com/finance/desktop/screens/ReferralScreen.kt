// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.ReferralItemUi
import com.finance.desktop.viewmodel.ReferralStatus
import com.finance.desktop.viewmodel.ReferralTierUi
import com.finance.desktop.viewmodel.ReferralViewModel

// =============================================================================
// Referral Program Screen — Sprint 19 (#342)
// =============================================================================

/**
 * Referral Program screen for inviting friends and tracking rewards.
 *
 * Features:
 * - Referral code display with one-click clipboard copy
 * - Shareable link with copy button
 * - Status tracking table for all referrals
 * - Reward tier progression display
 *
 * Narrator reads referral code, status, and tier information.
 * High contrast colours adapt via [MaterialTheme.colorScheme].
 */
@Composable
fun ReferralScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<ReferralViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(
                modifier = Modifier.semantics { contentDescription = "Loading referral data" },
            )
        }
        return
    }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Referral program screen" },
        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
    ) {
        // Header
        item {
            Text(
                text = "Referral Program",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Referral Program heading"
                },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = "Invite friends and earn rewards together",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // Stats cards
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
            ) {
                ReferralStatCard(
                    icon = Icons.Filled.People,
                    label = "Total Referrals",
                    value = "${state.totalReferrals}",
                    modifier = Modifier.weight(1f),
                )
                ReferralStatCard(
                    icon = Icons.Filled.Check,
                    label = "Activated",
                    value = "${state.activatedReferrals}",
                    modifier = Modifier.weight(1f),
                )
                ReferralStatCard(
                    icon = Icons.Filled.HourglassEmpty,
                    label = "Pending",
                    value = "${state.pendingReferrals}",
                    modifier = Modifier.weight(1f),
                )
                ReferralStatCard(
                    icon = Icons.Filled.CardGiftcard,
                    label = "Rewards Earned",
                    value = state.totalRewardsEarned,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        // Referral code + link card
        item {
            ReferralCodeCard(
                referralCode = state.referralCode,
                referralLink = state.referralLink,
                codeCopied = state.codeCopied,
                linkCopied = state.linkCopied,
                onCopyCode = viewModel::onCodeCopied,
                onCopyLink = viewModel::onLinkCopied,
            )
        }

        // Reward tiers
        item {
            Text(
                text = "Reward Tiers",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Reward tiers"
                },
            )
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
            ) {
                state.tiers.forEach { tier ->
                    RewardTierCard(tier = tier, modifier = Modifier.weight(1f))
                }
            }
        }

        // Referral history
        item {
            Text(
                text = "Referral History",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Referral history"
                },
            )
        }
        items(state.referrals, key = { it.id }) { referral ->
            ReferralHistoryRow(referral)
        }
    }
}

// ─── Stat card ───────────────────────────────────────────────────────────────

@Composable
private fun ReferralStatCard(
    icon: ImageVector,
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(
        modifier = modifier.semantics { contentDescription = "$label: $value" },
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ─── Referral code card ──────────────────────────────────────────────────────

@Composable
private fun ReferralCodeCard(
    referralCode: String,
    referralLink: String,
    codeCopied: Boolean,
    linkCopied: Boolean,
    onCopyCode: () -> Unit,
    onCopyLink: () -> Unit,
) {
    val clipboardManager = LocalClipboardManager.current

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Your referral code: $referralCode" },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
        ),
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl)) {
            Text(
                text = "Your Referral Code",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            // Code row
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.surface,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.Share,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                        Text(
                            text = referralCode,
                            style = MaterialTheme.typography.headlineLarge,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = MaterialTheme.typography.headlineLarge.fontSize * 0.05f,
                        )
                    }
                    FilledTonalButton(
                        onClick = {
                            clipboardManager.setText(AnnotatedString(referralCode))
                            onCopyCode()
                        },
                        modifier = Modifier.semantics {
                            contentDescription = if (codeCopied) "Code copied" else "Copy referral code"
                            role = Role.Button
                        },
                    ) {
                        Icon(
                            if (codeCopied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                        Text(if (codeCopied) "Copied!" else "Copy")
                    }
                }
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            // Link row
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.surface,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(
                            Icons.Filled.Link,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                        Text(
                            text = referralLink,
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    IconButton(
                        onClick = {
                            clipboardManager.setText(AnnotatedString(referralLink))
                            onCopyLink()
                        },
                        modifier = Modifier.semantics {
                            contentDescription = if (linkCopied) "Link copied" else "Copy referral link"
                            role = Role.Button
                        },
                    ) {
                        Icon(
                            if (linkCopied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                            contentDescription = null,
                        )
                    }
                }
            }
        }
    }
}

// ─── Reward tier card ────────────────────────────────────────────────────────

@Composable
private fun RewardTierCard(
    tier: ReferralTierUi,
    modifier: Modifier = Modifier,
) {
    val containerColor = if (tier.isUnlocked) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.surfaceVariant
    }
    val contentColor = if (tier.isUnlocked) {
        MaterialTheme.colorScheme.onPrimaryContainer
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        modifier = modifier.semantics {
            contentDescription = buildString {
                append("${tier.name} tier: ${tier.referralsNeeded} referrals needed, reward ${tier.reward}")
                if (tier.isUnlocked) append(", unlocked")
                else append(", locked")
            }
        },
        colors = CardDefaults.cardColors(containerColor = containerColor),
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = if (tier.isUnlocked) Icons.Filled.LockOpen else Icons.Filled.Lock,
                contentDescription = null,
                tint = if (tier.isUnlocked) MaterialTheme.colorScheme.primary else contentColor,
                modifier = Modifier.size(24.dp),
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Icon(
                imageVector = Icons.Filled.EmojiEvents,
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = tier.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = contentColor,
            )
            Text(
                text = "${tier.referralsNeeded} referrals",
                style = MaterialTheme.typography.labelSmall,
                color = contentColor.copy(alpha = 0.7f),
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = tier.reward,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = contentColor,
            )
        }
    }
}

// ─── Referral history row ────────────────────────────────────────────────────

@Composable
private fun ReferralHistoryRow(referral: ReferralItemUi) {
    val statusColor = when (referral.status) {
        ReferralStatus.ACTIVATED -> Color(0xFF2E7D32)
        ReferralStatus.SIGNED_UP -> MaterialTheme.colorScheme.primary
        ReferralStatus.PENDING -> MaterialTheme.colorScheme.tertiary
        ReferralStatus.EXPIRED -> MaterialTheme.colorScheme.outline
    }
    val statusIcon = when (referral.status) {
        ReferralStatus.ACTIVATED -> Icons.Filled.Check
        ReferralStatus.SIGNED_UP -> Icons.Filled.People
        ReferralStatus.PENDING -> Icons.Filled.Schedule
        ReferralStatus.EXPIRED -> Icons.Filled.HourglassEmpty
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = buildString {
                    append("Referral to ${referral.recipientEmail}, ")
                    append("status: ${referral.status.name.lowercase()}, ")
                    append("sent ${referral.sentDate}")
                    referral.rewardEarned?.let { append(", earned $it") }
                }
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(FinanceDesktopTheme.spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Status indicator
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(statusColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = statusIcon,
                    contentDescription = null,
                    tint = statusColor,
                    modifier = Modifier.size(18.dp),
                )
            }
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.lg))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = referral.recipientEmail,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "Sent ${referral.sentDate}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // Status badge
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = statusColor.copy(alpha = 0.15f),
            ) {
                Text(
                    text = referral.status.name.lowercase().replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = statusColor,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
            // Reward earned
            if (referral.rewardEarned != null) {
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                Text(
                    text = referral.rewardEarned,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF2E7D32),
                )
            }
        }
    }
}
