// SPDX-License-Identifier: BUSL-1.1

// Multiple public declarations: CurrencyAmountVisualTransformation class + AmountTextField composable
@file:Suppress("MatchingDeclarationName")

package com.finance.desktop.components

import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation

/**
 * Venmo-style amount formatting [VisualTransformation].
 *
 * Accepts only digit characters in the raw text field value.
 * Formats the display as a currency string with the last two digits
 * always representing cents.
 *
 * Examples:
 * - Raw "" → Display "$0.00"
 * - Raw "1" → Display "$0.01"
 * - Raw "12" → Display "$0.12"
 * - Raw "123" → Display "$1.23"
 * - Raw "12345" → Display "$123.45"
 *
 * @param currencySymbol The currency symbol prefix to display. Defaults to "$".
 */
class CurrencyAmountVisualTransformation(
    private val currencySymbol: String = "$",
) : VisualTransformation {

    override fun filter(text: AnnotatedString): TransformedText {
        val digits = text.text.filter { it.isDigit() }
        val formatted = formatCents(digits)

        val offsetMapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int {
                // Map original cursor position to transformed position
                return formatted.length
            }

            override fun transformedToOriginal(offset: Int): Int {
                // Map transformed cursor position back to original
                return digits.length
            }
        }

        return TransformedText(AnnotatedString(formatted), offsetMapping)
    }

    /**
     * Format a string of digits as a currency value.
     * The last two digits are always cents.
     */
    private fun formatCents(digits: String): String {
        if (digits.isEmpty()) return "${currencySymbol}0.00"

        val totalCents = digits.toLongOrNull() ?: 0L
        val dollars = totalCents / 100
        val cents = totalCents % 100
        return "$currencySymbol${"%,d".format(dollars)}.${"%02d".format(cents)}"
    }
}

/**
 * A text field that accepts digit input and displays a formatted currency amount.
 *
 * Uses Venmo-style "cents-first" formatting: typing "1" shows "$0.01",
 * typing "123" shows "$1.23". Backspace removes the last digit.
 *
 * The [rawDigits] value should contain only digit characters. The
 * [onRawDigitsChange] callback receives the filtered digits string.
 *
 * @param rawDigits The current raw digits value (no formatting, no symbol).
 * @param onRawDigitsChange Callback with the new digits-only string.
 * @param modifier Modifier for the text field.
 * @param label Optional label composable.
 * @param currencySymbol Currency symbol for display. Defaults to "$".
 * @param isError Whether the field is in error state.
 * @param enabled Whether the field is enabled for input.
 */
@Composable
fun AmountTextField(
    rawDigits: String,
    onRawDigitsChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: @Composable (() -> Unit)? = { Text("Amount") },
    currencySymbol: String = "$",
    isError: Boolean = false,
    enabled: Boolean = true,
) {
    OutlinedTextField(
        value = rawDigits,
        onValueChange = { newValue ->
            // Only keep digit characters; limit to reasonable length
            val filtered = newValue.filter { it.isDigit() }.take(12)
            onRawDigitsChange(filtered)
        },
        modifier = modifier.semantics {
            contentDescription = "Amount field. " +
                "Type digits to enter amount. Currently ${formatForAccessibility(rawDigits, currencySymbol)}"
        },
        label = label,
        visualTransformation = CurrencyAmountVisualTransformation(currencySymbol),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        singleLine = true,
        isError = isError,
        enabled = enabled,
    )
}

/**
 * Formats the raw digits into an accessible spoken amount.
 */
private fun formatForAccessibility(digits: String, symbol: String): String {
    if (digits.isEmpty()) return "$symbol 0 dollars and 0 cents"
    val totalCents = digits.toLongOrNull() ?: 0L
    val dollars = totalCents / 100
    val cents = totalCents % 100
    return "$dollars dollars and $cents cents"
}
