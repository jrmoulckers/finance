// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Diamond
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.core.entitlement.EntitlementTier
import com.finance.desktop.billing.BillingCatalogChoice
import com.finance.desktop.billing.DirectStripeBillingViewModel
import com.finance.desktop.billing.ProductBillingState
import com.finance.desktop.billing.openTrustedStripeUrl
import com.finance.desktop.data.repository.AuthRepository
import com.finance.desktop.di.koinGet
import com.finance.desktop.entitlement.EntitlementDisplayStatus
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.EntitlementUiState
import com.finance.desktop.viewmodel.EntitlementViewModel

/**
 * Subscription management backed by Finance's minimized entitlement.
 *
 * The screen displays server-proven status and protected cached status, but it
 * does not gate local capabilities or authorize server actions. Checkout and
 * portal links remain direct Stripe flows.
 */
@Composable
fun UpgradeScreen(modifier: Modifier = Modifier) {
    val entitlementViewModel = koinGet<EntitlementViewModel>()
    val billingViewModel = koinGet<DirectStripeBillingViewModel>()
    val authRepository = koinGet<AuthRepository>()
    val entitlementState by entitlementViewModel.uiState.collectAsState()
    val billingState by billingViewModel.state.collectAsState()
    val account by authRepository.currentAccount.collectAsState()
    val selectedHouseholdId = entitlementState.selectedHouseholdId
    val displayedCurrentTier = entitlementState.currentTier.takeUnless {
        entitlementState.status == EntitlementDisplayStatus.PENDING
    }

    LaunchedEffect(account?.userId, selectedHouseholdId) {
        billingViewModel.refresh(selectedHouseholdId)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Subscription and billing screen" },
    ) {
        Header(
            billingPending = billingState is ProductBillingState.Pending,
            onManageBilling = { billingViewModel.openPortal(::openTrustedStripeUrl) },
            onRefresh = {
                billingViewModel.refresh(selectedHouseholdId)
                entitlementViewModel.refresh()
            },
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        HouseholdScopeSelector(
            scopes = entitlementState.householdScopes,
            selectedHouseholdId = selectedHouseholdId,
            onSelect = entitlementViewModel::selectHousehold,
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        EntitlementStatusCard(entitlementState)
        BillingStatus(billingState)
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        Text(
            text = "Plans",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        PlanRow(
            left = PlanOption(EntitlementTier.FREE, "Free", "Included"),
            right = PlanOption(
                EntitlementTier.PLUS,
                "Plus",
                "Monthly or yearly",
                BillingCatalogChoice.PLUS_MONTHLY,
            ),
            currentTier = displayedCurrentTier,
            selectedHouseholdId = selectedHouseholdId,
            onChoose = { choice ->
                billingViewModel.startCheckout(
                    choice,
                    checkoutHouseholdIntent(choice, selectedHouseholdId),
                    ::openTrustedStripeUrl,
                )
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        PlanRow(
            left = PlanOption(
                EntitlementTier.PREMIUM,
                "Premium",
                "Monthly or yearly",
                BillingCatalogChoice.PREMIUM_MONTHLY,
            ),
            right = PlanOption(
                EntitlementTier.FAMILY,
                "Family",
                "Monthly or yearly",
                BillingCatalogChoice.FAMILY_MONTHLY,
            ),
            currentTier = displayedCurrentTier,
            selectedHouseholdId = selectedHouseholdId,
            onChoose = { choice ->
                billingViewModel.startCheckout(
                    choice,
                    checkoutHouseholdIntent(choice, selectedHouseholdId),
                    ::openTrustedStripeUrl,
                )
            },
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxxl))
        AlwaysAvailableCard()
    }
}

@Composable
private fun Header(
    billingPending: Boolean,
    onManageBilling: () -> Unit,
    onRefresh: () -> Unit,
) {
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
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onManageBilling, enabled = !billingPending) {
                Text("Manage billing")
            }
            IconButton(
                onClick = onRefresh,
                enabled = !billingPending,
                modifier = Modifier.semantics {
                    contentDescription = "Refresh subscription status"
                },
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null)
            }
        }
    }
}

