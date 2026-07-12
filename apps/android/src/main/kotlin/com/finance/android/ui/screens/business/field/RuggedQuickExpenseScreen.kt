// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.field

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.finance.android.ui.accessibility.financeSemantic
import com.finance.android.ui.accessibility.liveRegion
import com.finance.android.ui.screens.business.BusinessCategory
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.koinInject
import org.koin.compose.viewmodel.koinViewModel

/**
 * Rugged one-handed quick-expense entry for wet/gloved hands (#2186).
 *
 * When rugged mode is on, controls use oversized touch targets and a
 * high-contrast theme so a food-truck operator can log an expense with a few
 * big taps during a lunch rush.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RuggedQuickExpenseScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
    ruggedMode: RuggedModeManager = koinInject(),
    viewModel: RuggedQuickExpenseViewModel = koinViewModel(),
) {
    val enabled by ruggedMode.enabled.collectAsState()

    FinanceTheme(highContrast = enabled) {
        val state by viewModel.uiState.collectAsState()
        val target: Dp = if (enabled) RuggedModeManager.RUGGED_TOUCH_TARGET else RuggedModeManager.STANDARD_TOUCH_TARGET

        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            "Quick Expense",
                            modifier = Modifier.semantics {
                                contentDescription = "Rugged quick expense entry"
                                heading()
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
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                RuggedModeToggle(enabled = enabled, onToggle = { ruggedMode.setEnabled(it) })

                Text(
                    state.amountFormatted,
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .liveRegion()
                        .financeSemantic("Amount ${state.amountFormatted}"),
                )

                CategoryButtons(
                    categories = viewModel.quickCategories,
                    selected = state.selectedCategory,
                    target = target,
                    onSelect = viewModel::selectCategory,
                )

                Keypad(target = target, onDigit = viewModel::pressDigit, onBackspace = viewModel::backspace)

                Button(
                    onClick = viewModel::save,
                    enabled = state.canSave,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = target)
                        .financeSemantic("Save expense"),
                ) {
                    Text("Save", style = MaterialTheme.typography.titleLarge)
                }

                state.lastSavedMessage?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.liveRegion(),
                    )
                }

                state.recent.forEach { recent ->
                    Text(
                        "${recent.categoryLabel} — ${recent.amountFormatted}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun RuggedModeToggle(enabled: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Rugged field mode", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                "Big targets and high contrast for wet or gloved hands",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = enabled,
            onCheckedChange = onToggle,
            modifier = Modifier.financeSemantic("Rugged field mode", if (enabled) "On" else "Off"),
        )
    }
}

@Composable
private fun CategoryButtons(
    categories: List<BusinessCategory>,
    selected: BusinessCategory?,
    target: Dp,
    onSelect: (BusinessCategory) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        categories.chunked(2).forEach { rowItems ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                rowItems.forEach { category ->
                    val isSelected = category == selected
                    FilledTonalButton(
                        onClick = { onSelect(category) },
                        colors = if (isSelected) {
                            ButtonDefaults.buttonColors()
                        } else {
                            ButtonDefaults.filledTonalButtonColors()
                        },
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = target)
                            .financeSemantic(
                                "Category ${category.label}",
                                if (isSelected) "Selected" else null,
                            ),
                    ) {
                        Text(category.label, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
                    }
                }
            }
        }
    }
}

@Composable
private fun Keypad(target: Dp, onDigit: (Int) -> Unit, onBackspace: () -> Unit) {
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("00", "0", "<"),
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        rows.forEach { row ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { key ->
                    OutlinedButton(
                        onClick = {
                            when (key) {
                                "<" -> onBackspace()
                                "00" -> { onDigit(0); onDigit(0) }
                                else -> onDigit(key.toInt())
                            }
                        },
                        modifier = Modifier
                            .weight(1f)
                            .height(target)
                            .financeSemantic(if (key == "<") "Backspace" else "Digit $key"),
                    ) {
                        if (key == "<") {
                            Icon(Icons.AutoMirrored.Filled.Backspace, contentDescription = null)
                        } else {
                            Text(key, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun RuggedQuickExpenseScreenPreview() {
    FinanceTheme {
        RuggedQuickExpenseScreen()
    }
}
