package com.finance.android.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Currency-formatted amount input that stores the value internally as [Long] cents.
 *
 * As the user types digits the display is live-formatted with the currency symbol
 * and thousands separators (e.g. "$1,234.56"). Only decimal-number keyboard input
 * is accepted.
 *
 * @param amountCents Current amount in cents (e.g. 123456 -> "$1,234.56").
 * @param onAmountChange Callback with the new cents value after each keystroke.
 * @param currencySymbol Symbol to prepend (defaults to "$").
 * @param decimalPlaces Number of fractional digits (defaults to 2).
 * @param isError Whether the field should display an error state.
 * @param errorMessage Optional message shown below the field when [isError] is true.
 * @param label Optional label displayed above the field.
 * @param modifier Modifier applied to the outer container.
 */
@Composable
fun AmountInput(
    amountCents: Long,
    onAmountChange: (Long) -> Unit,
    currencySymbol: String = "$",
    decimalPlaces: Int = 2,
    isError: Boolean = false,
    errorMessage: String? = null,
    label: String? = null,
    modifier: Modifier = Modifier,
) {
    val formattedText = remember(amountCents, currencySymbol, decimalPlaces) {
        formatCentsForDisplay(amountCents, currencySymbol, decimalPlaces)
    }

    var textFieldValue by remember(formattedText) {
        mutableStateOf(
            TextFieldValue(
                text = formattedText,
                selection = TextRange(formattedText.length),
            ),
        )
    }

    val semanticDescription = buildString {
        append("Amount input")
        if (label != null) append(", $label")
        append(", current value $formattedText")
    }

    Column(modifier = modifier) {
        OutlinedTextField(
            value = textFieldValue,
            onValueChange = { newValue ->
                val digits = newValue.text.filter { it.isDigit() }
                val newCents = digits.toLongOrNull() ?: 0L
                onAmountChange(newCents)
                val newFormatted = formatCentsForDisplay(newCents, currencySymbol, decimalPlaces)
                textFieldValue = TextFieldValue(
                    text = newFormatted,
                    selection = TextRange(newFormatted.length),
                )
            },
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = semanticDescription
                    if (isError && errorMessage != null) {
                        error(errorMessage)
                    }
                },
            label = label?.let { { Text(it) } },
            isError = isError,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                errorBorderColor = MaterialTheme.colorScheme.error,
                errorLabelColor = MaterialTheme.colorScheme.error,
            ),
        )

        if (isError && errorMessage != null) {
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier
                    .padding(start = 16.dp, top = 4.dp)
                    .semantics { contentDescription = "Error: $errorMessage" },
            )
        }
    }
}

/**
 * Formats a cents value for display with currency symbol and thousands separators.
 *
 * Examples (decimalPlaces=2):
 * - 0 -> "$0.00"
 * - 123456 -> "$1,234.56"
 * - 5 -> "$0.05"
 */
internal fun formatCentsForDisplay(
    cents: Long,
    currencySymbol: String,
    decimalPlaces: Int,
): String {
    if (decimalPlaces == 0) {
        return "$currencySymbol${formatWithThousands(cents)}"
    }

    val divisor = pow10(decimalPlaces)
    val wholePart = cents / divisor
    val fractionalPart = cents % divisor

    val wholeFormatted = formatWithThousands(wholePart)
    val fractionFormatted = fractionalPart.toString().padStart(decimalPlaces, '0')

    return "$currencySymbol$wholeFormatted.$fractionFormatted"
}

private fun formatWithThousands(value: Long): String {
    val str = value.toString()
    if (str.length <= 3) return str

    val result = StringBuilder()
    str.reversed().forEachIndexed { index, c ->
        if (index > 0 && index % 3 == 0) result.append(',')
        result.append(c)
    }
    return result.reverse().toString()
}

private fun pow10(n: Int): Long {
    var result = 1L
    repeat(n) { result *= 10 }
    return result
}

// -- Previews -----------------------------------------------------------------

@Preview(showBackground = true, name = "AmountInput - zero")
@Composable
private fun AmountInputZeroPreview() {
    MaterialTheme {
        AmountInput(
            amountCents = 0L,
            onAmountChange = {},
            label = "Amount",
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "AmountInput - 1234.56")
@Composable
private fun AmountInputFormattedPreview() {
    MaterialTheme {
        AmountInput(
            amountCents = 123456L,
            onAmountChange = {},
            label = "Amount",
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "AmountInput - small amount")
@Composable
private fun AmountInputSmallPreview() {
    MaterialTheme {
        AmountInput(
            amountCents = 5L,
            onAmountChange = {},
            currencySymbol = "\u20AC",
            label = "Total",
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "AmountInput - error state")
@Composable
private fun AmountInputErrorPreview() {
    MaterialTheme {
        AmountInput(
            amountCents = 0L,
            onAmountChange = {},
            label = "Amount",
            isError = true,
            errorMessage = "Amount is required",
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "AmountInput - JPY no decimals")
@Composable
private fun AmountInputJpyPreview() {
    MaterialTheme {
        AmountInput(
            amountCents = 150000L,
            onAmountChange = {},
            currencySymbol = "\u00A5",
            decimalPlaces = 0,
            label = "Amount (JPY)",
            modifier = Modifier.padding(16.dp),
        )
    }
}
