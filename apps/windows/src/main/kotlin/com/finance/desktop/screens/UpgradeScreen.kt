// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Diamond
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.entitlement.PremiumFeature
import com.finance.desktop.entitlement.SubscriptionTier
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.EntitlementViewModel
import com.finance.desktop.viewmodel.FeatureStatusUi

/**
 * Upgrade / subscription management screen.
 *
 * Shows the user's current plan (Free or Premium), lists all features
 * with their access status, and provides upgrade prompts for gated features.
 *
 * Narrator: plan card, feature rows, and upgrade dialog all have
 * content descriptions. Lock/check icons announce feature access state.
 */
@Composable
fun UpgradeScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<EntitlementViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading subscription info"
                },
            )
        }
        return
    }

    // ── Upgrade dialog ──
    if (state.showUpgradeDialog && state.upgradeFeature != null) {
        UpgradeDialog(
            feature = state.upgradeFeature!!,
            onUpgrade = { viewModel.handleUpgrade() },
            onDismiss = { viewModel.dismissUpgradePrompt() },
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Subscription and upgrade screen" },
    ) {
        // ── Header ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.WorkspacePremium,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                Text(
                    text = "Subscription",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.semantics { heading() },
                )
            }
            IconButton(
                onClick = { viewModel.refresh() },
                modifier = Modifier.semantics {
                    contentDescription = "Refresh subscription"
                },
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null)
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Plan cards ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
        ) {
            PlanCard(
                tier = SubscriptionTier.FREE,
                isCurrentPlan = state.currentTier == SubscriptionTier.FREE,
                modifier = Modifier.weight(1f),
            )
            PlanCard(
                tier = SubscriptionTier.PREMIUM,
                isCurrentPlan = state.currentTier == SubscriptionTier.PREMIUM,
                onUpgrade = if (state.currentTier == SubscriptionTier.FREE) {
                    { viewModel.showUpgradePrompt(PremiumFeature.ADVANCED_INSIGHTS) }
                } else null,
                modifier = Modifier.weight(1f),
            )
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxxl))

        // ── Features list ──
        Text(
            text = "Feature Availability",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            items(state.featureStatuses) { status ->
                FeatureRow(
                    status = status,
                    onUpgrade = { viewModel.showUpgradePrompt(status.feature) },
                )
            }
        }
    }
}

// ── Sub-composables ──────────────────────────────────────────────────

@Composable
private fun PlanCard(
    tier: SubscriptionTier,
    isCurrentPlan: Boolean,
    onUpgrade: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val isPremium = tier == SubscriptionTier.PREMIUM
    val title = if (isPremium) "Premium" else "Free"
    val price = if (isPremium) "$4.99/mo" else "Free"
    val tagline = if (isPremium) "Everything, unlimited" else "Get started"

    ElevatedCard(
        modifier = modifier.semantics {
            contentDescription = "$title plan, $price. ${if (isCurrentPlan) "Current plan." else ""}"
        },
        colors = CardDefaults.elevatedCardColors(
            containerColor = if (isCurrentPlan && isPremium) {
                MaterialTheme.colorScheme.primaryContainer
            } else if (isCurrentPlan) {
                MaterialTheme.colorScheme.secondaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
        ),
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = if (isPremium) Icons.Filled.Diamond else Icons.Filled.Star,
                contentDescription = null,
                tint = if (isPremium) Color(0xFFFFD700) else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(36.dp),
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = price,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = tagline,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

            if (isCurrentPlan) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                ) {
                    Text(
                        text = "Current Plan",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(
                            horizontal = FinanceDesktopTheme.spacing.lg,
                            vertical = FinanceDesktopTheme.spacing.xs,
                        ),
                    )
                }
            } else if (onUpgrade != null) {
                Button(onClick = onUpgrade) {
                    Text("Upgrade")
                }
            }
        }
    }
}

@Composable
private fun FeatureRow(
    status: FeatureStatusUi,
    onUpgrade: () -> Unit,
) {
    val accessLabel = if (status.isGranted) "Available" else "Premium only"
    val limitInfo = if (status.limit != null && !status.isGranted) {
        " (${status.currentUsage}/${status.limit} used)"
    } else if (status.limit != null) {
        " (${status.currentUsage ?: 0}/${status.limit})"
    } else ""

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${status.feature.displayName}: $accessLabel$limitInfo. " +
                    status.feature.description
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(FinanceDesktopTheme.spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = if (status.isGranted) Icons.Filled.CheckCircle
                else Icons.Filled.Lock,
                contentDescription = null,
                tint = if (status.isGranted) Color(0xFF22C55E)
                else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(24.dp),
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.lg))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = status.feature.displayName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = status.feature.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (status.limit != null) {
                    Text(
                        text = "Free tier: ${status.limit} max",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    )
                }
            }
            if (!status.isGranted) {
                TextButton(onClick = onUpgrade) {
                    Text("Upgrade")
                }
            }
        }
    }
}

@Composable
private fun UpgradeDialog(
    feature: PremiumFeature,
    onUpgrade: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                imageVector = Icons.Filled.Diamond,
                contentDescription = null,
                tint = Color(0xFFFFD700),
                modifier = Modifier.size(48.dp),
            )
        },
        title = {
            Text(
                text = "Unlock ${feature.displayName}",
                textAlign = TextAlign.Center,
            )
        },
        text = {
            Column {
                Text(
                    text = feature.description,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                Text(
                    text = "Upgrade to Premium for \$4.99/month to unlock this " +
                        "feature and all other premium capabilities.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            Button(onClick = onUpgrade) {
                Text("Upgrade to Premium")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Maybe Later")
            }
        },
        modifier = Modifier.semantics {
            contentDescription = "Upgrade prompt for ${feature.displayName}. " +
                "Upgrade to Premium for four dollars and ninety-nine cents per month."
        },
    )
}

/**
 * Reusable paywall gate composable.
 *
 * Wraps any content and shows an upgrade prompt overlay if the feature
 * is not available for the user's current tier. Use this to gate
 * premium-only screens or sections within screens.
 *
 * Usage:
 * ```kotlin
 * FeatureGate(
 *     feature = PremiumFeature.ADVANCED_INSIGHTS,
 *     entitlementViewModel = koinGet(),
 * ) {
 *     InsightsScreen()
 * }
 * ```
 */
@Composable
fun FeatureGate(
    feature: PremiumFeature,
    entitlementViewModel: EntitlementViewModel,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val state by entitlementViewModel.uiState.collectAsState()
    val featureStatus = state.featureStatuses.find { it.feature == feature }

    if (featureStatus?.isGranted == false) {
        // Show gated overlay
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .padding(FinanceDesktopTheme.spacing.xxxl)
                    .semantics {
                        contentDescription = "${feature.displayName} requires Premium. " +
                            "Upgrade to unlock this feature."
                    },
            ) {
                Icon(
                    imageVector = Icons.Filled.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(64.dp),
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                Text(
                    text = "Premium Feature",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = feature.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
                Button(onClick = { entitlementViewModel.showUpgradePrompt(feature) }) {
                    Text("Upgrade to Premium")
                }
            }
        }
    } else {
        content()
    }
}
