// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.affordability

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.models.types.Cents
import org.koin.compose.viewmodel.koinViewModel

/**
 * "Can I Afford This?" screen (#377) — affordability check widget.
 *
 * Allows users to enter a planned purchase amount and instantly see
 * a traffic-light verdict on whether the purchase is financially
 * sustainable given their current balances and budgets.
 *
 * ## Accessibility
 * - All interactive elements have contentDescription for TalkBack
 * - Verdict uses both colour AND icon/text for colour-blind users
 * - Recommendations are announced as a list for screen readers
 *
 * @param onBack Navigation callback when the user presses the back button.
 * @param viewModel The [AffordabilityViewModel] providing analysis state.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AffordabilityScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: AffordabilityViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Can I Afford This?",
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Can I Afford This? screen"
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
        AffordabilityContent(
            state = state,
            onAmountChanged = viewModel::onAmountChanged,
            onCheckAffordability = viewModel::checkAffordability,
            onReset = viewModel::reset,
            modifier = Modifier.padding(padding),
        )
    }
}

@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
internal fun AffordabilityContent(
    state: AffordabilityUiState,
    onAmountChanged: (String) -> Unit,
    onCheckAffordability: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusManager = LocalFocusManager.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Available funds card
        if (state.availableFundsFormatted.isNotEmpty()) {
            ElevatedCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription =
                            "Available funds: ${state.availableFundsFormatted}"
                    },
                colors = CardDefaults.elevatedCardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                ),
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "Available Funds",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.semantics {
                            contentDescription = "Available Funds label"
                        },
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = state.availableFundsFormatted,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }
        }

        // Amount input
        OutlinedTextField(
            value = state.amountText,
            onValueChange = onAmountChanged,
            label = { Text("Purchase Amount") },
            placeholder = { Text("0.00") },
            prefix = { Text("$") },
            isError = state.errorMessage != null,
            supportingText = state.errorMessage?.let {
                { Text(it, modifier = Modifier.semantics { contentDescription = it }) }
            },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Decimal,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(
                onDone = {
                    focusManager.clearFocus()
                    onCheckAffordability()
                },
            ),
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Enter purchase amount in dollars" },
        )

        // Action buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            FilledTonalButton(
                onClick = {
                    focusManager.clearFocus()
                    onCheckAffordability()
                },
                enabled = state.amountText.isNotEmpty() && !state.isAnalysing,
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Check if you can afford this purchase" },
            ) {
                if (state.isAnalysing) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(18.dp)
                            .semantics { contentDescription = "Analysing affordability" },
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text(if (state.isAnalysing) "Analysing…" else "Check Affordability")
            }

            if (state.result != null) {
                FilledTonalButton(
                    onClick = onReset,
                    modifier = Modifier.semantics {
                        contentDescription = "Reset and start a new affordability check"
                    },
                ) {
                    Icon(Icons.Filled.Refresh, contentDescription = null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Reset")
                }
            }
        }

        // Results section
        AnimatedVisibility(
            visible = state.result != null,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically(),
        ) {
            state.result?.let { result ->
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    VerdictCard(result)
                    BudgetImpactCard(result.budgetImpact)
                    RecommendationsCard(result.recommendations)
                }
            }
        }

        Spacer(Modifier.height(80.dp))
    }
}

@Composable
private fun VerdictCard(result: AffordabilityResult) {
    val (icon, color, label) = verdictPresentation(result.verdict)

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Affordability verdict: $label"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = color.copy(alpha = 0.12f),
        ),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(48.dp),
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = color,
                modifier = Modifier.semantics { heading() },
            )
        }
    }
}

@Composable
private fun BudgetImpactCard(impact: BudgetImpact) {
    if (impact.affectedBudgetName == null) return

    val progress = if (impact.budgetLimit.amount > 0) {
        (impact.spentAfterPurchase.amount.toFloat() / impact.budgetLimit.amount.toFloat())
            .coerceIn(0f, 1.5f)
    } else {
        0f
    }

    val progressColor = when {
        impact.wouldExceedBudget -> MaterialTheme.colorScheme.error
        progress > 0.8f -> Color(0xFFFF9800)
        else -> MaterialTheme.colorScheme.primary
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Budget impact on ${impact.affectedBudgetName}: " +
                    if (impact.wouldExceedBudget) "would exceed budget" else "within budget"
            },
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Budget Impact: ${impact.affectedBudgetName}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(12.dp))
            LinearProgressIndicator(
                progress = { progress.coerceAtMost(1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .semantics {
                        contentDescription = "Budget usage: ${(progress * 100).toInt()} percent"
                    },
                color = progressColor,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            if (impact.wouldExceedBudget) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.Warning,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "This purchase would exceed your budget",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.semantics {
                            contentDescription = "Warning: this purchase would exceed your budget"
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun RecommendationsCard(recommendations: List<String>) {
    if (recommendations.isEmpty()) return

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Recommendations: ${recommendations.size} suggestions"
            },
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Recommendations",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            recommendations.forEach { recommendation ->
                Row(
                    modifier = Modifier.padding(vertical = 4.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        Icons.Filled.Info,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .size(16.dp)
                            .padding(top = 2.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = recommendation,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics {
                            contentDescription = recommendation
                        },
                    )
                }
            }
        }
    }
}

/**
 * Maps verdict enum to presentation triple of (icon, color, label).
 */
