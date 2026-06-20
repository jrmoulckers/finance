// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.tax

import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class TaxCalculatorsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun selfEmploymentTax_matchesWebFixtureForEightyThousandDollars() {
        val result = SelfEmploymentTaxCalculator.calculateSETax(Cents(8_000_000))

        assertEquals(Cents(8_000_000), result.netIncome)
        assertEquals(Cents(7_388_000), result.taxableBase)
        assertEquals(Cents(916_112), result.ssContribution)
        assertEquals(Cents(214_252), result.medicareContribution)
        assertEquals(Cents(1_130_364), result.seTax)
        assertEquals(Cents(565_182), result.seDeduction)
    }

    @Test
    fun selfEmploymentTax_matchesWebFixtureForOneHundredTwentyThousandDollars() {
        val result = SelfEmploymentTaxCalculator.calculateSETax(Cents(12_000_000))

        assertEquals(Cents(11_082_000), result.taxableBase)
        assertEquals(Cents(1_374_168), result.ssContribution)
        assertEquals(Cents(321_378), result.medicareContribution)
        assertEquals(Cents(1_695_546), result.seTax)
        assertEquals(Cents(847_773), result.seDeduction)
    }

    @Test
    fun selfEmploymentTax_handlesZeroIncome() {
        val result = SelfEmploymentTaxCalculator.calculateSETax(Cents.ZERO)

        assertEquals(Cents.ZERO, result.netIncome)
        assertEquals(Cents.ZERO, result.taxableBase)
        assertEquals(Cents.ZERO, result.ssContribution)
        assertEquals(Cents.ZERO, result.medicareContribution)
        assertEquals(Cents.ZERO, result.seTax)
        assertEquals(Cents.ZERO, result.seDeduction)
    }

    @Test
    fun selfEmploymentTax_capsSocialSecurityAtWageBase() {
        val result = SelfEmploymentTaxCalculator.calculateSETax(Cents(20_000_000))

        assertEquals(Cents(18_470_000), result.taxableBase)
        assertEquals(Cents(2_090_640), result.ssContribution)
        assertEquals(Cents(535_630), result.medicareContribution)
        assertEquals(Cents(2_626_270), result.seTax)
    }

    @Test
    fun additionalMedicare_matchesWebFixtures() {
        assertEquals(
            Cents.ZERO,
            SelfEmploymentTaxCalculator.calculateAdditionalMedicareTax(
                wages = Cents(100_000_00),
                seIncome = Cents(50_000_00),
            ),
        )
        assertEquals(
            Cents(27_000),
            SelfEmploymentTaxCalculator.calculateAdditionalMedicareTax(
                wages = Cents(180_000_00),
                seIncome = Cents(50_000_00),
            ),
        )
        assertEquals(
            Cents(22_500),
            SelfEmploymentTaxCalculator.calculateAdditionalMedicareTax(
                wages = Cents(100_000_00),
                seIncome = Cents(50_000_00),
                isMarriedFilingSeparately = true,
            ),
        )
        assertEquals(
            Cents(18_000),
            SelfEmploymentTaxCalculator.calculateAdditionalMedicareTax(
                wages = Cents(200_000_00),
                seIncome = Cents(20_000_00),
            ),
        )
    }

    @Test
    fun selfEmploymentTaxWithAdditionalMedicare_includesAdditionalTaxInDeduction() {
        val result = SelfEmploymentTaxCalculator.calculateSETaxWithAdditionalMedicare(
            netIncome = Cents(20_000_000),
            wages = Cents(5_000_000),
        )

        assertEquals(Cents(45_000), result.additionalMedicareTax)
        assertEquals(Cents(2_671_270), result.seTax)
        assertEquals(Cents(1_335_635), result.seDeduction)
    }

    @Test
    fun mileageDeduction_matchesWebTripFixtures() {
        val trips = webMileageTrips()

        assertEquals(Cents(3_350), MileageDeductionCalculator.calculateTripDeduction(trips[0]).deduction)
        assertEquals(Cents(8_040), MileageDeductionCalculator.calculateTripDeduction(trips[1]).deduction)
        assertEquals(Cents(630), MileageDeductionCalculator.calculateTripDeduction(trips[2]).deduction)
        assertEquals(Cents(210), MileageDeductionCalculator.calculateTripDeduction(trips[3]).deduction)
        assertEquals(Cents(838), MileageDeductionCalculator.calculateTripDeduction(trips[5]).deduction)
    }

    @Test
    fun mileageSummary_matchesWebAnnualFixture() {
        val summary = MileageDeductionCalculator.generateAnnualMileageSummary(webMileageTrips().take(5), 2024)

        assertEquals(2024, summary.year)
        assertEquals(215.0, summary.totalMiles)
        assertEquals(4, summary.totalTrips)
        assertEquals(Cents(12_230), summary.totalDeduction)
        val business = summary.byPurpose.first { it.purpose == MileagePurpose.BUSINESS }
        assertEquals(170.0, business.totalMiles)
        assertEquals(67L, business.rate)
        assertEquals(Cents(11_390), business.totalDeduction)
        assertEquals(2, business.tripCount)
    }

    @Test
    fun mileageDeduction_keepsPersonalTripsWithoutDeductionAndRejectsUnsupportedYears() {
        val businessTrip = webMileageTrips().first()

        assertEquals(
            Cents.ZERO,
            MileageDeductionCalculator.calculateTripDeduction(businessTrip.copy(isBusinessUse = false)).deduction,
        )
        assertFailsWith<IllegalArgumentException> {
            MileageDeductionCalculator.calculateTripDeduction(businessTrip, 2026)
        }
    }

    @Test
    fun taxReserve_recommendedReserveMatchesWebFixture() {
        val accounts = listOf(
            TaxReserveAccount("business", TaxReserveAccountPurpose.BUSINESS),
            TaxReserveAccount("personal", TaxReserveAccountPurpose.PERSONAL),
        )
        val transactions = listOf(
            taxTransaction("income", "business", TaxReserveTransactionType.INCOME, 500_000, LocalDate(2025, 3, 6)),
            taxTransaction("expense", "business", TaxReserveTransactionType.EXPENSE, 75_000, LocalDate(2025, 3, 7)),
            taxTransaction("personal-income", "personal", TaxReserveTransactionType.INCOME, 250_000, LocalDate(2025, 3, 8)),
            taxTransaction(
                "voided",
                "business",
                TaxReserveTransactionType.INCOME,
                100_000,
                LocalDate(2025, 3, 9),
                status = TaxReserveTransactionStatus.VOID,
            ),
        )

        val netIncome = TaxReserveCalculator.calculateNetSelfEmploymentIncomeCents(
            transactions = transactions,
            accounts = accounts,
            bounds = TaxDateBounds(LocalDate(2025, 3, 1), LocalDate(2025, 3, 31)),
        )

        assertEquals(Cents(425_000), netIncome)
        assertEquals(Cents(119_000), TaxReserveCalculator.calculateRecommendedTaxReserveCents(netIncome, 0.28))
    }

    @Test
    fun taxReserveSummary_buildsMonthlyAndQuarterlyGuidanceWithBucketShortfall() {
        val accounts = listOf(TaxReserveAccount("business", TaxReserveAccountPurpose.BUSINESS))
        val transactions = listOf(
            taxTransaction("jan", "business", TaxReserveTransactionType.INCOME, 300_000, LocalDate(2025, 1, 20)),
            taxTransaction("mar", "business", TaxReserveTransactionType.INCOME, 500_000, LocalDate(2025, 3, 6)),
        )

        val summary = TaxReserveCalculator.buildTaxReserveSummary(
            TaxReserveSummaryInput(
                currentMonthTransactions = transactions,
                quarterTransactions = transactions,
                accounts = accounts,
                settings = TaxReserveSettings(rate = 0.28, bucketBalanceCents = Cents(100_000)),
                asOf = LocalDate(2025, 3, 10),
            ),
        )

        assertEquals(Cents(500_000), summary.currentMonthNetIncomeCents)
        assertEquals(Cents(140_000), summary.currentMonthRecommendedCents)
        assertEquals(Cents(224_000), summary.quarterRecommendedCents)
        assertEquals(Cents(124_000), summary.recommendedPaymentCents)
    }

    @Test
    fun taxReserveSummary_usesRateBreakdownPaymentsAndTaggedMixedAccountIncome() {
        val taggedIncome = taxTransaction(
            id = "client",
            accountId = "personal",
            type = TaxReserveTransactionType.INCOME,
            amount = 600_000,
            date = LocalDate(2025, 3, 6),
            customFields = mapOf("tax.selfEmploymentIncome" to "true"),
        )

        val summary = TaxReserveCalculator.buildTaxReserveSummary(
            TaxReserveSummaryInput(
                currentMonthTransactions = listOf(taggedIncome),
                quarterTransactions = listOf(taggedIncome),
                accounts = listOf(TaxReserveAccount("personal", TaxReserveAccountPurpose.PERSONAL)),
                settings = TaxReserveSettings(
                    rate = 0.28,
                    federalRate = 0.18,
                    stateRate = 0.05,
                    selfEmploymentRate = 0.153,
                    bucketBalanceCents = Cents(50_000),
                ),
                estimatedPayments = listOf(
                    EstimatedTaxPaymentRecord(
                        id = "q1-payment",
                        taxYear = 2025,
                        quarter = TaxQuarter.Q1,
                        paidDate = LocalDate(2025, 3, 20),
                        amountCents = Cents(75_000),
                    ),
                ),
                asOf = LocalDate(2025, 3, 10),
            ),
        )

        assertEquals(0.383, summary.rate, 0.000_000_001)
        assertEquals(Cents(229_800), summary.quarterRecommendedCents)
        assertEquals(Cents(179_800), summary.reserveShortfallCents)
        assertEquals(Cents(75_000), summary.quarterPaidCents)
        assertEquals(Cents(104_800), summary.remainingRecommendedPaymentCents)
        assertEquals("Q1 2025: 2025-01-01 through 2025-03-31", summary.paymentPeriodLabel)
        assertEquals(QuarterlyDueDateStatus.FUTURE, summary.dueDateStatus)
    }

    @Test
    fun quarterlyDueDates_matchWebDateFixtures() {
        assertEquals(
            QuarterlyTaxDueDate(
                quarter = TaxQuarter.Q1,
                taxYear = 2025,
                dueDate = LocalDate(2025, 4, 15),
                periodStart = LocalDate(2025, 1, 1),
                periodEnd = LocalDate(2025, 3, 31),
            ),
            TaxReserveCalculator.getNextQuarterlyTaxDueDate(LocalDate(2025, 2, 1)),
        )
        assertEquals(TaxQuarter.Q2, TaxReserveCalculator.getNextQuarterlyTaxDueDate(LocalDate(2025, 4, 16)).quarter)
        assertEquals(TaxQuarter.Q3, TaxReserveCalculator.getNextQuarterlyTaxDueDate(LocalDate(2025, 6, 16)).quarter)
        assertEquals(
            LocalDate(2026, 1, 15),
            TaxReserveCalculator.getNextQuarterlyTaxDueDate(LocalDate(2025, 12, 20)).dueDate,
        )
        assertEquals(
            TaxQuarter.Q4,
            TaxReserveCalculator.getNextQuarterlyTaxDueDate(LocalDate(2026, 1, 10)).quarter,
        )
        assertEquals(
            2025,
            TaxReserveCalculator.getNextQuarterlyTaxDueDate(LocalDate(2026, 1, 10)).taxYear,
        )
    }

    @Test
    fun gigTakeHome_appliesMileageDeductionsToTaxableIncomeButNotCashTakeHome() {
        val tripDeduction = MileageDeductionCalculator.calculateTripDeduction(webMileageTrips().first())
        val result = GigTakeHomeCalculator.calculate(
            GigTakeHomeInput(
                grossIncomeCents = Cents(500_000),
                businessExpenseCents = Cents(75_000),
                mileageDeductions = listOf(tripDeduction),
                reserveRate = 0.28,
            ),
        )

        assertEquals(Cents(3_350), result.mileageDeductionCents)
        assertEquals(Cents(421_650), result.netSelfEmploymentIncomeCents)
        assertEquals(Cents(118_062), result.estimatedTaxReserveCents)
        assertEquals(Cents(306_938), result.takeHomeCents)
        assertTrue(result.estimatedSETax.seTax.amount > 0)
    }

    @Test
    fun taxModels_serializeAndRoundTripAsPlatformNeutralJson() {
        val result = GigTakeHomeCalculator.calculate(
            GigTakeHomeInput(
                grossIncomeCents = Cents(8_000_000),
                businessExpenseCents = Cents(100_000),
                mileageDeductions = listOf(MileageDeductionCalculator.calculateTripDeduction(webMileageTrips().first())),
                reserveRate = 0.30,
            ),
        )

        val encoded = json.encodeToString(result)
        val decoded = json.decodeFromString<GigTakeHomeResult>(encoded)

        assertEquals(result, decoded)
        assertTrue(encoded.contains("\"grossIncomeCents\":8000000"))
        assertTrue(encoded.contains("\"mileageDeductionCents\":3350"))
    }

    private fun taxTransaction(
        id: String,
        accountId: String,
        type: TaxReserveTransactionType,
        amount: Long,
        date: LocalDate,
        status: TaxReserveTransactionStatus = TaxReserveTransactionStatus.CLEARED,
        customFields: Map<String, String> = emptyMap(),
    ) = TaxReserveTransaction(
        id = id,
        accountId = accountId,
        type = type,
        amount = Cents(amount),
        date = date,
        status = status,
        customFields = customFields,
    )

    private fun webMileageTrips() = listOf(
        TripEntry(
            tripId = "trip-1",
            date = LocalDate(2024, 3, 15),
            miles = 50.0,
            purpose = MileagePurpose.BUSINESS,
            startLocation = "Home Office",
            endLocation = "Client Site",
        ),
        TripEntry(
            tripId = "trip-2",
            date = LocalDate(2024, 4, 20),
            miles = 120.0,
            purpose = MileagePurpose.BUSINESS,
            startLocation = "Office",
            endLocation = "Conference Center",
        ),
        TripEntry(
            tripId = "trip-3",
            date = LocalDate(2024, 5, 10),
            miles = 30.0,
            purpose = MileagePurpose.MEDICAL,
            startLocation = "Home",
            endLocation = "Hospital",
        ),
        TripEntry(
            tripId = "trip-4",
            date = LocalDate(2024, 6, 1),
            miles = 15.0,
            purpose = MileagePurpose.CHARITY,
            startLocation = "Home",
            endLocation = "Food Bank",
        ),
        TripEntry(
            tripId = "trip-5",
            date = LocalDate(2023, 12, 15),
            miles = 80.0,
            purpose = MileagePurpose.BUSINESS,
            startLocation = "Office",
            endLocation = "Client",
        ),
        TripEntry(
            tripId = "frac-1",
            date = LocalDate(2024, 1, 15),
            miles = 12.5,
            purpose = MileagePurpose.BUSINESS,
            startLocation = "A",
            endLocation = "B",
        ),
    )
}
