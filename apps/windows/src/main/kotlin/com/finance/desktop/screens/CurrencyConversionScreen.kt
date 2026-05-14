// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CurrencyExchange
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.CurrencyViewModel

// =============================================================================
// Currency Conversion Screen — Real-Time Conversion Calculator
// =============================================================================

/**
 * Desktop-optimized currency conversion calculator.
 *
 * Provides a real-time conversion experience with inline currency pickers
 * for both source and target currencies. The layout uses a wide desktop
 * format with the conversion result prominently displayed.
 *
 * ## Features
 * - Inline currency pickers with search (dropdown overlays)
 * - Swap button to reverse source/target currencies (keyboard: Ctrl+S)
 * - Live conversion as the user types
 * - Exchange rate display with timestamp
 * - Formatted output using KMP [CurrencyFormatter]
 *
 * ## Accessibility
 * - All interactive elements have Narrator descriptions
 * - Amount input announces formatted value
 * - Exchange rate announced as "1 USD equals 0.92 EUR"
 * - Error states use `role="alert"` semantics via contentDescription
 *
 * @param modifier Optional [Modifier] for the root layout.
 */
@Composable
@Suppress("LongMethod") // Composable with conversion form layout
fun CurrencyConversionScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<CurrencyViewModel>()
    val state by viewModel.conversionState.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Currency conversion screen" },
    ) {
        // ── Header ──
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.CurrencyExchange,
                contentDescription = null,
                modifier = Modifier.size(28.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
            Text(
                text = "Currency Converter",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Currency Converter heading"
                },
            )
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Main conversion card ──
        ElevatedCard(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.elevatedCardColors(
                containerColor = MaterialTheme.colorScheme.surface,
            ),
        ) {
            Column(
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl),
            ) {
                // From currency section
                Text(
                    text = "From",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription = "Source currency"
                    },
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(
                        FinanceDesktopTheme.spacing.lg,
                    ),
                ) {
                    // Currency selector button
                    CurrencySelectorButton(
                        currencyCode = state.fromCurrency.code,
                        label = findCurrencyName(viewModel, state.fromCurrency.code),
                        onClick = { viewModel.toggleFromPicker() },
                        accessibilityLabel = "Select source currency, currently ${state.fromCurrency.code}",
                    )

                    // Amount input
                    OutlinedTextField(
                        value = state.inputAmount,
                        onValueChange = { viewModel.updateInputAmount(it) },
                        modifier = Modifier
                            .weight(1f)
                            .semantics {
                                contentDescription =
                                    "Amount to convert, ${state.inputAmount} ${state.fromCurrency.code}"
                            },
                        label = { Text("Amount") },
                        singleLine = true,
                        shape = RoundedCornerShape(8.dp),
                    )
                }

                // From currency picker overlay
                AnimatedVisibility(
                    visible = state.showFromPicker,
                    enter = fadeIn(),
                    exit = fadeOut(),
                ) {
                    Column {
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                        InlineCurrencyPicker(
                            currencies = state.availableCurrencies,
                            selectedCurrency = state.fromCurrency,
                            onSelect = { viewModel.setFromCurrency(it) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

                // ── Swap button ──
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    IconButton(
                        onClick = { viewModel.swapCurrencies() },
                        modifier = Modifier.semantics {
                            contentDescription =
                                "Swap currencies. Currently converting ${state.fromCurrency.code} to ${state.toCurrency.code}"
                        },
                    ) {
                        Icon(
                            imageVector = Icons.Filled.SwapHoriz,
                            contentDescription = null,
                            modifier = Modifier.size(32.dp),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

                // ── To currency section ──
                Text(
                    text = "To",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription = "Target currency"
                    },
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(
                        FinanceDesktopTheme.spacing.lg,
                    ),
                ) {
                    CurrencySelectorButton(
                        currencyCode = state.toCurrency.code,
                        label = findCurrencyName(viewModel, state.toCurrency.code),
                        onClick = { viewModel.toggleToPicker() },
                        accessibilityLabel = "Select target currency, currently ${state.toCurrency.code}",
                    )

                    // Converted amount display
                    Surface(
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        tonalElevation = 2.dp,
                    ) {
                        Box(
                            modifier = Modifier
                                .padding(FinanceDesktopTheme.spacing.lg)
                                .semantics {
                                    contentDescription = if (state.formattedTo.isNotEmpty()) {
                                        "Converted amount: ${state.formattedTo}"
                                    } else {
                                        "Converted amount will appear here"
                                    }
                                },
                        ) {
                            if (state.isLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier
                                        .size(24.dp)
                                        .align(Alignment.Center),
                                    strokeWidth = 2.dp,
                                )
                            } else {
                                Text(
                                    text = state.formattedTo.ifEmpty { "—" },
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }

                // To currency picker overlay
                AnimatedVisibility(
                    visible = state.showToPicker,
                    enter = fadeIn(),
                    exit = fadeOut(),
                ) {
                    Column {
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                        InlineCurrencyPicker(
                            currencies = state.availableCurrencies,
                            selectedCurrency = state.toCurrency,
                            onSelect = { viewModel.setToCurrency(it) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Exchange rate display ──
        if (state.rateDisplay.isNotEmpty()) {
            ElevatedCard(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.elevatedCardColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                ),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(FinanceDesktopTheme.spacing.lg),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.CurrencyExchange,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                    Text(
                        text = state.rateDisplay,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.semantics {
                            contentDescription = "Exchange rate: ${state.rateDisplay}"
                        },
                    )
                }
            }
        }

        // ── Error display ──
        if (state.error != null) {
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            ElevatedCard(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.elevatedCardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                ),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(FinanceDesktopTheme.spacing.lg),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.ErrorOutline,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                    Text(
                        text = state.error ?: "",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.semantics {
                            contentDescription = "Error: ${state.error}"
                        },
                    )
                }
            }
        }

        Spacer(Modifier.weight(1f))

        // ── Conversion summary ──
        if (state.formattedFrom.isNotEmpty() && state.formattedTo.isNotEmpty() && !state.isLoading) {
            HorizontalDivider(
                modifier = Modifier.padding(vertical = FinanceDesktopTheme.spacing.lg),
                color = MaterialTheme.colorScheme.outlineVariant,
            )
            Text(
                text = "${state.formattedFrom} = ${state.formattedTo}",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription =
                            "Conversion result: ${state.formattedFrom} equals ${state.formattedTo}"
                    },
            )
        }
    }
}

// =============================================================================
// Currency Selector Button
// =============================================================================

/**
 * Button that displays the current currency selection and opens a picker.
 *
 * Shows the currency code and name. Styled as an outlined button with
 * a dropdown indicator icon.
 *
 * @param currencyCode The ISO 4217 currency code to display.
 * @param label Human-readable currency name.
 * @param onClick Callback when the button is clicked.
 * @param accessibilityLabel Narrator description.
 */
@Composable
private fun CurrencySelectorButton(
    currencyCode: String,
    label: String,
    onClick: () -> Unit,
    accessibilityLabel: String,
) {
    OutlinedButton(
        onClick = onClick,
        modifier = Modifier
            .width(200.dp)
            .semantics { contentDescription = accessibilityLabel },
        shape = RoundedCornerShape(8.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            Text(
                text = currencyCode,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Icon(
                imageVector = Icons.Filled.UnfoldMore,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

/**
 * Look up the human-readable name for a currency code from the ViewModel's
 * companion metadata.
 */
private fun findCurrencyName(@Suppress("UnusedParameter") viewModel: CurrencyViewModel, code: String): String {
    return CurrencyViewModel.currencyNames[code] ?: code
}
