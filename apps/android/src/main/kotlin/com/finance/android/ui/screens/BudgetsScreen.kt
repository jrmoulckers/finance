@file:OptIn(ExperimentalMaterial3Api::class)

package com.finance.android.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.finance.android.ui.components.charts.BudgetComparisonChart
import com.finance.android.ui.components.charts.ChartColors
import com.finance.android.ui.components.charts.CircularProgressRing
import com.finance.android.ui.components.charts.ComparisonEntry
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.BudgetCardUi
import com.finance.android.ui.viewmodel.BudgetUiState
import com.finance.android.ui.viewmodel.BudgetViewModel
import com.finance.android.ui.viewmodel.MonthComparisonUi

/**
 * Budget management screen (#32).
 *
 * Displays budgets as cards with circular progress rings,
 * a month selector, month-over-month comparison chart, and
 * a bottom sheet for creating/editing budgets.
 */
@Composable
fun BudgetsScreen(
    modifier: Modifier = Modifier,
    viewModel: BudgetViewModel = viewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var showCreateSheet by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showCreateSheet = true },
                modifier = Modifier.semantics {
                    contentDescription = "Create new budget"
                },
            ) {
                Icon(imageVector = Icons.Default.Add, contentDescription = null)
            }
        },
        modifier = modifier,
    ) { padding ->
        AnimatedVisibility(
            visible = !uiState.isLoading,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            if (uiState.budgets.isEmpty()) {
                BudgetEmptyState(
                    modifier = Modifier.padding(padding),
                    onCreateClick = { showCreateSheet = true },
                )
            } else {
                BudgetList(
                    uiState = uiState,
                    modifier = Modifier.padding(padding),
                    onPreviousMonth = { viewModel.previousMonth() },
                    onNextMonth = { viewModel.nextMonth() },
                )
            }
        }
    }

    if (showCreateSheet) {
        CreateEditBudgetSheet(
            onDismiss = { showCreateSheet = false },
            onSave = { _, _ -> showCreateSheet = false },
        )
    }
}

// ── Budget List ────────────────────────────────────────────────────────

@Composable
private fun BudgetList(
    uiState: BudgetUiState,
    modifier: Modifier = Modifier,
    onPreviousMonth: () -> Unit = {},
    onNextMonth: () -> Unit = {},
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "month-selector") {
            MonthSelector(
                monthLabel = uiState.selectedMonthLabel,
                onPrevious = onPreviousMonth,
                onNext = onNextMonth,
            )
        }

        items(items = uiState.budgets, key = { it.id }) { budget ->
            BudgetCard(budget = budget)
        }

        if (uiState.monthComparisons.isNotEmpty()) {
            item(key = "comparison-header") {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Month-over-Month",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        contentDescription = "Month-over-month comparison section"
                        heading()
                    },
                )
            }

            item(key = "comparison-chart") {
                BudgetComparisonChart(
                    entries = uiState.monthComparisons.map { comp ->
                        ComparisonEntry(
                            categoryName = comp.categoryName,
                            thisMonth = comp.thisMonthAmount,
                            lastMonth = comp.lastMonthAmount,
                            thisMonthFormatted = comp.thisMonthFormatted,
                            lastMonthFormatted = comp.lastMonthFormatted,
                        )
                    },
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            }
        }

        item(key = "fab-spacer") { Spacer(modifier = Modifier.height(72.dp)) }
    }
}

// ── Month Selector ─────────────────────────────────────────────────────

@Composable
private fun MonthSelector(
    monthLabel: String,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(
            onClick = onPrevious,
            modifier = Modifier.semantics { contentDescription = "Previous month" },
        ) {
            Icon(imageVector = Icons.Default.KeyboardArrowLeft, contentDescription = null)
        }

        Text(
            text = monthLabel,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            modifier = Modifier
                .padding(horizontal = 16.dp)
                .semantics { contentDescription = "Selected month: $monthLabel" },
            textAlign = TextAlign.Center,
        )

        IconButton(
            onClick = onNext,
            modifier = Modifier.semantics { contentDescription = "Next month" },
        ) {
            Icon(imageVector = Icons.Default.KeyboardArrowRight, contentDescription = null)
        }
    }
}

// ── Budget Card ────────────────────────────────────────────────────────

