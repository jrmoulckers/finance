// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.preview

import android.content.res.Configuration
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme

/**
 * Compose Preview Catalog — visual gallery of all Finance UI components.
 *
 * This file contains organized @Preview functions for every reusable
 * component and design token used in the Finance app. Use these previews to:
 *
 * 1. **Verify theme consistency** across light/dark/high-contrast modes
 * 2. **Audit accessibility** (font scaling, touch targets, contrast)
 * 3. **Catch regressions** via Paparazzi snapshot tests
 * 4. **Onboard new developers** to the design system
 *
 * ## Organization
 * - Typography Scale
 * - Color Tokens
 * - Buttons & Actions
 * - Cards & Containers
 * - Input Fields
 * - Chips & Filters
 * - State Indicators (loading, empty, error)
 *
 * ## Running
 * Open in Android Studio → Preview panel, or generate snapshots:
 * ```bash
 * ./gradlew :apps:android:recordPaparazziDebug
 * ```
 */

// ═══════════════════════════════════════════════════════════════════
// Typography Scale
// ═══════════════════════════════════════════════════════════════════

@Preview(showBackground = true, name = "Typography Scale - Light")
@Preview(
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    name = "Typography Scale - Dark",
)
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun TypographyScalePreview() {
    FinanceTheme(dynamicColor = false) {
        Surface {
            Column(
                Modifier
                    .padding(16.dp)
                    .semantics { contentDescription = "Typography scale preview" },
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "Display Large",
                    style = MaterialTheme.typography.displayLarge,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    "Headline Large",
                    style = MaterialTheme.typography.headlineLarge,
                    modifier = Modifier.semantics { heading() },
                )
                Text("Title Large", style = MaterialTheme.typography.titleLarge)
                Text("Title Medium", style = MaterialTheme.typography.titleMedium)
                Text("Body Large", style = MaterialTheme.typography.bodyLarge)
                Text("Body Medium", style = MaterialTheme.typography.bodyMedium)
                Text("Label Large", style = MaterialTheme.typography.labelLarge)
                Text("Label Small", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, fontScale = 2.0f, name = "Typography Scale - 2x Font")
@Composable
private fun TypographyScaleLargeFontPreview() {
    FinanceTheme(dynamicColor = false) {
        Surface {
            Column(
                Modifier
                    .padding(16.dp)
                    .semantics { contentDescription = "Typography scale at 2x font" },
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Title Large", style = MaterialTheme.typography.titleLarge)
                Text("Body Large", style = MaterialTheme.typography.bodyLarge)
                Text("Label Large", style = MaterialTheme.typography.labelLarge)
                Text("Label Small", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// Color Tokens
// ═══════════════════════════════════════════════════════════════════

@Preview(showBackground = true, name = "Color Tokens - Light")
@Preview(
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    name = "Color Tokens - Dark",
)
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun ColorTokensPreview() {
    FinanceTheme(dynamicColor = false) {
        Surface {
            Column(
                Modifier
                    .padding(16.dp)
                    .semantics { contentDescription = "Color tokens preview" },
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ColorTokenRow("Primary", MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.onPrimary)
                ColorTokenRow("Secondary", MaterialTheme.colorScheme.secondary, MaterialTheme.colorScheme.onSecondary)
                ColorTokenRow("Tertiary", MaterialTheme.colorScheme.tertiary, MaterialTheme.colorScheme.onTertiary)
                ColorTokenRow("Error", MaterialTheme.colorScheme.error, MaterialTheme.colorScheme.onError)
                ColorTokenRow("Surface", MaterialTheme.colorScheme.surface, MaterialTheme.colorScheme.onSurface)
                ColorTokenRow(
                    "Surface Variant",
                    MaterialTheme.colorScheme.surfaceVariant,
                    MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ColorTokenRow(
    label: String,
    background: androidx.compose.ui.graphics.Color,
    foreground: androidx.compose.ui.graphics.Color,
) {
    Surface(
        color = background,
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "$label color token" },
    ) {
        Text(
            text = label,
            color = foreground,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
}

// ═══════════════════════════════════════════════════════════════════
// Buttons & Actions
// ═══════════════════════════════════════════════════════════════════

@Preview(showBackground = true, name = "Buttons - Light")
@Preview(
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    name = "Buttons - Dark",
)
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun ButtonsPreview() {
    FinanceTheme(dynamicColor = false) {
        Surface {
            Column(
                Modifier
                    .padding(16.dp)
                    .semantics { contentDescription = "Button styles preview" },
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "Buttons",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )

                Button(
                    onClick = {},
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Primary filled button" },
                ) {
                    Icon(Icons.Filled.Check, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Save Changes")
                }

                FilledTonalButton(
                    onClick = {},
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Tonal button" },
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Add Transaction")
                }

                OutlinedButton(
                    onClick = {},
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Outlined button" },
                ) {
                    Text("Cancel")
                }

                TextButton(
                    onClick = {},
                    modifier = Modifier.semantics { contentDescription = "Text button" },
                ) {
                    Text("Learn More")
                }

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    FloatingActionButton(
                        onClick = {},
                        modifier = Modifier.semantics {
                            contentDescription = "Floating action button"
                        },
                    ) {
                        Icon(Icons.Filled.Add, contentDescription = "Add")
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// Cards & Containers
// ═══════════════════════════════════════════════════════════════════

@Preview(showBackground = true, name = "Cards - Light")
@Preview(
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    name = "Cards - Dark",
)
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun CardsPreview() {
    FinanceTheme(dynamicColor = false) {
        Surface {
            Column(
                Modifier
                    .padding(16.dp)
                    .semantics { contentDescription = "Card styles preview" },
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "Cards",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )

                // Standard Card
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Standard card" },
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Transaction", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "Coffee Shop",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                // Elevated Card (Net Worth style)
                ElevatedCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Elevated card" },
                    colors = CardDefaults.elevatedCardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                    ),
                ) {
                    Column(
                        Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            "Net Worth",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "$12,345.67",
                            style = MaterialTheme.typography.headlineLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                        )
                    }
                }

                // Error Card
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Error card" },
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                    ),
                ) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.Error,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onErrorContainer,
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            "Validation error message",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// Input Fields
// ═══════════════════════════════════════════════════════════════════

@Preview(showBackground = true, name = "Inputs - Light")
@Preview(
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    name = "Inputs - Dark",
)
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun InputFieldsPreview() {
    FinanceTheme(dynamicColor = false) {
        Surface {
            Column(
                Modifier
                    .padding(16.dp)
                    .semantics { contentDescription = "Input field styles preview" },
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "Input Fields",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )

                OutlinedTextField(
                    value = "Main Checking",
                    onValueChange = {},
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Filled text field" },
                    label = { Text("Account Name") },
                )

                OutlinedTextField(
                    value = "",
                    onValueChange = {},
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Empty text field with placeholder" },
                    label = { Text("Amount") },
                    placeholder = { Text("0.00") },
                    leadingIcon = {
                        Icon(Icons.Filled.AttachMoney, contentDescription = null)
                    },
                )

                OutlinedTextField(
                    value = "invalid",
                    onValueChange = {},
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Error state text field" },
                    label = { Text("Balance") },
                    isError = true,
                    supportingText = { Text("Must be a valid number") },
                )
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// Chips & Filters
// ═══════════════════════════════════════════════════════════════════

@Preview(showBackground = true, name = "Chips - Light")
@Preview(
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    name = "Chips - Dark",
)
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun ChipsPreview() {
    FinanceTheme(dynamicColor = false) {
        Surface {
            Column(
                Modifier
                    .padding(16.dp)
                    .semantics { contentDescription = "Chip styles preview" },
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "Chips",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = true,
                        onClick = {},
                        label = { Text("Expenses") },
                        modifier = Modifier.semantics {
                            contentDescription = "Filter: Expenses, selected"
                        },
                    )
                    FilterChip(
                        selected = false,
                        onClick = {},
                        label = { Text("Income") },
                        modifier = Modifier.semantics {
                            contentDescription = "Filter: Income, not selected"
                        },
                    )
                    FilterChip(
                        selected = false,
                        onClick = {},
                        label = { Text("Transfers") },
                        modifier = Modifier.semantics {
                            contentDescription = "Filter: Transfers, not selected"
                        },
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SuggestionChip(
                        onClick = {},
                        label = { Text("Groceries") },
                        modifier = Modifier.semantics {
                            contentDescription = "Category suggestion: Groceries"
                        },
                    )
                    SuggestionChip(
                        onClick = {},
                        label = { Text("Dining") },
                        modifier = Modifier.semantics {
                            contentDescription = "Category suggestion: Dining"
                        },
                    )
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// Financial Icons
// ═══════════════════════════════════════════════════════════════════

@Preview(showBackground = true, name = "Icons - Light")
@Preview(
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    name = "Icons - Dark",
)
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun FinancialIconsPreview() {
    FinanceTheme(dynamicColor = false) {
        Surface {
            Column(
                Modifier
                    .padding(16.dp)
                    .semantics { contentDescription = "Financial icons preview" },
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "Financial Icons",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )

                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Filled.TrendingUp,
                            contentDescription = "Income indicator",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Text("Income", style = MaterialTheme.typography.labelSmall)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Filled.TrendingDown,
                            contentDescription = "Expense indicator",
                            tint = MaterialTheme.colorScheme.error,
                        )
                        Text("Expense", style = MaterialTheme.typography.labelSmall)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Filled.AccountBalance,
                            contentDescription = "Account icon",
                            tint = MaterialTheme.colorScheme.secondary,
                        )
                        Text("Account", style = MaterialTheme.typography.labelSmall)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Filled.Home,
                            contentDescription = "Dashboard icon",
                            tint = MaterialTheme.colorScheme.tertiary,
                        )
                        Text("Dashboard", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}
