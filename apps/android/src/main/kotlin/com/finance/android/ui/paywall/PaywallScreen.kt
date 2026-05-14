// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.paywall

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.core.entitlement.Feature
import com.finance.core.entitlement.Tier
import com.finance.core.entitlement.UpgradePrompt
import org.koin.compose.viewmodel.koinViewModel

/**
 * Paywall / Upgrade screen showing subscription tiers (#337).
 *
 * Material 3 design with tier comparison cards, feature lists,
 * and CTA buttons for Google Play purchases.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaywallScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: PaywallViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Upgrade",
                        modifier = Modifier.semantics { contentDescription = "Upgrade screen" },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics { contentDescription = "Navigate back" },
                    ) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        modifier = modifier,
    ) { paddingValues ->
        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .semantics { contentDescription = "Loading subscription options" },
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.semantics { contentDescription = "Loading indicator" },
                )
            }
        } else {
            PaywallContent(
                state = state,
                onPurchase = viewModel::purchase,
                onRestore = viewModel::restorePurchases,
                modifier = Modifier.padding(paddingValues),
            )
        }
    }
}

@Composable
internal fun PaywallContent(
    state: PaywallUiState,
    onPurchase: (Tier) -> Unit,
    onRestore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Current tier badge
        item(key = "current-tier") {
            CurrentTierCard(tierName = state.currentTierName)
        }

        // Tier cards
        items(state.tiers, key = { it.tier.name }) { tier ->
            TierCard(
                pricing = tier,
                onSelect = { onPurchase(tier.tier) },
                isPurchasing = state.isPurchasing,
            )
        }

        // Restore purchases
        item(key = "restore") {
            TextButton(
                onClick = onRestore,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Restore previous purchases" },
            ) {
                Text("Restore Purchases")
            }
        }

        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
private fun CurrentTierCard(tierName: String) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Your current plan: $tierName"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Row(
            Modifier.padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.WorkspacePremium,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column {
                Text(
                    text = "Current Plan",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
                )
                Text(
                    text = tierName,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
        }
    }
}

@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
private fun TierCard(
    pricing: TierPricing,
    onSelect: () -> Unit,
    isPurchasing: Boolean,
) {
    val isRecommended = pricing.tier == Tier.PLUS

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${pricing.displayName} plan. ${pricing.monthlyPrice} per month " +
                    "or ${pricing.yearlyPrice} per year. " +
                    pricing.features.joinToString(". ") + ". " +
                    if (pricing.isCurrentTier) "This is your current plan." else "Tap to subscribe."
            },
        colors = if (isRecommended) {
            CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
        } else {
            CardDefaults.cardColors()
        },
    ) {
        Column(Modifier.padding(16.dp)) {
            // Header row
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (isRecommended) {
                        Icon(
                            Icons.Filled.Star,
                            contentDescription = null,
                            tint = Color(0xFFFFD700),
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                    }
                    Text(
                        text = pricing.displayName,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                }
                if (isRecommended) {
                    Text(
                        text = "Recommended",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f))
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            // Pricing
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = pricing.monthlyPrice,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = pricing.yearlyPrice,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(12.dp))

            // Features
            pricing.features.forEach { feature ->
                Row(
                    Modifier.padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Filled.Check,
                        contentDescription = null,
                        tint = Color(0xFF4CAF50),
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = feature,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            // CTA button
            if (pricing.isCurrentTier) {
                OutlinedButton(
                    onClick = {},
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Current plan" },
                    enabled = false,
                ) {
                    Text("Current Plan")
                }
            } else if (pricing.tier == Tier.FREE) {
                // No action for free tier
            } else {
                Button(
                    onClick = onSelect,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Subscribe to ${pricing.displayName}" },
                    enabled = !isPurchasing,
                ) {
                    if (isPurchasing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    Text("Subscribe to ${pricing.displayName}")
                }
            }
        }
    }
}

/**
 * Composable upgrade prompt bottom sheet.
 *
 * Shows when a user tries to access a gated feature.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpgradePromptSheet(
    prompt: UpgradePrompt,
    onUpgrade: (Tier) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                Icons.Filled.WorkspacePremium,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(48.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = prompt.headline,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = prompt.headline
                },
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = prompt.body,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics {
                    contentDescription = prompt.body
                },
            )
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = { onUpgrade(prompt.targetTier) },
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = prompt.ctaText },
            ) {
                Text(prompt.ctaText)
            }
            Spacer(Modifier.height(8.dp))
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.semantics { contentDescription = "Maybe later" },
            ) {
                Text("Maybe Later")
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

// ── Previews ─────────────────────────────────────────────────────────

@Preview(showBackground = true, showSystemUi = true, name = "Paywall - Light")
@Preview(
    showBackground = true,
    showSystemUi = true,
    uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES,
    name = "Paywall - Dark",
)
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun PaywallScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        PaywallContent(
            state = PaywallUiState(
                isLoading = false,
                currentTier = Tier.FREE,
                currentTierName = "Free",
                tiers = listOf(
                    TierPricing(Tier.FREE, "Free", "$0", "$0",
                        listOf("3 accounts", "3 budgets", "2 goals"), isCurrentTier = true),
                    TierPricing(Tier.PLUS, "Plus", "$4.99/mo", "$39.99/yr",
                        listOf("10 accounts", "Spending insights", "CSV export"), isCurrentTier = false),
                    TierPricing(Tier.PREMIUM, "Premium", "$9.99/mo", "$79.99/yr",
                        listOf("Unlimited everything", "Health score", "Custom reports"), isCurrentTier = false),
                ),
            ),
            onPurchase = {},
            onRestore = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Upgrade Prompt")
@Composable
private fun UpgradePromptPreview() {
    FinanceTheme(dynamicColor = false) {
        // Note: ModalBottomSheet can't be previewed standalone,
        // so we preview the content layout
        Column(
            Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                Icons.Filled.WorkspacePremium,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(48.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                "Unlock spending insights",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Understand your spending patterns with detailed analytics.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
    }
}
