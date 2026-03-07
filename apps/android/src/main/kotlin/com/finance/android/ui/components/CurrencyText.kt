package com.finance.android.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Displays a formatted, colorized currency amount.
 *
 * Uses the same formatting logic as
 * [com.finance.core.currency.CurrencyFormatter] (replicated here to keep
 * the composable self-contained for previews). In production wiring the
 * ViewModel should call [CurrencyFormatter.format] / [CurrencyFormatter.formatCompact]
 * and pass the result as [formattedAmount].
 *
 * Colour semantics:
 * - **Green** for positive (income) amounts.
 * - **Red** for negative (expense) amounts.
 * - **Neutral** (on-surface) for zero.
 *
 * @param amountCents Amount in smallest currency unit (e.g. cents).
 * @param currencyCode ISO-4217 currency code (e.g. "USD").
 * @param compact If true, uses compact notation ("$1.2K").
 * @param showSign If true, prepends "+" for positive amounts.
 * @param style [TextStyle] applied to the text.
 * @param modifier Modifier applied to the [Text] composable.
 * @param formattedAmount Pre-formatted string. When provided the component
 *   skips internal formatting and renders this directly. Use this path in
 *   production to delegate formatting to the KMP CurrencyFormatter.
 * @param incomeColor Color for positive amounts.
 * @param expenseColor Color for negative amounts.
 * @param neutralColor Color for zero amounts.
 */
@Composable
fun CurrencyText(
    amountCents: Long,
    currencyCode: String = "USD",
    compact: Boolean = false,
    showSign: Boolean = false,
    style: TextStyle = MaterialTheme.typography.bodyLarge,
    modifier: Modifier = Modifier,
    formattedAmount: String? = null,
    incomeColor: Color = Color(0xFF4CAF50),
    expenseColor: Color = Color(0xFFE53935),
    neutralColor: Color = MaterialTheme.colorScheme.onSurface,
) {
    val color = when {
        amountCents > 0L -> incomeColor
        amountCents < 0L -> expenseColor
        else -> neutralColor
    }

    val displayText = formattedAmount ?: remember(amountCents, currencyCode, compact, showSign) {
        formatAmountInternal(amountCents, currencyCode, compact, showSign)
    }

    val semanticLabel = when {
        amountCents > 0L -> "Income $displayText"
        amountCents < 0L -> "Expense $displayText"
        else -> "Zero balance $displayText"
    }

    Text(
        text = displayText,
        color = color,
        style = style,
        modifier = modifier.semantics {
            contentDescription = semanticLabel
        },
    )
}

// -- Internal formatting helpers (mirrors CurrencyFormatter logic) ------------

private val currencySymbols = mapOf(
    "USD" to "$", "EUR" to "\u20AC", "GBP" to "\u00A3", "JPY" to "\u00A5",
    "CAD" to "CA$", "AUD" to "A$", "CHF" to "CHF ",
    "CNY" to "\u00A5", "KRW" to "\u20A9", "INR" to "\u20B9",
    "BRL" to "R$", "MXN" to "MX$", "SEK" to "kr",
)

private fun decimalPlacesFor(code: String): Int = when (code) {
    "JPY", "KRW", "VND" -> 0
    "BHD", "KWD", "OMR" -> 3
    else -> 2
}

