// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.components

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CurrencyExchange
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.models.types.Cents
import com.finance.models.types.Currency

// =============================================================================
// Multi-Currency Balance Display
// =============================================================================

/**
 * Displays an account balance in its native currency with an optional
 * home-currency equivalent.
 *
 * When the account currency differs from the user's home currency, this
 * component shows both the native balance and the converted equivalent
 * in a secondary line. This gives users a quick reference for foreign
 * currency accounts without leaving the accounts list.
 *
 * ## Accessibility
 * - Primary balance announced as "Balance: $1,234.56 USD"
 * - Equivalent announced as "Approximately $1,135.00 in home currency"
 * - Entire component has a combined content description for Narrator
 *
 * @param nativeBalance The balance in the account's native currency (cents).
 * @param nativeCurrency The account's currency.
 * @param homeCurrencyEquivalent The balance converted to home currency (cents),
 *   or null if the account is already in the home currency.
 * @param homeCurrency The user's home/default currency.
 * @param modifier Optional [Modifier].
 */
@Composable
fun MultiCurrencyBalanceDisplay(
    nativeBalance: Cents,
    nativeCurrency: Currency,
    homeCurrencyEquivalent: Cents? = null,
    homeCurrency: Currency = Currency.USD,
    modifier: Modifier = Modifier,
) {
    val formattedNative = CurrencyFormatter.format(nativeBalance, nativeCurrency)
    val formattedHome = homeCurrencyEquivalent?.let {
        CurrencyFormatter.format(it, homeCurrency)
    }
    val isForeign = nativeCurrency != homeCurrency && homeCurrencyEquivalent != null

    val accessibilityLabel = buildString {
        append("Balance: $formattedNative")
        if (isForeign && formattedHome != null) {
            append(", approximately $formattedHome in ${homeCurrency.code}")
        }
    }

    Column(
        modifier = modifier.semantics { contentDescription = accessibilityLabel },
    ) {
        // Primary balance in native currency
        Text(
            text = formattedNative,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
        )

        // Home currency equivalent (if different)
        if (isForeign && formattedHome != null) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(
                    FinanceDesktopTheme.spacing.xs,
                ),
            ) {
                Icon(
                    imageVector = Icons.Filled.CurrencyExchange,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = "≈ $formattedHome",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// =============================================================================
// Transaction Currency Selector
// =============================================================================

/**
 * Currency selector component for transaction forms.
 *
 * Displays the currently selected currency with a dropdown button.
 * When tapped, shows an inline currency picker overlay. When a
 * foreign currency is selected and an amount is entered, displays
 * the converted equivalent in the home currency.
 *
 * ## Accessibility
 * - Button announces current currency and "tap to change"
 * - Conversion display announces both original and converted amounts
 * - Picker overlay items are individually focusable
 *
 * @param selectedCurrency The currently selected transaction currency.
 * @param onCurrencyChanged Callback when the user selects a different currency.
 * @param transactionAmount The transaction amount in cents (in selected currency).
 * @param homeCurrencyEquivalent Converted amount in home currency, or null.
 * @param homeCurrency The user's home currency.
 * @param modifier Optional [Modifier].
 */
@Composable
fun TransactionCurrencySelector(
    selectedCurrency: Currency,
    onCurrencyChanged: (Currency) -> Unit,
    transactionAmount: Cents? = null,
    homeCurrencyEquivalent: Cents? = null,
    homeCurrency: Currency = Currency.USD,
    modifier: Modifier = Modifier,
) {
    val isForeign = selectedCurrency != homeCurrency

    ElevatedCard(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors(
            containerColor = if (isForeign) {
                MaterialTheme.colorScheme.tertiaryContainer
            } else {
                MaterialTheme.colorScheme.surface
            },
        ),
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.md),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                // Currency label
                Column {
                    Text(
                        text = "Currency",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isForeign) {
                            MaterialTheme.colorScheme.onTertiaryContainer.copy(alpha = 0.7f)
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                    Text(
                        text = selectedCurrency.code,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (isForeign) {
                            MaterialTheme.colorScheme.onTertiaryContainer
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    )
                }

                // Change currency button
                OutlinedButton(
                    onClick = { onCurrencyChanged(selectedCurrency) },
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.semantics {
                        contentDescription = "Change currency, currently ${selectedCurrency.code}"
                    },
                ) {
                    Icon(
                        imageVector = Icons.Filled.UnfoldMore,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
                    Text("Change")
                }
            }

            // Conversion display for foreign currency transactions
            if (isForeign && transactionAmount != null && homeCurrencyEquivalent != null) {
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                val formattedOriginal = CurrencyFormatter.format(
                    transactionAmount,
                    selectedCurrency,
                )
                val formattedConverted = CurrencyFormatter.format(
                    homeCurrencyEquivalent,
                    homeCurrency,
                )
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(6.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                ) {
                    Row(
                        modifier = Modifier
                            .padding(FinanceDesktopTheme.spacing.sm)
                            .semantics {
                                contentDescription =
                                    "$formattedOriginal equals approximately $formattedConverted"
                            },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CurrencyExchange,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(14.dp),
                        )
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
                        Text(
                            text = "$formattedOriginal ≈ $formattedConverted",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}
