// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.currency

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.core.currency.CurrencyFormatter
import com.finance.core.multicurrency.CurrencyInfo
import com.finance.core.multicurrency.MultiCurrencyEngine
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import timber.log.Timber

// ─────────────────────────────────────────────────────────────────────────────
// UI State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UI state for the currency picker screen.
 *
 * @property currencies All available currencies from the ISO 4217 catalog.
 * @property filteredCurrencies Currencies matching the current search query.
 * @property searchQuery Current search text entered by the user.
 * @property selectedCurrency The currently selected currency, if any.
 * @property isLoading Whether the currency list is being loaded.
 */
data class CurrencyPickerUiState(
    val currencies: List<CurrencyInfo> = emptyList(),
    val filteredCurrencies: List<CurrencyInfo> = emptyList(),
    val searchQuery: String = "",
    val selectedCurrency: Currency? = null,
    val isLoading: Boolean = true,
)

/**
 * UI state for the currency conversion screen.
 *
 * @property fromCurrency Source currency for conversion.
 * @property toCurrency Target currency for conversion.
 * @property inputAmount User-entered amount as a string (for text field binding).
 * @property inputCents Parsed input amount in [Cents].
 * @property convertedCents Converted amount in [Cents], or null if not yet computed.
 * @property convertedFormatted Formatted converted amount string for display.
 * @property exchangeRate The exchange rate used, or null if unavailable.
 * @property rateTimestamp When the exchange rate was last updated.
 * @property isConverting Whether a conversion is in progress.
 * @property errorMessage User-facing error message, if any.
 * @property availableCurrencies All currencies available for selection.
 */
data class CurrencyConversionUiState(
    val fromCurrency: Currency = Currency.USD,
    val toCurrency: Currency = Currency.EUR,
    val inputAmount: String = "",
    val inputCents: Cents = Cents.ZERO,
    val convertedCents: Cents? = null,
    val convertedFormatted: String = "",
    val exchangeRate: Double? = null,
    val rateTimestamp: Instant? = null,
    val isConverting: Boolean = false,
    val errorMessage: String? = null,
    val availableCurrencies: List<CurrencyInfo> = emptyList(),
)

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ViewModel managing multi-currency state for picker and conversion screens.
 *
 * Consumes the KMP [MultiCurrencyEngine] for the ISO 4217 catalog, exchange
 * rate caching, and conversion arithmetic. All monetary values use [Cents]
 * to avoid floating-point precision issues.
 *
 * @see MultiCurrencyEngine
 * @see CurrencyFormatter
 */
class CurrencyViewModel : ViewModel() {

    private val rateCache = MultiCurrencyEngine.ExchangeRateCache()

    // ── Picker state ────────────────────────────────────────────────────

    private val _pickerState = MutableStateFlow(CurrencyPickerUiState())

    /** Observable picker UI state. */
    val pickerState: StateFlow<CurrencyPickerUiState> = _pickerState.asStateFlow()

    // ── Conversion state ────────────────────────────────────────────────

    private val _conversionState = MutableStateFlow(CurrencyConversionUiState())

    /** Observable conversion UI state. */
    val conversionState: StateFlow<CurrencyConversionUiState> = _conversionState.asStateFlow()

    init {
        loadCurrencies()
        seedDemoRates()
    }

    // ── Picker actions ──────────────────────────────────────────────────

    /**
     * Load the full ISO 4217 currency catalog from [MultiCurrencyEngine].
     */
    private fun loadCurrencies() {
        viewModelScope.launch {
            val allCurrencies = MultiCurrencyEngine.currencyCatalog.values
                .sortedBy { it.code }
            _pickerState.update {
                it.copy(
                    currencies = allCurrencies,
                    filteredCurrencies = allCurrencies,
                    isLoading = false,
                )
            }
            _conversionState.update {
                it.copy(availableCurrencies = allCurrencies)
            }
            Timber.d("Loaded %d currencies from catalog", allCurrencies.size)
        }
    }

    /**
     * Update the search query and filter currencies by code or name.
     *
     * @param query The search text to filter against currency codes and names.
     */
    fun onSearchQueryChanged(query: String) {
        _pickerState.update { state ->
            val filtered = if (query.isBlank()) {
                state.currencies
            } else {
                val lower = query.lowercase()
                state.currencies.filter { info ->
                    info.code.lowercase().contains(lower) ||
                        info.displayName.lowercase().contains(lower)
                }
            }
            state.copy(searchQuery = query, filteredCurrencies = filtered)
        }
    }

    /**
     * Select a currency from the picker.
     *
     * @param currency The [Currency] the user selected.
     */
    fun selectCurrency(currency: Currency) {
        _pickerState.update { it.copy(selectedCurrency = currency) }
        Timber.d("Currency selected: %s", currency.code)
    }

    // ── Conversion actions ──────────────────────────────────────────────