private fun formatAmountInternal(
    cents: Long,
    currencyCode: String,
    compact: Boolean,
    showSign: Boolean,
): String {
    val symbol = currencySymbols[currencyCode] ?: "$currencyCode "
    val decimals = decimalPlacesFor(currencyCode)
    val isNegative = cents < 0L
    val absCents = if (cents == Long.MIN_VALUE) Long.MAX_VALUE else kotlin.math.abs(cents)

    if (compact) {
        val divisor = currencyPow10(decimals)
        val dollars = absCents.toDouble() / (if (divisor == 0L) 1L else divisor)
        val (value, suffix) = when {
            dollars >= 1_000_000 -> (dollars / 1_000_000) to "M"
            dollars >= 1_000 -> (dollars / 1_000) to "K"
            else -> dollars to ""
        }
        val sign = if (isNegative) "-" else if (showSign && cents > 0) "+" else ""
        val formatted = formatCompactValue(value)
        return "$sign$symbol$formatted$suffix"
    }

    val sign = when {
        showSign && cents > 0L -> "+"
        isNegative -> "-"
        else -> ""
    }

    if (decimals == 0) {
        return "$sign$symbol${formatWithThousandsSep(absCents)}"
    }

    val divisor = currencyPow10(decimals)
    val wholePart = absCents / divisor
    val fractionalPart = absCents % divisor
    val wholeStr = formatWithThousandsSep(wholePart)
    val fracStr = fractionalPart.toString().padStart(decimals, '0')

    return "$sign$symbol$wholeStr.$fracStr"
}

private fun formatCompactValue(value: Double): String {
    val longValue = value.toLong()
    if (value == longValue.toDouble()) return longValue.toString()
    val rounded = kotlin.math.round(value * 10) / 10.0
    val wholePart = rounded.toLong()
    val decimalPart = kotlin.math.round((rounded - wholePart) * 10).toInt()
    return if (decimalPart == 0) wholePart.toString() else "$wholePart.$decimalPart"
}

private fun formatWithThousandsSep(value: Long): String {
    val str = value.toString()
    if (str.length <= 3) return str
    val sb = StringBuilder()
    str.reversed().forEachIndexed { i, c ->
        if (i > 0 && i % 3 == 0) sb.append(',')
        sb.append(c)
    }
    return sb.reverse().toString()
}

private fun currencyPow10(n: Int): Long {
    var result = 1L
    repeat(n) { result *= 10 }
    return result
}

// -- Previews -----------------------------------------------------------------

@Preview(showBackground = true, name = "CurrencyText - income")
@Composable
private fun CurrencyTextIncomePreview() {
    MaterialTheme {
        CurrencyText(
            amountCents = 250000L,
            currencyCode = "USD",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "CurrencyText - expense")
@Composable
private fun CurrencyTextExpensePreview() {
    MaterialTheme {
        CurrencyText(
            amountCents = -89550L,
            currencyCode = "USD",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "CurrencyText - zero")
@Composable
private fun CurrencyTextZeroPreview() {
    MaterialTheme {
        CurrencyText(
            amountCents = 0L,
            currencyCode = "USD",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "CurrencyText - compact mode")
@Composable
private fun CurrencyTextCompactPreview() {
    MaterialTheme {
        Column(modifier = Modifier.padding(16.dp)) {
            CurrencyText(
                amountCents = 120000L,
                currencyCode = "USD",
                compact = true,
                style = MaterialTheme.typography.bodyMedium,
            )
            CurrencyText(
                amountCents = 3_500_000L,
                currencyCode = "USD",
                compact = true,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 4.dp),
            )
            CurrencyText(
                amountCents = 150_000_000L,
                currencyCode = "USD",
                compact = true,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Preview(showBackground = true, name = "CurrencyText - EUR currency")
@Composable
private fun CurrencyTextEurPreview() {
    MaterialTheme {
        CurrencyText(
            amountCents = 199900L,
            currencyCode = "EUR",
            showSign = true,
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "CurrencyText - JPY no decimals")
@Composable
private fun CurrencyTextJpyPreview() {
    MaterialTheme {
        CurrencyText(
            amountCents = 150000L,
            currencyCode = "JPY",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "CurrencyText - with sign")
@Composable
private fun CurrencyTextWithSignPreview() {
    MaterialTheme {
        Column(modifier = Modifier.padding(16.dp)) {
            CurrencyText(
                amountCents = 50000L,
                currencyCode = "USD",
                showSign = true,
                style = MaterialTheme.typography.bodyLarge,
            )
            CurrencyText(
                amountCents = -30000L,
                currencyCode = "USD",
                showSign = true,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
