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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.finance.android.entitlement.EntitlementDisplayState
import com.finance.android.entitlement.EntitlementDisplayStatus
import com.finance.android.ui.theme.FinanceTheme
import com.finance.core.entitlement.EntitlementTier
import org.koin.compose.viewmodel.koinViewModel

/**
 * Paywall / Upgrade screen showing subscription plans (#337, #4403).
 *
 * The current plan is display-only: it mirrors the minimized entitlement
 * projection Finance returned, including its pending, stale, offline, and
 * unavailable states. Nothing on this screen gates manual entry, import,
 * export, deletion, privacy and security controls, accessibility, or existing
 * financial data, and nothing here authorizes a paid action — Finance
 * re-reads its own projection for that.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaywallScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: PaywallViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.refreshEntitlementIfNeeded()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

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
                onRefresh = viewModel::refreshEntitlement,
                modifier = Modifier.padding(paddingValues),
            )
        }
    }
}

@Composable
internal fun PaywallContent(
    state: PaywallUiState,
    onPurchase: (EntitlementTier) -> Unit,
    onRestore: () -> Unit,
    onRefresh: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item(key = "entitlement-status") {
            EntitlementStatusCard(
                entitlement = state.entitlement,
                onRefresh = onRefresh,
            )
        }

        EntitlementStatusMessages.confirmationMessage(state.confirmation)?.let { message ->
            item(key = "confirmation-status") {
                ConfirmationStatusText(message)
            }
        }

        items(state.tiers, key = { it.tier.name }) { tier ->
            TierCard(
                pricing = tier,
                onSelect = { onPurchase(tier.tier) },
                isPurchasing = state.isPurchasing,
            )
        }

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
private fun EntitlementStatusCard(
    entitlement: EntitlementDisplayState,
    onRefresh: () -> Unit,
) {
    val headline = EntitlementStatusMessages.headline(entitlement)
    val detail = EntitlementStatusMessages.detail(entitlement)

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                liveRegion = LiveRegionMode.Polite
                contentDescription = "Your current plan: $headline. $detail"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (entitlement.isPending) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(
                        Icons.Filled.WorkspacePremium,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.size(32.dp),
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        text = "Current Plan",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
                    )
                    Text(
                        text = headline,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            Text(
                text = detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )

            if (entitlement.needsRefresh) {
                TextButton(
                    onClick = onRefresh,
                    modifier = Modifier.semantics {
                        contentDescription = "Check my plan with Finance again"
                    },
                ) {
                    Text("Check again")
                }
            }
        }
    }
}

@Composable
private fun ConfirmationStatusText(message: String) {
    Text(
        text = message,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                liveRegion = LiveRegionMode.Polite
                contentDescription = message
            },
    )
}

@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
private fun TierCard(
    pricing: TierPricing,
    onSelect: () -> Unit,
    isPurchasing: Boolean,
) {
    val isRecommended = pricing.tier == EntitlementTier.PREMIUM

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${pricing.displayName} plan. ${pricing.monthlyPrice} per " +
                    "month or ${pricing.yearlyPrice} per year. ${pricing.bankConnections}. " +
                    pricing.notes.joinToString(". ") + ". " +
                    if (pricing.isCurrentTier) "This is your current plan." else "Tap to subscribe."
            },
        colors = if (isRecommended) {
            CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
        } else {
            CardDefaults.cardColors()
        },
    ) {
        Column(Modifier.padding(16.dp)) {
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
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                    }
                    Text(
                        text = pricing.displayName,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.semantics { heading() },
                    )
                }
                if (isRecommended) {
                    Text(
                        text = "Most connections",
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

            CatalogFact(pricing.bankConnections)
            pricing.notes.forEach { note -> CatalogFact(note) }

            Spacer(Modifier.height(12.dp))

            when {
                pricing.isCurrentTier ->
                    OutlinedButton(
                        onClick = {},
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { contentDescription = "Current plan" },
                        enabled = false,
                    ) {
                        Text("Current Plan")
                    }

                pricing.tier == EntitlementTier.FREE -> Unit

                else ->
                    Button(
                        onClick = onSelect,
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics {
                                contentDescription = "Subscribe to ${pricing.displayName}"
                            },
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

@Composable
private fun CatalogFact(text: String) {
    Row(
        Modifier.padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.Check,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(16.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
        )
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
                entitlement = EntitlementDisplayState(
                    status = EntitlementDisplayStatus.CURRENT,
                    tier = EntitlementTier.FREE,
                ),
                tiers = listOf(
                    TierPricing(
                        tier = EntitlementTier.FREE,
                        displayName = "Free",
                        monthlyPrice = "$0",
                        yearlyPrice = "$0",
                        bankConnections = "No bank connections",
                        notes = listOf("Entry, import, export and history are always included"),
                        isCurrentTier = true,
                    ),
                    TierPricing(
                        tier = EntitlementTier.PREMIUM,
                        displayName = "Premium",
                        monthlyPrice = "$9.99/mo",
                        yearlyPrice = "$79.99/yr",
                        bankConnections = "2 bank connections",
                        notes = listOf("May sponsor one eligible household at a time"),
                        isCurrentTier = false,
                    ),
                ),
            ),
            onPurchase = {},
            onRestore = {},
        )
    }
}

@Preview(showBackground = true, name = "Paywall - Offline snapshot")
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun PaywallOfflinePreview() {
    FinanceTheme(dynamicColor = false) {
        PaywallContent(
            state = PaywallUiState(
                isLoading = false,
                entitlement = EntitlementDisplayState(
                    status = EntitlementDisplayStatus.OFFLINE_REFRESH_NEEDED,
                    tier = EntitlementTier.PREMIUM,
                ),
                tiers = emptyList(),
            ),
            onPurchase = {},
            onRestore = {},
        )
    }
}