    /**
     * Set the source ("from") currency for conversion.
     *
     * @param currency The source currency code.
     */
    fun setFromCurrency(currency: Currency) {
        _conversionState.update { it.copy(fromCurrency = currency, errorMessage = null) }
        performConversion()
    }

    /**
     * Set the target ("to") currency for conversion.
     *
     * @param currency The target currency code.
     */
    fun setToCurrency(currency: Currency) {
        _conversionState.update { it.copy(toCurrency = currency, errorMessage = null) }
        performConversion()
    }

    /**
     * Swap the "from" and "to" currencies.
     */
    fun swapCurrencies() {
        _conversionState.update { state ->
            state.copy(
                fromCurrency = state.toCurrency,
                toCurrency = state.fromCurrency,
                errorMessage = null,
            )
        }
        performConversion()
    }

    /**
     * Update the input amount string and trigger conversion.
     *
     * @param amount The user-entered amount as a string.
     */
    fun onAmountChanged(amount: String) {
        val sanitized = amount.filter { it.isDigit() || it == '.' }
        val dollars = sanitized.toDoubleOrNull()
        val cents = if (dollars != null && dollars >= 0) {
            Cents.fromDollars(dollars)
        } else {
            Cents.ZERO
        }
        _conversionState.update {
            it.copy(inputAmount = sanitized, inputCents = cents, errorMessage = null)
        }
        performConversion()
    }

    /**
     * Execute the conversion using cached exchange rates.
     *
     * Uses [MultiCurrencyEngine.convertWithCache] for the arithmetic and
     * [CurrencyFormatter.format] for the display string.
     */
    private fun performConversion() {
        viewModelScope.launch {
            val state = _conversionState.value
            if (state.inputCents.isZero()) {
                _conversionState.update {
                    it.copy(
                        convertedCents = null,
                        convertedFormatted = "",
                        exchangeRate = null,
                    )
                }
                return@launch
            }

            _conversionState.update { it.copy(isConverting = true) }

            val now = Clock.System.now()
            val result = MultiCurrencyEngine.convertWithCache(
                amount = state.inputCents,
                from = state.fromCurrency,
                to = state.toCurrency,
                cache = rateCache,
                now = now,
            )

            if (result != null) {
                _conversionState.update {
                    it.copy(
                        convertedCents = result.convertedAmount,
                        convertedFormatted = CurrencyFormatter.format(
                            result.convertedAmount,
                            state.toCurrency,
                        ),
                        exchangeRate = result.rateUsed,
                        rateTimestamp = now,
                        isConverting = false,
                        errorMessage = null,
                    )
                }
            } else {
                _conversionState.update {
                    it.copy(
                        convertedCents = null,
                        convertedFormatted = "",
                        exchangeRate = null,
                        isConverting = false,
                        errorMessage = "Exchange rate unavailable for " +
                            "${state.fromCurrency.code} → ${state.toCurrency.code}",
                    )
                }
            }
        }
    }

    // ── Rate seeding (demo/fallback) ────────────────────────────────────

    /**
     * Seeds the exchange rate cache with representative rates for demo use.
     *
     * In production this would be populated by the [ExchangeRateProvider]
     * fetching from the exchange-rates Edge Function.
     */
    private fun seedDemoRates() {
        val now = Clock.System.now()
        val rates = mapOf(
            (Currency.USD to Currency.EUR) to 0.92,
            (Currency.USD to Currency.GBP) to 0.79,
            (Currency.USD to Currency.JPY) to 149.50,
            (Currency.USD to Currency.CAD) to 1.36,
            (Currency("USD") to Currency("AUD")) to 1.53,
            (Currency("USD") to Currency("CHF")) to 0.88,
            (Currency("USD") to Currency("CNY")) to 7.24,
            (Currency("USD") to Currency("INR")) to 83.12,
            (Currency("USD") to Currency("MXN")) to 17.15,
            (Currency("USD") to Currency("BRL")) to 4.97,
            (Currency("USD") to Currency("KRW")) to 1328.0,
            (Currency("USD") to Currency("SEK")) to 10.42,
        )
        rateCache.putAll(rates, now)
        Timber.d("Seeded %d demo exchange rates", rates.size)
    }

    /**
     * Format an amount in a given currency for display.
     *
     * @param amount The amount in [Cents].
     * @param currency The currency to format for.
     * @return A formatted string like "$12.50" or "¥1,235".
     */
    fun formatAmount(amount: Cents, currency: Currency): String {
        return CurrencyFormatter.format(amount, currency)
    }

    /**
     * Look up display information for a currency code.
     *
     * @param currency The [Currency] to look up.
     * @return The [CurrencyInfo] if found, or null.
     */
    fun currencyInfo(currency: Currency): CurrencyInfo? {
        return MultiCurrencyEngine.currencyInfo(currency)
    }
}
