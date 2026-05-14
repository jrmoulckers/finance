// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.expertise

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.AutoGraph
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/**
 * Expertise tier selection screen (#379).
 *
 * Allows users to self-select their financial expertise level, which
 * adapts the UI complexity throughout the app.
 *
 * @param onBack Navigation callback.
 * @param viewModel The [ExpertiseTierViewModel].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpertiseTierScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ExpertiseTierViewModel = koinViewModel(),
) {
    val currentTier by viewModel.currentTier.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Your Experience Level",
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Your Experience Level screen"
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics { contentDescription = "Navigate back" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        modifier = modifier,
    ) { padding ->
        ExpertiseTierContent(
            currentTier = currentTier,
            availableTiers = viewModel.availableTiers,
            onTierSelected = viewModel::selectTier,
            modifier = Modifier.padding(padding),
        )
    }
}

@Composable
internal fun ExpertiseTierContent(
    currentTier: ExpertiseTier,
    availableTiers: List<ExpertiseTier>,
    onTierSelected: (ExpertiseTier) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Choose how much detail you'd like to see. You can change this anytime in Settings.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics {
                contentDescription = "Choose how much detail you'd like to see. You can change this anytime in Settings."
            },
        )

        Spacer(Modifier.height(8.dp))

        availableTiers.forEach { tier ->
            TierCard(
                tier = tier,
                isSelected = tier == currentTier,
                onClick = { onTierSelected(tier) },
            )
        }

        Spacer(Modifier.height(16.dp))

        // Feature preview for current tier
        val config = ExpertiseTierConfig.configFor(currentTier)
        FeaturePreviewCard(config)

        Spacer(Modifier.height(80.dp))
    }
}

@Composable
private fun TierCard(
    tier: ExpertiseTier,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val containerColor by animateColorAsState(
        targetValue = if (isSelected) MaterialTheme.colorScheme.primaryContainer
        else MaterialTheme.colorScheme.surface,
        label = "tier-card-color",
    )
    val borderColor by animateColorAsState(
        targetValue = if (isSelected) MaterialTheme.colorScheme.primary
        else MaterialTheme.colorScheme.outline,
        label = "tier-card-border",
    )

    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${tier.displayName}: ${tier.description}. ${if (isSelected) "Currently selected" else "Tap to select"}"
                selected = isSelected
            },
        colors = CardDefaults.cardColors(containerColor = containerColor),
        border = BorderStroke(
            width = if (isSelected) 2.dp else 1.dp,
            color = borderColor,
        ),
    ) {
        Row(
            modifier = Modifier.padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = iconForTier(tier),
                contentDescription = null,
                tint = if (isSelected) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = tier.displayName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                    else MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = tier.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (isSelected) {
                Icon(
                    Icons.Filled.Star,
                    contentDescription = "Selected",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp),
                )
            }
        }
    }
}

@Composable
private fun FeaturePreviewCard(config: TierFeatureConfig) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Feature preview for ${config.tier.displayName} tier"
            },
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "What you'll see",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(12.dp))
            FeatureRow("Detailed metrics", config.showDetailedMetrics)
            FeatureRow("Auto-show tooltips", config.showTooltipsByDefault)
            FeatureRow("Advanced charts", config.showAdvancedCharts)
            FeatureRow("Simplified labels", config.showSimplifiedLabels)
            FeatureRow("Guided workflows", config.showGuidedWorkflows)
            FeatureRow("Future projections", config.showProjections)
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Budget categories shown: up to ${config.maxBudgetCategories}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics {
                    contentDescription = "Budget categories shown: up to ${config.maxBudgetCategories}"
                },
            )
        }
    }
}

@Composable
private fun FeatureRow(label: String, enabled: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
            .semantics { contentDescription = "$label: ${if (enabled) "enabled" else "disabled"}" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (enabled) "✓" else "—",
            style = MaterialTheme.typography.bodySmall,
            color = if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
            modifier = Modifier.width(24.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun iconForTier(tier: ExpertiseTier): ImageVector = when (tier) {
    ExpertiseTier.BEGINNER -> Icons.Filled.School
    ExpertiseTier.INTERMEDIATE -> Icons.AutoMirrored.Filled.TrendingUp
    ExpertiseTier.ADVANCED -> Icons.Filled.AutoGraph
}

// ── Previews ────────────────────────────────────────────────────────────

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, showSystemUi = true, name = "Expertise Tier - Beginner")
@Composable
private fun ExpertiseTierBeginnerPreview() {
    FinanceTheme(dynamicColor = false) {
        ExpertiseTierContent(
            currentTier = ExpertiseTier.BEGINNER,
            availableTiers = ExpertiseTier.entries,
            onTierSelected = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, showSystemUi = true, name = "Expertise Tier - Advanced")
@Composable
private fun ExpertiseTierAdvancedPreview() {
    FinanceTheme(dynamicColor = false) {
        ExpertiseTierContent(
            currentTier = ExpertiseTier.ADVANCED,
            availableTiers = ExpertiseTier.entries,
            onTierSelected = {},
        )
    }
}