@Composable
private fun BudgetCard(
    budget: BudgetCardUi,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = budget.accessibilityLabel },
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircularProgressRing(
                utilization = budget.utilization,
                centerText = "${(budget.utilization * 100).toInt()}%",
                subtitleText = "",
                accessibilityLabel = "",
                size = 64.dp,
                strokeWidth = 6.dp,
            )

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = budget.categoryName,
                        style = MaterialTheme.typography.titleSmall.copy(
                            fontWeight = FontWeight.SemiBold,
                        ),
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = "${budget.spentAmountFormatted} of ${budget.budgetedAmountFormatted}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Spacer(modifier = Modifier.height(2.dp))

                Text(
                    text = budget.remainingAmountFormatted,
                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                    color = if (budget.isOverBudget) ChartColors.BudgetOver
                    else ChartColors.BudgetHealthy,
                )
            }
        }
    }
}

// ── Create/Edit Bottom Sheet ───────────────────────────────────────────

@Composable
private fun CreateEditBudgetSheet(
    onDismiss: () -> Unit,
    onSave: (categoryName: String, amount: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var selectedCategory by remember { mutableStateOf("") }
    var amountText by remember { mutableStateOf("") }
    var selectedPeriod by remember { mutableStateOf("Monthly") }

    val categories = listOf("Groceries", "Dining Out", "Transportation", "Entertainment", "Utilities", "Shopping")
    val periods = listOf("Weekly", "Monthly", "Yearly")

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
        ) {
            Text(
                text = "Create Budget",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.semantics {
                    contentDescription = "Create budget form"
                    heading()
                },
            )

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Category",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { contentDescription = "Category selector label" },
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                categories.take(3).forEach { category ->
                    TextButton(
                        onClick = { selectedCategory = category },
                        modifier = Modifier.semantics {
                            contentDescription = if (selectedCategory == category)
                                "$category category, selected" else "$category category"
                        },
                    ) {
                        Text(
                            text = category,
                            color = if (selectedCategory == category)
                                MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                categories.drop(3).forEach { category ->
                    TextButton(
                        onClick = { selectedCategory = category },
                        modifier = Modifier.semantics {
                            contentDescription = if (selectedCategory == category)
                                "$category category, selected" else "$category category"
                        },
                    ) {
                        Text(
                            text = category,
                            color = if (selectedCategory == category)
                                MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = amountText,
                onValueChange = { amountText = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text(text = "Budget Amount ($)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Budget amount input field" },
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Period",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { contentDescription = "Budget period selector label" },
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                periods.forEach { period ->
                    TextButton(
                        onClick = { selectedPeriod = period },
                        modifier = Modifier.semantics {
                            contentDescription = if (selectedPeriod == period)
                                "$period period, selected" else "$period period"
                        },
                    ) {
                        Text(
                            text = period,
                            color = if (selectedPeriod == period)
                                MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    if (selectedCategory.isNotBlank() && amountText.isNotBlank()) {
                        onSave(selectedCategory, amountText)
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Save budget button" },
                enabled = selectedCategory.isNotBlank() && amountText.isNotBlank(),
            ) {
                Text(text = "Save Budget")
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

// ── Empty State ────────────────────────────────────────────────────────

@Composable
private fun BudgetEmptyState(
    modifier: Modifier = Modifier,
    onCreateClick: () -> Unit = {},
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp),
        ) {
            Text(
                text = "No budgets set",
                style = MaterialTheme.typography.headlineSmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics {
                    contentDescription = "No budgets set — create your first budget"
                    heading()
                },
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Create your first budget to start tracking your spending",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics {
                    contentDescription = "Create your first budget to start tracking your spending"
                },
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = onCreateClick,
                modifier = Modifier.semantics { contentDescription = "Create your first budget" },
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(text = "Create Budget")
            }
        }
    }
}

// ── Previews ───────────────────────────────────────────────────────────

@Preview(showBackground = true, name = "Budget Card")
@Composable
private fun BudgetCardPreview() {
    FinanceTheme(dynamicColor = false) {
        BudgetCard(
            budget = BudgetCardUi(
                id = "preview-1",
                categoryName = "Groceries",
                categoryIcon = "shopping_cart",
                budgetedAmountFormatted = "\$400",
                spentAmountFormatted = "\$300",
                remainingAmountFormatted = "\$100 left",
                utilization = 0.75f,
                isOverBudget = false,
                periodLabel = "Monthly",
                accessibilityLabel = "Groceries budget: 75% used, \$300 of \$400, \$100 remaining",
                spentCents = 30000,
                budgetedCents = 40000,
            ),
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "Budget Empty State")
@Composable
private fun BudgetEmptyStatePreview() {
    FinanceTheme(dynamicColor = false) {
        BudgetEmptyState()
    }
}

@Preview(showBackground = true, name = "Budgets")
@Composable
private fun BudgetsScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        BudgetsScreen()
    }
}