@Composable
private fun EntitlementStatusCard(state: EntitlementUiState) {
    val tierName = state.currentTier.displayName()
    val title = if (state.status == EntitlementDisplayStatus.PENDING) {
        "Checking plan"
    } else {
        "$tierName plan"
    }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                liveRegion = LiveRegionMode.Polite
                contentDescription = "$title. ${state.statusMessage}"
            },
        colors = CardDefaults.cardColors(
            containerColor = when (state.status) {
                EntitlementDisplayStatus.UNAVAILABLE,
                EntitlementDisplayStatus.OFFLINE_EXPIRED,
                -> MaterialTheme.colorScheme.errorContainer
                EntitlementDisplayStatus.STALE,
                EntitlementDisplayStatus.REFRESH_NEEDED,
                EntitlementDisplayStatus.OFFLINE_VALID,
                -> MaterialTheme.colorScheme.secondaryContainer
                EntitlementDisplayStatus.PENDING,
                EntitlementDisplayStatus.CURRENT,
                -> MaterialTheme.colorScheme.surfaceVariant
            },
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(FinanceDesktopTheme.spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (state.status == EntitlementDisplayStatus.PENDING) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp,
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
            }
            Column {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(state.statusMessage, style = MaterialTheme.typography.bodyMedium)
                if (state.bankConnectionAllowance > 0) {
                    Text(
                        text = "Bank connection allowance: ${state.bankConnectionAllowance}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                state.pendingDowngradeAt?.let {
                    Text(
                        text = "A server-proven access change is scheduled for $it. " +
                            "Finance will refresh status at that time.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun BillingStatus(state: ProductBillingState) {
    val text = when (state) {
        is ProductBillingState.Pending ->
            "Waiting for Finance to confirm trusted billing evidence."
        is ProductBillingState.Error -> state.message
        is ProductBillingState.Confirmed ->
            "Paid status confirmed by the Finance entitlement service."
        is ProductBillingState.Idle -> return
    }
    val isError = state is ProductBillingState.Error
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = if (isError) MaterialTheme.colorScheme.error
        else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .padding(top = FinanceDesktopTheme.spacing.sm)
            .semantics {
                liveRegion = LiveRegionMode.Polite
                contentDescription = if (isError) "Billing error: $text" else text
            },
    )
}

private data class PlanOption(
    val tier: EntitlementTier,
    val title: String,
    val price: String,
    val checkoutChoice: BillingCatalogChoice? = null,
)

@Composable
private fun PlanRow(
    left: PlanOption,
    right: PlanOption,
    currentTier: EntitlementTier?,
    selectedHouseholdId: String?,
    onChoose: (BillingCatalogChoice) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
    ) {
        PlanCard(
            option = left,
            isCurrentPlan = currentTier == left.tier,
            enabled = left.tier != EntitlementTier.FAMILY || selectedHouseholdId != null,
            onChoose = onChoose,
            modifier = Modifier.weight(1f),
        )
        PlanCard(
            option = right,
            isCurrentPlan = currentTier == right.tier,
            enabled = right.tier != EntitlementTier.FAMILY || selectedHouseholdId != null,
            onChoose = onChoose,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun PlanCard(
    option: PlanOption,
    isCurrentPlan: Boolean,
    enabled: Boolean,
    onChoose: (BillingCatalogChoice) -> Unit,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(
        modifier = modifier.semantics {
            contentDescription = "${option.title} plan, ${option.price}. " +
                if (isCurrentPlan) "Current displayed plan." else ""
        },
        colors = CardDefaults.elevatedCardColors(
            containerColor = if (isCurrentPlan) {
                MaterialTheme.colorScheme.primaryContainer
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
                imageVector = Icons.Filled.Diamond,
                contentDescription = null,
                tint = FinanceDesktopTheme.status.premium,
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            Text(
                text = option.title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = option.price,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            if (isCurrentPlan) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                ) {
                    Text(
                        text = "Current displayed plan",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(
                            horizontal = FinanceDesktopTheme.spacing.lg,
                            vertical = FinanceDesktopTheme.spacing.xs,
                        ),
                    )
                }
            } else {
                option.checkoutChoice?.let { choice ->
                    Button(
                        onClick = { onChoose(choice) },
                        enabled = enabled,
                    ) {
                        Text("Choose ${option.title}")
                    }
                    if (!enabled) {
                        Text(
                            text = "Select a household to choose Family.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

            }
        }
    }
}

@Composable
private fun HouseholdScopeSelector(
    scopes: List<com.finance.desktop.entitlement.EntitlementHouseholdScope>,
    selectedHouseholdId: String?,
    onSelect: (String?) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Subscription scope" },
    ) {
        Text(
            text = "Plan scope",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
        Row(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            Button(
                onClick = { onSelect(null) },
                enabled = selectedHouseholdId != null,
            ) {
                Text("Personal")
            }
            scopes.forEach { scope ->
                Button(
                    onClick = { onSelect(scope.id) },
                    enabled = selectedHouseholdId != scope.id,
                ) {
                    Text(scope.name)
                }
            }
        }
    }
}

private fun checkoutHouseholdIntent(
    choice: BillingCatalogChoice,
    selectedHouseholdId: String?,
): String? = when (choice) {
    BillingCatalogChoice.PREMIUM_MONTHLY,
    BillingCatalogChoice.PREMIUM_YEARLY,
    BillingCatalogChoice.FAMILY_MONTHLY,
    BillingCatalogChoice.FAMILY_YEARLY,
    BillingCatalogChoice.PREMIUM_BANK_ADDON_MONTHLY,
    -> selectedHouseholdId
    BillingCatalogChoice.PLUS_MONTHLY,
    BillingCatalogChoice.PLUS_YEARLY,
    -> null
}

@Composable
private fun AlwaysAvailableCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Always available regardless of plan: manual entry, " +
                    "import, full-history export, deletion, privacy and security controls, " +
                    "accessibility, and access to historical data."
            },
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl)) {
            Text(
                text = "Your data controls are always available",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = "Manual entry, import, full-history export, deletion, privacy and " +
                    "security controls, accessibility, and access to historical data are " +
                    "never restricted by your plan or subscription status.",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

private fun EntitlementTier.displayName(): String = when (this) {
    EntitlementTier.FREE -> "Free"
    EntitlementTier.PLUS -> "Plus"
    EntitlementTier.PREMIUM -> "Premium"
    EntitlementTier.FAMILY -> "Family"
    EntitlementTier.UNKNOWN -> "Unavailable"
}
