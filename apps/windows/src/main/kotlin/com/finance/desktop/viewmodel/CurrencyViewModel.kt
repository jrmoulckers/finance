// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.core.currency.ConversionResult
import com.finance.core.currency.CurrencyConverter
import com.finance.core.currency.CurrencyFormatter
import com.finance.core.currency.ExchangeRate
import com.finance.core.currency.ExchangeRateProvider
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// =============================================================================
// Currency UI State
// =============================================================================

/**
 * Metadata for a currency displayed in the picker UI.
 *
 * @property currency The ISO 4217 currency value class.
 * @property name Human-readable name (e.g. "US Dollar").
 * @property symbol Display symbol (e.g. "$").
 * @property flagEmoji Flag emoji for the primary country of issue.
 */
data class CurrencyDisplayInfo(
    val currency: Currency,
    val name: String,
    val symbol: String,
    val flagEmoji: String,
)

/**
 * UI state for the currency picker screen.
 */
data class CurrencyPickerUiState(
    val isLoading: Boolean = true,
    val allCurrencies: List<CurrencyDisplayInfo> = emptyList(),
    val filteredCurrencies: List<CurrencyDisplayInfo> = emptyList(),
    val searchQuery: String = "",
    val selectedCurrency: Currency? = null,
    val error: String? = null,
)

/**
 * UI state for the currency conversion screen.
 */
data class CurrencyConversionUiState(
    val isLoading: Boolean = false,
    val fromCurrency: Currency = Currency.USD,
    val toCurrency: Currency = Currency.EUR,
    val inputAmount: String = "100.00",
    val conversionResult: ConversionResult? = null,
    val formattedFrom: String = "",
    val formattedTo: String = "",
    val rateDisplay: String = "",
    val error: String? = null,
    val showFromPicker: Boolean = false,
    val showToPicker: Boolean = false,
    val availableCurrencies: List<CurrencyDisplayInfo> = emptyList(),
)

// =============================================================================
// CurrencyViewModel
// =============================================================================

/**
 * ViewModel that manages currency picker and conversion state.
 *
 * Consumes the KMP shared [ExchangeRateProvider] and [CurrencyConverter]
 * via Koin constructor injection, exposing [StateFlow]-based UI states
 * for Compose Desktop screens.
 *
 * ## Responsibilities
 * - Load available currencies from the KMP exchange-rate provider
 * - Provide filtered/searchable currency list for the picker
 * - Perform real-time currency conversions
 * - Format amounts and rates for display using [CurrencyFormatter]
 *
 * @param rateProvider KMP shared exchange rate provider.
 * @param converter KMP shared currency converter.
 */
