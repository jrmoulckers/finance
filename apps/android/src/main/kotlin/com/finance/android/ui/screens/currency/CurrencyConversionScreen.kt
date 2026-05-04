// SPDX-License-Identifier: BUSL-1.1

@file:OptIn(ExperimentalMaterial3Api::class)

package com.finance.android.ui.screens.currency

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.finance.core.multicurrency.CurrencyInfo
import com.finance.models.types.Currency
import org.koin.compose.viewmodel.koinViewModel

// ─────────────────────────────────────────────────────────────────────────────
// Currency Conversion Screen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Real-time currency conversion calculator.
 *
 * Lets users select two currencies and enter an amount to see the converted
 * value. Shows the exchange rate and timestamp of the last rate update.
 *
 * @param onBack Called when the user navigates back.
 * @param viewModel The [CurrencyViewModel] providing conversion state.
 */
@Composable
fun CurrencyConversionScreen(
    onBack: () -> Unit,
    viewModel: CurrencyViewModel = koinViewModel(),
) {
    val state by viewModel.conversionState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Currency Converter",
                        modifier = Modifier.semantics { heading() },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics {
                            contentDescription = "Navigate back"
                        },
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ── Input card ──────────────────────────────────────────────
            ConversionInputCard(
                fromCurrency = state.fromCurrency,
                toCurrency = state.toCurrency,
                inputAmount = state.inputAmount,
                availableCurrencies = state.availableCurrencies,
                onAmountChanged = viewModel::onAmountChanged,
                onFromCurrencyChanged = viewModel::setFromCurrency,
                onToCurrencyChanged = viewModel::setToCurrency,
                onSwap = viewModel::swapCurrencies,
            )

            // ── Result card ─────────────────────────────────────────────
            ConversionResultCard(
                isConverting = state.isConverting,
                convertedFormatted = state.convertedFormatted,
                exchangeRate = state.exchangeRate,
                fromCurrency = state.fromCurrency,
                toCurrency = state.toCurrency,
                rateTimestamp = state.rateTimestamp,
                errorMessage = state.errorMessage,
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Card containing the currency selectors, amount input, and swap button.
 */
@Composable
private fun ConversionInputCard(
    fromCurrency: Currency,
    toCurrency: Currency,
    inputAmount: String,
    availableCurrencies: List<CurrencyInfo>,
    onAmountChanged: (String) -> Unit,
    onFromCurrencyChanged: (Currency) -> Unit,
    onToCurrencyChanged: (Currency) -> Unit,
    onSwap: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Currency conversion input"
            },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // From currency selector
            CurrencyDropdown(
                label = "From",
                selectedCurrency = fromCurrency,
                currencies = availableCurrencies,
                onCurrencySelected = onFromCurrencyChanged,
            )

            // Amount input
            OutlinedTextField(
                value = inputAmount,
                onValueChange = onAmountChanged,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "Amount to convert in ${fromCurrency.code}"
                    },
                label = { Text("Amount") },
                placeholder = { Text("0.00") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
            )

            // Swap button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                IconButton(
                    onClick = onSwap,
                    modifier = Modifier.semantics {
                        contentDescription =
                            "Swap currencies: ${fromCurrency.code} and ${toCurrency.code}"
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

            // To currency selector
            CurrencyDropdown(
                label = "To",
                selectedCurrency = toCurrency,
                currencies = availableCurrencies,
                onCurrencySelected = onToCurrencyChanged,
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Result Card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Card displaying the conversion result, exchange rate, and timestamp.
 */
@Composable
private fun ConversionResultCard(
    isConverting: Boolean,
    convertedFormatted: String,
    exchangeRate: Double?,
    fromCurrency: Currency,
    toCurrency: Currency,
    rateTimestamp: kotlinx.datetime.Instant?,
    errorMessage: String?,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = when {
                    errorMessage != null -> "Conversion error: $errorMessage"
                    convertedFormatted.isNotEmpty() -> "Converted amount: $convertedFormatted"
                    else -> "Conversion result will appear here"
                }
            },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Converted Amount",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )

            when {
                isConverting -> {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(24.dp)
                            .semantics {
                                contentDescription = "Calculating conversion"
                            },
                        strokeWidth = 2.dp,
                    )
                }

                errorMessage != null -> {
                    Text(
                        text = errorMessage,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center,
                    )
                }

                convertedFormatted.isNotEmpty() -> {
                    Text(
                        text = convertedFormatted,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }

                else -> {
                    Text(
                        text = "Enter an amount to convert",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.6f),
                    )
                }
            }

            // Exchange rate info
            if (exchangeRate != null) {
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = 4.dp),
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.2f),
                )

                ExchangeRateInfo(
                    rate = exchangeRate,
                    fromCurrency = fromCurrency,
                    toCurrency = toCurrency,
                    timestamp = rateTimestamp,
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency Dropdown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dropdown selector for choosing a currency.
 *
 * @param label Label text shown above the dropdown.
 * @param selectedCurrency Currently selected [Currency].
 * @param currencies List of available currencies.
 * @param onCurrencySelected Called when the user picks a currency.
 */
@Composable
private fun CurrencyDropdown(
    label: String,
    selectedCurrency: Currency,
    currencies: List<CurrencyInfo>,
    onCurrencySelected: (Currency) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
    ) {
        val selectedInfo = currencies.firstOrNull { it.code == selectedCurrency.code }
        val displayText = if (selectedInfo != null) {
            "${selectedInfo.symbol} ${selectedInfo.code} — ${selectedInfo.displayName}"
        } else {
            selectedCurrency.code
        }

        OutlinedTextField(
            value = displayText,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                .semantics {
                    contentDescription = "$label currency: ${selectedCurrency.code}"
                },
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            currencies.forEach { info ->
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = info.symbol,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.width(40.dp),
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Text(
                                    text = info.code,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    text = info.displayName,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    },
                    onClick = {
                        onCurrencySelected(Currency(info.code))
                        expanded = false
                    },
                    modifier = Modifier.semantics {
                        contentDescription = "${info.displayName}, ${info.code}"
                    },
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exchange Rate Info
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Displays the exchange rate and last-updated timestamp.
 *
 * @param rate The numeric exchange rate.
 * @param fromCurrency Source currency.
 * @param toCurrency Target currency.
 * @param timestamp When the rate was last fetched, or null if unknown.
 */
@Composable
internal fun ExchangeRateInfo(
    rate: Double,
    fromCurrency: Currency,
    toCurrency: Currency,
    timestamp: kotlinx.datetime.Instant?,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.semantics {
            contentDescription = "Exchange rate: 1 ${fromCurrency.code} equals " +
                "$rate ${toCurrency.code}"
        },
    ) {
        // Format rate to a reasonable number of decimal places
        val rateFormatted = formatRate(rate)

        Text(
            text = "1 ${fromCurrency.code} = $rateFormatted ${toCurrency.code}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )

        if (timestamp != null) {
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = "Rate as of now",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.6f),
            )
        }
    }
}

/**
 * Format an exchange rate for display, showing enough decimal places
 * to be meaningful without being overwhelming.
 */
private fun formatRate(rate: Double): String {
    return when {
        rate >= 100 -> String.format("%.2f", rate)
        rate >= 1 -> String.format("%.4f", rate)
        else -> String.format("%.6f", rate)
    }
}