@Composable
private fun verdictPresentation(verdict: AffordabilityVerdict): Triple<ImageVector, Color, String> =
    when (verdict) {
        AffordabilityVerdict.COMFORTABLE -> Triple(
            Icons.Filled.CheckCircle,
            Color(0xFF2E7D32),
            "Yes, Comfortably!",
        )
        AffordabilityVerdict.TIGHT -> Triple(
            Icons.Filled.Warning,
            Color(0xFFFF9800),
            "Yes, but It's Tight",
        )
        AffordabilityVerdict.RISKY -> Triple(
            Icons.Filled.Warning,
            MaterialTheme.colorScheme.error,
            "Risky — Very Tight",
        )
        AffordabilityVerdict.CANNOT_AFFORD -> Triple(
            Icons.Filled.Error,
            MaterialTheme.colorScheme.error,
            "Cannot Afford This",
        )
    }

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, showSystemUi = true, name = "Affordability - Empty")
@Composable
private fun AffordabilityEmptyPreview() {
    FinanceTheme(dynamicColor = false) {
        AffordabilityContent(
            state = AffordabilityUiState(
                availableFundsFormatted = "$12,345.67",
            ),
            onAmountChanged = {},
            onCheckAffordability = {},
            onReset = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, showSystemUi = true, name = "Affordability - Comfortable")
@Composable
private fun AffordabilityComfortablePreview() {
    FinanceTheme(dynamicColor = false) {
        AffordabilityContent(
            state = AffordabilityUiState(
                amountText = "150",
                availableFundsFormatted = "$12,345.67",
                result = AffordabilityResult(
                    verdict = AffordabilityVerdict.COMFORTABLE,
                    availableFunds = Cents(1234567),
                    purchaseAmount = Cents(15000),
                    remainingAfterPurchase = Cents(1219567),
                    budgetImpact = BudgetImpact(
                        affectedBudgetName = "Shopping",
                        currentSpent = Cents(15000),
                        budgetLimit = Cents(50000),
                        spentAfterPurchase = Cents(30000),
                        wouldExceedBudget = false,
                    ),
                    recommendations = listOf(
                        "This purchase fits comfortably within your means.",
                    ),
                ),
            ),
            onAmountChanged = {},
            onCheckAffordability = {},
            onReset = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, showSystemUi = true, name = "Affordability - Cannot Afford")
@Composable
private fun AffordabilityCannotAffordPreview() {
    FinanceTheme(dynamicColor = false) {
        AffordabilityContent(
            state = AffordabilityUiState(
                amountText = "50000",
                availableFundsFormatted = "$1,234.56",
                result = AffordabilityResult(
                    verdict = AffordabilityVerdict.CANNOT_AFFORD,
                    availableFunds = Cents(123456),
                    purchaseAmount = Cents(5000000),
                    remainingAfterPurchase = Cents(-4876544),
                    budgetImpact = BudgetImpact(
                        affectedBudgetName = null,
                        currentSpent = Cents.ZERO,
                        budgetLimit = Cents.ZERO,
                        spentAfterPurchase = Cents(5000000),
                        wouldExceedBudget = false,
                    ),
                    recommendations = listOf(
                        "This purchase exceeds your available funds.",
                        "Consider saving up or finding a lower-cost alternative.",
                    ),
                ),
            ),
            onAmountChanged = {},
            onCheckAffordability = {},
            onReset = {},
        )
    }
}