class CurrencyViewModel(
    private val rateProvider: ExchangeRateProvider,
    private val converter: CurrencyConverter,
) : DesktopViewModel() {

    private val _pickerState = MutableStateFlow(CurrencyPickerUiState())

    /** Observable state for the currency picker screen. */
    val pickerState: StateFlow<CurrencyPickerUiState> = _pickerState.asStateFlow()

    private val _conversionState = MutableStateFlow(CurrencyConversionUiState())

    /** Observable state for the currency conversion screen. */
    val conversionState: StateFlow<CurrencyConversionUiState> = _conversionState.asStateFlow()

    init {
        loadCurrencies()
    }

    // ── Picker operations ──────────────────────────────────────────────────

    /**
     * Update the search query and filter the currency list accordingly.
     *
     * Filtering matches against currency code, name, and symbol
     * (case-insensitive).
     */
    fun updateSearchQuery(query: String) {
        val all = _pickerState.value.allCurrencies
        val filtered = if (query.isBlank()) {
            all
        } else {
            val lower = query.lowercase()
            all.filter { info ->
                info.currency.code.lowercase().contains(lower) ||
                    info.name.lowercase().contains(lower) ||
                    info.symbol.lowercase().contains(lower)
            }
        }
        _pickerState.value = _pickerState.value.copy(
            searchQuery = query,
            filteredCurrencies = filtered,
        )
    }

    /**
     * Select a currency from the picker.
     */
    fun selectCurrency(currency: Currency) {
        _pickerState.value = _pickerState.value.copy(selectedCurrency = currency)
    }

    // ── Conversion operations ──────────────────────────────────────────────

    /**
     * Set the source currency for conversion.
     */
    fun setFromCurrency(currency: Currency) {
        _conversionState.value = _conversionState.value.copy(
            fromCurrency = currency,
            showFromPicker = false,
        )
        performConversion()
    }

    /**
     * Set the target currency for conversion.
     */
    fun setToCurrency(currency: Currency) {
        _conversionState.value = _conversionState.value.copy(
            toCurrency = currency,
            showToPicker = false,
        )
        performConversion()
    }

    /**
     * Update the input amount string and trigger conversion.
     */
    fun updateInputAmount(amount: String) {
        _conversionState.value = _conversionState.value.copy(inputAmount = amount)
        performConversion()
    }

    /**
     * Swap the source and target currencies.
     */
    fun swapCurrencies() {
        val current = _conversionState.value
        _conversionState.value = current.copy(
            fromCurrency = current.toCurrency,
            toCurrency = current.fromCurrency,
        )
        performConversion()
    }

    /**
     * Toggle visibility of the source currency picker overlay.
     */
    fun toggleFromPicker() {
        _conversionState.value = _conversionState.value.copy(
            showFromPicker = !_conversionState.value.showFromPicker,
            showToPicker = false,
        )
    }

    /**
     * Toggle visibility of the target currency picker overlay.
     */
    fun toggleToPicker() {
        _conversionState.value = _conversionState.value.copy(
            showToPicker = !_conversionState.value.showToPicker,
            showFromPicker = false,
        )
    }

    // ── Internal ───────────────────────────────────────────────────────────

    private fun loadCurrencies() {
        viewModelScope.launch {
            try {
                val available = rateProvider.getAvailableCurrencies()
                val displayList = available.map { currency ->
                    CurrencyDisplayInfo(
                        currency = currency,
                        name = currencyNames[currency.code] ?: currency.code,
                        symbol = currencySymbols[currency.code] ?: currency.code,
                        flagEmoji = currencyFlags[currency.code] ?: "🏳️",
                    )
                }.sortedBy { it.name }

                _pickerState.value = CurrencyPickerUiState(
                    isLoading = false,
                    allCurrencies = displayList,
                    filteredCurrencies = displayList,
                )
                _conversionState.value = _conversionState.value.copy(
                    availableCurrencies = displayList,
                )
                // Run initial conversion
                performConversion()
            } catch (e: Exception) {
                _pickerState.value = _pickerState.value.copy(
                    isLoading = false,
                    error = "Failed to load currencies: ${e.message}",
                )
            }
        }
    }

    private fun performConversion() {
        val state = _conversionState.value
        val amountDouble = state.inputAmount.toDoubleOrNull() ?: return

        if (state.fromCurrency == state.toCurrency) {
            val cents = Cents((amountDouble * 100).toLong())
            _conversionState.value = state.copy(
                isLoading = false,
                conversionResult = ConversionResult(cents, cents, null),
                formattedFrom = CurrencyFormatter.format(cents, state.fromCurrency),
                formattedTo = CurrencyFormatter.format(cents, state.toCurrency),
                rateDisplay = "1 ${state.fromCurrency.code} = 1 ${state.toCurrency.code}",
                error = null,
            )
            return
        }

        viewModelScope.launch {
            _conversionState.value = state.copy(isLoading = true, error = null)
            try {
                val decimals = state.fromCurrency.decimalPlaces
                val divisor = pow10(decimals)
                val cents = Cents((amountDouble * divisor).toLong())
                val result = converter.convert(cents, state.fromCurrency, state.toCurrency)

                val rateStr = result.rateUsed?.let { rate ->
                    "1 ${rate.from.code} = ${formatRate(rate.rate)} ${rate.to.code}"
                } ?: ""

                _conversionState.value = _conversionState.value.copy(
                    isLoading = false,
                    conversionResult = result,
                    formattedFrom = CurrencyFormatter.format(
                        result.originalAmount,
                        state.fromCurrency,
                    ),
                    formattedTo = CurrencyFormatter.format(
                        result.convertedAmount,
                        state.toCurrency,
                    ),
                    rateDisplay = rateStr,
                    error = null,
                )
            } catch (e: Exception) {
                _conversionState.value = _conversionState.value.copy(
                    isLoading = false,
                    error = "Conversion failed: ${e.message}",
                )
            }
        }
    }

    private fun pow10(n: Int): Long {
        var result = 1L
        repeat(n) { result *= 10 }
        return result
    }

    private fun formatRate(rate: Double): String {
        val rounded = kotlin.math.round(rate * 10000) / 10000.0
        return rounded.toString()
    }

    companion object {
        /** Human-readable currency names keyed by ISO 4217 code. */
        val currencyNames = mapOf(
            "USD" to "US Dollar",
            "EUR" to "Euro",
            "GBP" to "British Pound",
            "JPY" to "Japanese Yen",
            "CAD" to "Canadian Dollar",
            "AUD" to "Australian Dollar",
            "CHF" to "Swiss Franc",
            "CNY" to "Chinese Yuan",
            "KRW" to "South Korean Won",
            "INR" to "Indian Rupee",
            "BRL" to "Brazilian Real",
            "MXN" to "Mexican Peso",
            "SEK" to "Swedish Krona",
            "NOK" to "Norwegian Krone",
            "DKK" to "Danish Krone",
            "NZD" to "New Zealand Dollar",
            "SGD" to "Singapore Dollar",
            "HKD" to "Hong Kong Dollar",
            "TRY" to "Turkish Lira",
            "ZAR" to "South African Rand",
            "PLN" to "Polish Zloty",
            "THB" to "Thai Baht",
            "IDR" to "Indonesian Rupiah",
            "PHP" to "Philippine Peso",
            "CZK" to "Czech Koruna",
            "ILS" to "Israeli Shekel",
            "CLP" to "Chilean Peso",
            "ARS" to "Argentine Peso",
            "COP" to "Colombian Peso",
            "SAR" to "Saudi Riyal",
            "AED" to "UAE Dirham",
        )

        /** Display symbols keyed by ISO 4217 code. */
        val currencySymbols = mapOf(
            "USD" to "$", "EUR" to "€", "GBP" to "£", "JPY" to "¥",
            "CAD" to "CA$", "AUD" to "A$", "CHF" to "CHF",
            "CNY" to "¥", "KRW" to "₩", "INR" to "₹",
            "BRL" to "R$", "MXN" to "MX$", "SEK" to "kr",
            "NOK" to "kr", "DKK" to "kr", "NZD" to "NZ$",
            "SGD" to "S$", "HKD" to "HK$", "TRY" to "₺",
            "ZAR" to "R", "PLN" to "zł", "THB" to "฿",
            "IDR" to "Rp", "PHP" to "₱", "CZK" to "Kč",
            "ILS" to "₪", "CLP" to "CL$", "ARS" to "AR$",
            "COP" to "CO$", "SAR" to "﷼", "AED" to "د.إ",
        )

        /** Flag emoji keyed by ISO 4217 code. */
        val currencyFlags = mapOf(
            "USD" to "🇺🇸", "EUR" to "🇪🇺", "GBP" to "🇬🇧", "JPY" to "🇯🇵",
            "CAD" to "🇨🇦", "AUD" to "🇦🇺", "CHF" to "🇨🇭",
            "CNY" to "🇨🇳", "KRW" to "🇰🇷", "INR" to "🇮🇳",
            "BRL" to "🇧🇷", "MXN" to "🇲🇽", "SEK" to "🇸🇪",
            "NOK" to "🇳🇴", "DKK" to "🇩🇰", "NZD" to "🇳🇿",
            "SGD" to "🇸🇬", "HKD" to "🇭🇰", "TRY" to "🇹🇷",
            "ZAR" to "🇿🇦", "PLN" to "🇵🇱", "THB" to "🇹🇭",
            "IDR" to "🇮🇩", "PHP" to "🇵🇭", "CZK" to "🇨🇿",
            "ILS" to "🇮🇱", "CLP" to "🇨🇱", "ARS" to "🇦🇷",
            "COP" to "🇨🇴", "SAR" to "🇸🇦", "AED" to "🇦🇪",
        )
    }
}
