// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.currency

import com.finance.models.types.Currency
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [CurrencyViewModel].
 *
 * Verifies currency catalog loading, search filtering, currency selection,
 * conversion arithmetic, and currency swapping.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CurrencyViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // ── Picker tests ────────────────────────────────────────────────────

    @Test
    fun `init loads currency catalog`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        val state = vm.pickerState.value
        assertFalse(state.isLoading, "Should not be loading after init")
        assertTrue(state.currencies.isNotEmpty(), "Should have currencies loaded")
        assertTrue(state.filteredCurrencies.isNotEmpty(), "Filtered list should match full list")
        assertEquals(state.currencies.size, state.filteredCurrencies.size)
    }

    @Test
    fun `search filters currencies by code`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        vm.onSearchQueryChanged("USD")
        val state = vm.pickerState.value

        assertTrue(state.filteredCurrencies.any { it.code == "USD" })
        assertTrue(
            state.filteredCurrencies.size < state.currencies.size,
            "Filtered list should be smaller than full list",
        )
    }

    @Test
    fun `search filters currencies by name`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        vm.onSearchQueryChanged("Euro")
        val state = vm.pickerState.value

        assertTrue(state.filteredCurrencies.any { it.code == "EUR" })
    }

    @Test
    fun `empty search shows all currencies`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        vm.onSearchQueryChanged("USD")
        vm.onSearchQueryChanged("")
        val state = vm.pickerState.value

        assertEquals(state.currencies.size, state.filteredCurrencies.size)
    }

    @Test
    fun `no results for gibberish search`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        vm.onSearchQueryChanged("XYZZZZ")
        val state = vm.pickerState.value

        assertTrue(state.filteredCurrencies.isEmpty(), "Should have no results for invalid query")
    }

    @Test
    fun `selectCurrency updates selected state`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        assertNull(vm.pickerState.value.selectedCurrency)

        vm.selectCurrency(Currency.EUR)
        assertEquals(Currency.EUR, vm.pickerState.value.selectedCurrency)
    }

    // ── Conversion tests ────────────────────────────────────────────────

    @Test
    fun `conversion defaults to USD and EUR`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        val state = vm.conversionState.value
        assertEquals(Currency.USD, state.fromCurrency)
        assertEquals(Currency.EUR, state.toCurrency)
    }

    @Test
    fun `amount change triggers conversion`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        vm.onAmountChanged("100")
        advanceUntilIdle()

        val state = vm.conversionState.value
        assertEquals("100", state.inputAmount)
        assertNotNull(state.convertedCents, "Should have converted amount")
        assertTrue(state.convertedFormatted.isNotEmpty(), "Should have formatted result")
        assertNotNull(state.exchangeRate, "Should have exchange rate")
    }

    @Test
    fun `swap currencies reverses from and to`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        val before = vm.conversionState.value
        assertEquals(Currency.USD, before.fromCurrency)
        assertEquals(Currency.EUR, before.toCurrency)

        vm.swapCurrencies()
        advanceUntilIdle()

        val after = vm.conversionState.value
        assertEquals(Currency.EUR, after.fromCurrency)
        assertEquals(Currency.USD, after.toCurrency)
    }

    @Test
    fun `setFromCurrency updates state`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        vm.setFromCurrency(Currency.GBP)
        advanceUntilIdle()

        assertEquals(Currency.GBP, vm.conversionState.value.fromCurrency)
    }

    @Test
    fun `setToCurrency updates state`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        vm.setToCurrency(Currency.JPY)
        advanceUntilIdle()

        assertEquals(Currency.JPY, vm.conversionState.value.toCurrency)
    }

    @Test
    fun `zero amount clears conversion result`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        // First enter a valid amount
        vm.onAmountChanged("50")
        advanceUntilIdle()
        assertNotNull(vm.conversionState.value.convertedCents)

        // Clear the amount
        vm.onAmountChanged("")
        advanceUntilIdle()

        val state = vm.conversionState.value
        assertNull(state.convertedCents, "Converted amount should be null for empty input")
        assertTrue(state.convertedFormatted.isEmpty())
    }

    @Test
    fun `invalid amount is sanitized`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        vm.onAmountChanged("abc123.45xyz")
        val state = vm.conversionState.value

        assertEquals("123.45", state.inputAmount, "Non-numeric characters should be stripped")
    }

    // ── Helper tests ────────────────────────────────────────────────────

    @Test
    fun `formatAmount produces valid output`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        val result = vm.formatAmount(
            com.finance.models.types.Cents(1250),
            Currency.USD,
        )
        assertEquals("$12.50", result)
    }

    @Test
    fun `currencyInfo returns data for known currency`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        val info = vm.currencyInfo(Currency.USD)
        assertNotNull(info)
        assertEquals("USD", info.code)
        assertEquals("US Dollar", info.displayName)
        assertEquals("$", info.symbol)
    }

    @Test
    fun `currencyInfo returns null for unknown currency`() = runTest(testDispatcher) {
        val vm = CurrencyViewModel()
        advanceUntilIdle()

        val info = vm.currencyInfo(Currency("ZZZ"))
        assertNull(info)
    }
}
