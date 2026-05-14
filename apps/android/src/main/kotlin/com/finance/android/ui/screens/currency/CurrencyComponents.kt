// SPDX-License-Identifier: BUSL-1.1

@file:OptIn(ExperimentalMaterial3Api::class)

package com.finance.android.ui.screens.currency

import java.util.Locale
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CurrencyExchange
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.core.currency.CurrencyFormatter
import com.finance.core.multicurrency.CurrencyInfo
import com.finance.core.multicurrency.MultiCurrencyEngine
import com.finance.models.types.Cents
import com.finance.models.types.Currency

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Currency Selector
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Currency selector for the transaction creation/editing form.
 *
 * Displays a dropdown with available currencies and, when a foreign currency
 * is selected, shows the converted amount in the user's home currency along
 * with the exchange rate used.
 *
 * @param selectedCurrency The currently selected transaction currency.
 * @param homeCurrency The user's default (home) currency.
 * @param amount The transaction amount in [Cents] (in the selected currency).
 * @param exchangeRate The exchange rate from [selectedCurrency] to [homeCurrency], if available.
 * @param onCurrencyChanged Called when the user selects a different currency.
 */
@Composable
fun TransactionCurrencySelector(
    selectedCurrency: Currency,
    homeCurrency: Currency,
    amount: Cents,
    exchangeRate: Double?,
    onCurrencyChanged: (Currency) -> Unit,
) {
    val currencies = remember {
        MultiCurrencyEngine.currencyCatalog.values.sortedBy { it.code }
    }
    var expanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Currency dropdown
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it },
        ) {
            val selectedInfo = MultiCurrencyEngine.currencyInfo(selectedCurrency)
            val displayText = if (selectedInfo != null) {
                "${selectedInfo.symbol} ${selectedInfo.code}"
            } else {
                selectedCurrency.code
            }

            OutlinedTextField(
                value = displayText,
                onValueChange = {},
                readOnly = true,
                label = { Text("Currency") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                modifier = Modifier
                    .fillMaxWidth()
                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    .semantics {
                        contentDescription = "Transaction currency: ${selectedCurrency.code}"
                    },
            )

            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
            ) {
                currencies.forEach { info ->
                    DropdownMenuItem(
                        text = {
                            Text("${info.symbol} ${info.code} — ${info.displayName}")
                        },
                        onClick = {
                            onCurrencyChanged(Currency(info.code))
                            expanded = false
                        },
                        modifier = Modifier.semantics {
                            contentDescription = "${info.displayName}, ${info.code}"
                        },
                    )
                }
            }
        }

        // Foreign currency conversion display
        if (selectedCurrency != homeCurrency && !amount.isZero()) {
            ForeignCurrencyConversionCard(
                amount = amount,
                fromCurrency = selectedCurrency,
                toCurrency = homeCurrency,
                exchangeRate = exchangeRate,
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Foreign Currency Conversion Card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inline card showing the converted amount in the home currency.
 *
 * Displayed below the currency selector when a foreign currency is chosen
 * and a non-zero amount is entered.
 *
 * @param amount The original amount in the foreign currency.
 * @param fromCurrency The foreign (source) currency.
 * @param toCurrency The home (target) currency.
 * @param exchangeRate The rate used for conversion, or null if unavailable.
 */
@Composable
private fun ForeignCurrencyConversionCard(
    amount: Cents,
    fromCurrency: Currency,
    toCurrency: Currency,
    exchangeRate: Double?,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                val description = if (exchangeRate != null) {
                    val converted = MultiCurrencyEngine.convert(amount, exchangeRate)
                    val formatted = CurrencyFormatter.format(converted, toCurrency)
                    "Converted amount: $formatted in ${toCurrency.code}"
                } else {
                    "Exchange rate unavailable for ${fromCurrency.code} to ${toCurrency.code}"
                }
                contentDescription = description
            },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.CurrencyExchange,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSecondaryContainer,
            )

            Spacer(modifier = Modifier.width(8.dp))

            if (exchangeRate != null) {
                val converted = MultiCurrencyEngine.convert(amount, exchangeRate)
                val formattedConverted = CurrencyFormatter.format(converted, toCurrency)

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "≈ $formattedConverted",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                    )
                    Text(
                        text = "1 ${fromCurrency.code} = ${formatExchangeRate(exchangeRate)} ${toCurrency.code}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f),
                    )
                }
            } else {
                Text(
                    text = "Exchange rate unavailable",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Balance Multi-Currency Display
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Displays an account balance in its native currency with an optional
 * home-currency equivalent shown below.
 *
 * Used on account cards and the dashboard to show multi-currency context.
 *
 * @param balance The account balance in [Cents].
 * @param nativeCurrency The account's native currency.
 * @param homeCurrency The user's home currency.
 * @param exchangeRate The exchange rate from native to home, or null if same currency.
 * @param modifier Modifier for layout customization.
 */
@Composable
fun AccountBalanceMultiCurrency(
    balance: Cents,
    nativeCurrency: Currency,
    homeCurrency: Currency,
    exchangeRate: Double?,
    modifier: Modifier = Modifier,
) {
    val formattedNative = CurrencyFormatter.format(balance, nativeCurrency)

    Column(
        modifier = modifier.semantics {
            val desc = buildString {
                append("Balance: $formattedNative")
                if (nativeCurrency != homeCurrency && exchangeRate != null) {
                    val converted = MultiCurrencyEngine.convert(balance, exchangeRate)
                    val formattedHome = CurrencyFormatter.format(converted, homeCurrency)
                    append(", equivalent to $formattedHome")
                }
            }
            contentDescription = desc
        },
        horizontalAlignment = Alignment.End,
    ) {
        // Primary balance in native currency
        Text(
            text = formattedNative,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )

        // Secondary balance in home currency (if different)
        if (nativeCurrency != homeCurrency && exchangeRate != null) {
            val converted = MultiCurrencyEngine.convert(balance, exchangeRate)
            val formattedHome = CurrencyFormatter.format(converted, homeCurrency)

            Text(
                text = "≈ $formattedHome",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format an exchange rate for compact display.
 */
private fun formatExchangeRate(rate: Double): String {
    return when {
        rate >= 100 -> String.format(java.util.Locale.ROOT, "%.2f", rate)
        rate >= 1 -> String.format(java.util.Locale.ROOT, "%.4f", rate)
        else -> String.format(java.util.Locale.ROOT, "%.6f", rate)
    }
}
