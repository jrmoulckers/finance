// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.money

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ForeignTransactionEntryTest {

    private val usd = Currency.USD
    private val eur = Currency.EUR
    private val jpy = Currency.JPY
    private val thb = Currency("THB")
    private val mxn = Currency("MXN")
    private val now = Instant.fromEpochSeconds(1_700_000_000L)

    /** Simple in-memory rate provider for tests — no hardcoded rates in prod code. */
    private fun providerOf(vararg rates: Pair<Pair<Currency, Currency>, Double>): MoneyRateProvider {
        val table = rates.toMap()
        return MoneyRateProvider { from, to, at ->
            table[from to to]?.let { MoneyRate(from, to, it, at) }
        }
    }

    // ── MoneyRate ───────────────────────────────────────────────────

    @Test
    fun moneyRate_rejectsNonPositive() {
        assertFailsWith<IllegalArgumentException> { MoneyRate(eur, usd, 0.0, now) }
        assertFailsWith<IllegalArgumentException> { MoneyRate(eur, usd, -1.0, now) }
    }

    @Test
    fun moneyRate_inverse() {
        val r = MoneyRate(eur, usd, 1.25, now)
        val inv = r.inverse
        assertEquals(usd, inv.from)
        assertEquals(eur, inv.to)
        assertEquals(0.8, inv.rate, 1e-9)
        assertEquals(now, inv.asOf)
    }

    // ── MoneyConverter: same-decimal currencies ─────────────────────

    @Test
    fun convert_eurToUsd_sameDecimals() {
        val euros = Money.ofMajor(100, 0, eur) // €100.00
        val dollars = MoneyConverter.convert(euros, usd, 1.085)
        assertEquals(Money.ofMinor(10850, usd), dollars) // $108.50
    }

    @Test
    fun convert_sameCurrency_returnsUnchanged() {
        val m = Money.ofMinor(5000, usd)
        assertEquals(m, MoneyConverter.convert(m, usd, 999.0))
    }

    @Test
    fun convert_rejectsNonPositiveRate() {
        assertFailsWith<IllegalArgumentException> {
            MoneyConverter.convert(Money.ofMinor(100, eur), usd, 0.0)
        }
    }

    // ── MoneyConverter: cross-decimal currencies (the hard case) ────

    @Test
    fun convert_jpyToUsd_zeroToTwoDecimals() {
        // ¥1000 at 1 JPY = 0.0067 USD → $6.70
        val yen = Money.ofMinor(1000, jpy)
        val dollars = MoneyConverter.convert(yen, usd, 0.0067)
        assertEquals(Money.ofMinor(670, usd), dollars)
    }

    @Test
    fun convert_usdToJpy_twoToZeroDecimals() {
        // $6.70 at 1 USD = 149.25 JPY → ¥1000
        val dollars = Money.ofMinor(670, usd)
        val yen = MoneyConverter.convert(dollars, jpy, 149.25)
        assertEquals(Money.ofMinor(1000, jpy), yen)
    }

    @Test
    fun convert_thbToUsd_nomadCashWithdrawal() {
        // ฿5000 (THB, 2 decimals stored as 500000 minor) at 1 THB = 0.0274 USD
        val baht = Money.ofMajor(5000, 0, thb)
        val dollars = MoneyConverter.convert(baht, usd, 0.0274)
        // 500000 * 0.0274 = 13700 → $137.00
        assertEquals(Money.ofMinor(13700, usd), dollars)
    }

    @Test
    fun convert_viaMoneyRate_matchesSourceCurrency() {
        val rate = MoneyRate(eur, usd, 1.085, now)
        val result = MoneyConverter.convert(Money.ofMajor(100, 0, eur), rate)
        assertEquals(Money.ofMinor(10850, usd), result)
    }

    @Test
    fun convert_viaMoneyRate_currencyMismatch_throws() {
        val rate = MoneyRate(eur, usd, 1.085, now)
        assertFailsWith<IllegalArgumentException> {
            MoneyConverter.convert(Money.ofMinor(100, mxn), rate)
        }
    }

    // ── Banker's rounding through conversion ────────────────────────

    @Test
    fun convert_bankersRounding_halfToEven() {
        // 1 minor unit EUR * rate → exactly .5 boundaries, same decimals (scale 1)
        assertEquals(Cents(2L), MoneyConverter.convert(Money.ofMinor(1, eur), usd, 2.5).cents)
        assertEquals(Cents(4L), MoneyConverter.convert(Money.ofMinor(1, eur), usd, 3.5).cents)
        assertEquals(Cents(2L), MoneyConverter.convert(Money.ofMinor(1, eur), usd, 1.5).cents)
    }

    // ── Builder: provider path ──────────────────────────────────────

    @Test
    fun build_foreignCurrency_recordsRateAndOriginal() {
        val provider = providerOf((eur to usd) to 1.085)
        val entry = ForeignTransactionEntryBuilder.build(
            entered = Money.ofMajor(100, 0, eur),
            baseCurrency = usd,
            provider = provider,
            at = now,
        )
        assertNotNull(entry)
        assertFalse(entry.isSameCurrency)
        assertEquals(Money.ofMajor(100, 0, eur), entry.enteredAmount)
        assertEquals(Money.ofMinor(10850, usd), entry.baseAmount)
        assertEquals(1.085, entry.exchangeRate)
        assertEquals(now, entry.rateTimestamp)
        assertEquals(RateSource.PROVIDER, entry.rateSource)
        assertNull(entry.feeAmount)
    }

    @Test
    fun build_missingRate_returnsNull() {
        val provider = providerOf() // empty
        val entry = ForeignTransactionEntryBuilder.build(
            entered = Money.ofMajor(100, 0, mxn),
            baseCurrency = usd,
            provider = provider,
            at = now,
        )
        assertNull(entry)
    }

    @Test
    fun build_sameCurrency_noConversion() {
        val provider = providerOf() // not consulted
        val entry = ForeignTransactionEntryBuilder.build(
            entered = Money.ofMinor(5000, usd),
            baseCurrency = usd,
            provider = provider,
            at = now,
        )
        assertNotNull(entry)
        assertTrue(entry.isSameCurrency)
        assertEquals(entry.enteredAmount, entry.baseAmount)
        assertEquals(1.0, entry.exchangeRate)
        assertEquals(RateSource.NONE, entry.rateSource)
    }

    @Test
    fun build_withFee_tracksFeeSeparately() {
        val provider = providerOf((eur to usd) to 1.10)
        val fee = Money.ofMinor(150, usd) // $1.50 card fee
        val entry = ForeignTransactionEntryBuilder.build(
            entered = Money.ofMajor(100, 0, eur),
            baseCurrency = usd,
            provider = provider,
            at = now,
            fee = fee,
        )
        assertNotNull(entry)
        assertEquals(Money.ofMinor(11000, usd), entry.baseAmount)
        assertEquals(fee, entry.feeAmount)
        // Fee is not folded into baseAmount, but reflected in the total.
        assertEquals(Money.ofMinor(11150, usd), entry.baseTotalWithFee)
    }

    // ── Builder: manual rate path ───────────────────────────────────

    @Test
    fun buildWithManualRate_recordsManualSource() {
        val entry = ForeignTransactionEntryBuilder.buildWithManualRate(
            entered = Money.ofMajor(1000, 0, mxn), // MX$1000.00
            baseCurrency = usd,
            rate = 0.058, // receipt rate
            at = now,
        )
        // 100000 minor * 0.058 = 5800 → $58.00
        assertEquals(Money.ofMinor(5800, usd), entry.baseAmount)
        assertEquals(RateSource.MANUAL, entry.rateSource)
        assertEquals(0.058, entry.exchangeRate)
    }

    @Test
    fun buildWithManualRate_sameCurrency_isNone() {
        val entry = ForeignTransactionEntryBuilder.buildWithManualRate(
            entered = Money.ofMinor(2500, usd),
            baseCurrency = usd,
            rate = 1.23,
            at = now,
        )
        assertTrue(entry.isSameCurrency)
        assertEquals(RateSource.NONE, entry.rateSource)
        assertEquals(1.0, entry.exchangeRate)
    }

    @Test
    fun buildWithManualRate_rejectsNonPositiveRate() {
        assertFailsWith<IllegalArgumentException> {
            ForeignTransactionEntryBuilder.buildWithManualRate(
                entered = Money.ofMinor(100, eur),
                baseCurrency = usd,
                rate = 0.0,
                at = now,
            )
        }
    }

    // ── Entry invariants ────────────────────────────────────────────

    @Test
    fun entry_feeCurrencyMustMatchBase() {
        assertFailsWith<IllegalArgumentException> {
            ForeignTransactionEntry(
                enteredAmount = Money.ofMinor(10000, eur),
                baseAmount = Money.ofMinor(10850, usd),
                exchangeRate = 1.085,
                rateTimestamp = now,
                rateSource = RateSource.PROVIDER,
                feeAmount = Money.ofMinor(100, eur), // wrong currency
            )
        }
    }

    @Test
    fun entry_feeMustNotBeNegative() {
        assertFailsWith<IllegalArgumentException> {
            ForeignTransactionEntry(
                enteredAmount = Money.ofMinor(10000, eur),
                baseAmount = Money.ofMinor(10850, usd),
                exchangeRate = 1.085,
                rateTimestamp = now,
                rateSource = RateSource.PROVIDER,
                feeAmount = Money.ofMinor(-100, usd),
            )
        }
    }

    @Test
    fun entry_rejectsNonPositiveRate() {
        assertFailsWith<IllegalArgumentException> {
            ForeignTransactionEntry(
                enteredAmount = Money.ofMinor(10000, eur),
                baseAmount = Money.ofMinor(10850, usd),
                exchangeRate = 0.0,
                rateTimestamp = now,
                rateSource = RateSource.PROVIDER,
            )
        }
    }

    @Test
    fun entry_baseTotalWithoutFee_equalsBase() {
        val entry = ForeignTransactionEntryBuilder.buildWithManualRate(
            entered = Money.ofMajor(100, 0, eur),
            baseCurrency = usd,
            rate = 1.085,
            at = now,
        )
        assertEquals(entry.baseAmount, entry.baseTotalWithFee)
    }
}
