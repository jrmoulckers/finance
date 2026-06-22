// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.tax

import com.finance.core.mileage.MileageCalculation
import com.finance.models.types.Cents
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.daysUntil
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.math.abs
import kotlin.math.roundToLong

@Serializable
data class SelfEmploymentTaxResult(
    val netIncome: Cents,
    val seTax: Cents,
    val seDeduction: Cents,
    val taxableBase: Cents,
    val ssContribution: Cents,
    val medicareContribution: Cents,
)

@Serializable
data class SelfEmploymentTaxWithAdditionalMedicareResult(
    val netIncome: Cents,
    val seTax: Cents,
    val seDeduction: Cents,
    val taxableBase: Cents,
    val ssContribution: Cents,
    val medicareContribution: Cents,
    val additionalMedicareTax: Cents,
)

object SelfEmploymentTaxCalculator {
    const val SS_WAGE_BASE_2024_CENTS: Long = 168_600_00L
    const val TAXABLE_BASE_PERCENT: Double = 0.9235
    const val SS_RATE: Double = 0.124
    const val MEDICARE_RATE: Double = 0.029
    const val ADDITIONAL_MEDICARE_RATE: Double = 0.009
    const val SE_TAX_DEDUCTION_RATE: Double = 0.5

    fun calculateSETax(netIncome: Cents): SelfEmploymentTaxResult {
        val taxableBase = roundCents(netIncome.amount * TAXABLE_BASE_PERCENT)
        val ssWageBase = minOf(taxableBase.amount, SS_WAGE_BASE_2024_CENTS)
        val ssContribution = roundCents(ssWageBase * SS_RATE)
        val medicareContribution = roundCents(taxableBase.amount * MEDICARE_RATE)
        val seTax = ssContribution + medicareContribution
        val seDeduction = roundCents(seTax.amount * SE_TAX_DEDUCTION_RATE)

        return SelfEmploymentTaxResult(
            netIncome = netIncome,
            seTax = seTax,
            seDeduction = seDeduction,
            taxableBase = taxableBase,
            ssContribution = ssContribution,
            medicareContribution = medicareContribution,
        )
    }

    fun calculateAdditionalMedicareTax(
        wages: Cents,
        seIncome: Cents,
        isMarriedFilingSeparately: Boolean = false,
    ): Cents {
        val threshold = if (isMarriedFilingSeparately) 125_000_00L else 200_000_00L
        val combinedIncome = wages.amount + seIncome.amount
        if (combinedIncome <= threshold) return Cents.ZERO

        return roundCents((combinedIncome - threshold) * ADDITIONAL_MEDICARE_RATE)
    }

    fun calculateSETaxWithAdditionalMedicare(
        netIncome: Cents,
        wages: Cents = Cents.ZERO,
        isMarriedFilingSeparately: Boolean = false,
    ): SelfEmploymentTaxWithAdditionalMedicareResult {
        val baseResult = calculateSETax(netIncome)
        val additionalMedicareTax = calculateAdditionalMedicareTax(
            wages = wages,
            seIncome = netIncome,
            isMarriedFilingSeparately = isMarriedFilingSeparately,
        )
        val totalSETax = baseResult.seTax + additionalMedicareTax

        return SelfEmploymentTaxWithAdditionalMedicareResult(
            netIncome = baseResult.netIncome,
            seTax = totalSETax,
            seDeduction = roundCents(totalSETax.amount * SE_TAX_DEDUCTION_RATE),
            taxableBase = baseResult.taxableBase,
            ssContribution = baseResult.ssContribution,
            medicareContribution = baseResult.medicareContribution,
            additionalMedicareTax = additionalMedicareTax,
        )
    }
}

@Serializable
enum class TaxReserveTransactionType { EXPENSE, INCOME, TRANSFER }

@Serializable
enum class TaxReserveTransactionStatus { PENDING, CLEARED, RECONCILED, VOID }

@Serializable
enum class TaxReserveAccountPurpose {
    @SerialName("personal")
    PERSONAL,

    @SerialName("business")
    BUSINESS,

    @SerialName("both")
    BOTH,
}

@Serializable
data class TaxReserveAccount(
    val id: String,
    val purpose: TaxReserveAccountPurpose,
)

@Serializable
data class TaxReserveTransaction(
    val id: String,
    val accountId: String,
    val type: TaxReserveTransactionType,
    val amount: Cents,
    val date: LocalDate,
    val status: TaxReserveTransactionStatus = TaxReserveTransactionStatus.CLEARED,
    val customFields: Map<String, String> = emptyMap(),
)

@Serializable
data class TaxDateBounds(
    val startDate: LocalDate? = null,
    val endDate: LocalDate? = null,
)

@Serializable
data class TaxReserveRateBreakdown(
    val federalRate: Double,
    val stateRate: Double,
    val selfEmploymentRate: Double,
)

@Serializable
data class TaxReserveSettings(
    val rate: Double = TaxReserveCalculator.DEFAULT_TAX_RESERVE_RATE,
    val bucketBalanceCents: Cents = Cents.ZERO,
    val federalRate: Double? = null,
    val stateRate: Double? = null,
    val selfEmploymentRate: Double? = null,
)

@Serializable
enum class TaxQuarter { Q1, Q2, Q3, Q4 }

@Serializable
enum class QuarterlyDueDateStatus {
    @SerialName("future")
    FUTURE,

    @SerialName("due_soon")
    DUE_SOON,

    @SerialName("due_today")
    DUE_TODAY,
}

@Serializable
data class QuarterlyTaxDueDate(
    val quarter: TaxQuarter,
    val taxYear: Int,
    val dueDate: LocalDate,
    val periodStart: LocalDate,
    val periodEnd: LocalDate,
)

@Serializable
data class EstimatedTaxPaymentRecord(
    val id: String,
    val taxYear: Int,
    val quarter: TaxQuarter,
    val paidDate: LocalDate,
    val amountCents: Cents,
    val note: String? = null,
)

@Serializable
data class TaxReserveSummary(
    val rate: Double,
    val rateBreakdown: TaxReserveRateBreakdown,
    val bucketBalanceCents: Cents,
    val currentMonthNetIncomeCents: Cents,
    val currentMonthRecommendedCents: Cents,
    val monthToDateReserveCents: Cents,
    val quarterNetIncomeCents: Cents,
    val quarterRecommendedCents: Cents,
    val quarterToDateReserveCents: Cents,
    val quarterPaidCents: Cents,
    val recommendedPaymentCents: Cents,
    val remainingRecommendedPaymentCents: Cents,
    val reserveShortfallCents: Cents,
    val nextDueDate: QuarterlyTaxDueDate,
    val daysUntilDue: Int,
    val dueDateStatus: QuarterlyDueDateStatus,
    val paymentPeriodLabel: String,
)

@Serializable
data class TaxReserveSummaryInput(
    val currentMonthTransactions: List<TaxReserveTransaction>,
    val quarterTransactions: List<TaxReserveTransaction>,
    val accounts: List<TaxReserveAccount> = emptyList(),
    val settings: TaxReserveSettings = TaxReserveSettings(),
    val estimatedPayments: List<EstimatedTaxPaymentRecord> = emptyList(),
    val asOf: LocalDate,
)

object TaxReserveCalculator {
    const val DEFAULT_TAX_RESERVE_RATE: Double = 0.28
    const val MIN_SUGGESTED_TAX_RESERVE_RATE: Double = 0.25
    const val MAX_SUGGESTED_TAX_RESERVE_RATE: Double = 0.30

    fun getNextQuarterlyTaxDueDate(asOf: LocalDate): QuarterlyTaxDueDate {
        val candidates = buildDueDateCandidates(asOf.year)
        return candidates.firstOrNull { it.dueDate >= asOf } ?: candidates.last()
    }

    fun getDaysUntilDue(dueDate: LocalDate, asOf: LocalDate): Int =
        asOf.daysUntil(dueDate).coerceAtLeast(0)

    fun getCurrentMonthBounds(asOf: LocalDate): TaxDateBounds {
        val startDate = LocalDate(asOf.year, asOf.monthNumber, 1)
        val endDate = startDate.plus(1, DateTimeUnit.MONTH).minus(1, DateTimeUnit.DAY)
        return TaxDateBounds(startDate = startDate, endDate = endDate)
    }

    fun calculateNetSelfEmploymentIncomeCents(
        transactions: List<TaxReserveTransaction>,
        accounts: List<TaxReserveAccount> = emptyList(),
        bounds: TaxDateBounds = TaxDateBounds(),
    ): Cents {
        val netIncome = transactions.fold(0L) { sum, transaction ->
            if (!shouldIncludeTransaction(transaction, accounts, bounds)) {
                sum
            } else {
                when (transaction.type) {
                    TaxReserveTransactionType.INCOME -> sum + abs(transaction.amount.amount)
                    TaxReserveTransactionType.EXPENSE -> sum - abs(transaction.amount.amount)
                    TaxReserveTransactionType.TRANSFER -> sum
                }
            }
        }

        return Cents(netIncome.coerceAtLeast(0L))
    }

    fun calculateRecommendedTaxReserveCents(
        netIncomeCents: Cents,
        rate: Double = DEFAULT_TAX_RESERVE_RATE,
    ): Cents = roundCents(netIncomeCents.amount.coerceAtLeast(0L) * normalizeRate(rate))

    fun buildTaxReserveSummary(input: TaxReserveSummaryInput): TaxReserveSummary {
        val rateBreakdown = normalizeRateBreakdown(input.settings)
        val rate = sumRateBreakdown(rateBreakdown)
        val bucketBalanceCents = Cents(input.settings.bucketBalanceCents.amount.coerceAtLeast(0L))
        val currentMonthBounds = getCurrentMonthBounds(input.asOf)
        val nextDueDate = getNextQuarterlyTaxDueDate(input.asOf)

        val currentMonthNetIncomeCents = calculateNetSelfEmploymentIncomeCents(
            transactions = input.currentMonthTransactions,
            accounts = input.accounts,
            bounds = currentMonthBounds,
        )
        val quarterNetIncomeCents = calculateNetSelfEmploymentIncomeCents(
            transactions = input.quarterTransactions,
            accounts = input.accounts,
            bounds = TaxDateBounds(startDate = nextDueDate.periodStart, endDate = nextDueDate.periodEnd),
        )
        val currentMonthRecommendedCents = calculateRecommendedTaxReserveCents(currentMonthNetIncomeCents, rate)
        val quarterRecommendedCents = calculateRecommendedTaxReserveCents(quarterNetIncomeCents, rate)
        val reserveShortfallCents = Cents((quarterRecommendedCents.amount - bucketBalanceCents.amount).coerceAtLeast(0L))
        val quarterPaidCents = Cents(
            input.estimatedPayments
                .filter { it.taxYear == nextDueDate.taxYear && it.quarter == nextDueDate.quarter }
                .sumOf { it.amountCents.amount.coerceAtLeast(0L) },
        )
        val remainingRecommendedPaymentCents = Cents(
            (reserveShortfallCents.amount - quarterPaidCents.amount).coerceAtLeast(0L),
        )
        val daysUntilDue = getDaysUntilDue(nextDueDate.dueDate, input.asOf)

        return TaxReserveSummary(
            rate = rate,
            rateBreakdown = rateBreakdown,
            bucketBalanceCents = bucketBalanceCents,
            currentMonthNetIncomeCents = currentMonthNetIncomeCents,
            currentMonthRecommendedCents = currentMonthRecommendedCents,
            monthToDateReserveCents = currentMonthRecommendedCents,
            quarterNetIncomeCents = quarterNetIncomeCents,
            quarterRecommendedCents = quarterRecommendedCents,
            quarterToDateReserveCents = quarterRecommendedCents,
            quarterPaidCents = quarterPaidCents,
            recommendedPaymentCents = remainingRecommendedPaymentCents,
            remainingRecommendedPaymentCents = remainingRecommendedPaymentCents,
            reserveShortfallCents = reserveShortfallCents,
            nextDueDate = nextDueDate,
            daysUntilDue = daysUntilDue,
            dueDateStatus = getDueDateStatus(daysUntilDue),
            paymentPeriodLabel = "${nextDueDate.quarter} ${nextDueDate.taxYear}: " +
                "${nextDueDate.periodStart} through ${nextDueDate.periodEnd}",
        )
    }

    private fun buildDueDateCandidates(year: Int): List<QuarterlyTaxDueDate> = listOf(
        QuarterlyTaxDueDate(
            quarter = TaxQuarter.Q4,
            taxYear = year - 1,
            dueDate = LocalDate(year, 1, 15),
            periodStart = LocalDate(year - 1, 9, 1),
            periodEnd = LocalDate(year - 1, 12, 31),
        ),
        QuarterlyTaxDueDate(
            quarter = TaxQuarter.Q1,
            taxYear = year,
            dueDate = LocalDate(year, 4, 15),
            periodStart = LocalDate(year, 1, 1),
            periodEnd = LocalDate(year, 3, 31),
        ),
        QuarterlyTaxDueDate(
            quarter = TaxQuarter.Q2,
            taxYear = year,
            dueDate = LocalDate(year, 6, 15),
            periodStart = LocalDate(year, 4, 1),
            periodEnd = LocalDate(year, 5, 31),
        ),
        QuarterlyTaxDueDate(
            quarter = TaxQuarter.Q3,
            taxYear = year,
            dueDate = LocalDate(year, 9, 15),
            periodStart = LocalDate(year, 6, 1),
            periodEnd = LocalDate(year, 8, 31),
        ),
        QuarterlyTaxDueDate(
            quarter = TaxQuarter.Q4,
            taxYear = year,
            dueDate = LocalDate(year + 1, 1, 15),
            periodStart = LocalDate(year, 9, 1),
            periodEnd = LocalDate(year, 12, 31),
        ),
    )

    private fun shouldIncludeTransaction(
        transaction: TaxReserveTransaction,
        accounts: List<TaxReserveAccount>,
        bounds: TaxDateBounds,
    ): Boolean {
        if (transaction.status == TaxReserveTransactionStatus.VOID) return false
        if (bounds.startDate != null && transaction.date < bounds.startDate) return false
        if (bounds.endDate != null && transaction.date > bounds.endDate) return false
        if (isTaxReserveTaggedTransaction(transaction)) return true

        val businessAccountIds = accounts
            .filter { it.purpose == TaxReserveAccountPurpose.BUSINESS || it.purpose == TaxReserveAccountPurpose.BOTH }
            .map { it.id }
            .toSet()
        if (businessAccountIds.isEmpty()) return true

        return transaction.accountId in businessAccountIds
    }

    private fun isTaxReserveTaggedTransaction(transaction: TaxReserveTransaction): Boolean {
        if (isSelfEmploymentIncomeTransaction(transaction)) return true

        val fields = transaction.customFields
        return fields["tax.deductibleStatus"] == "DEDUCTIBLE" ||
            fields["tax.deductible"] == "true" ||
            fields["tax.category"] == "SCHEDULE_C_EXPENSE"
    }

    private fun isSelfEmploymentIncomeTransaction(transaction: TaxReserveTransaction): Boolean {
        if (transaction.type != TaxReserveTransactionType.INCOME) return false
        val value = transaction.customFields["tax.selfEmploymentIncome"]
            ?: transaction.customFields["tax.selfEmployment"]
        return value == "true" || value == "1" || value == "yes"
    }

    private fun normalizeRateBreakdown(settings: TaxReserveSettings): TaxReserveRateBreakdown {
        val hasBreakdown = settings.federalRate != null || settings.stateRate != null || settings.selfEmploymentRate != null
        if (!hasBreakdown) {
            return TaxReserveRateBreakdown(
                federalRate = normalizeRate(settings.rate),
                stateRate = 0.0,
                selfEmploymentRate = 0.0,
            )
        }

        return TaxReserveRateBreakdown(
            federalRate = normalizeOptionalRate(settings.federalRate),
            stateRate = normalizeOptionalRate(settings.stateRate),
            selfEmploymentRate = normalizeOptionalRate(settings.selfEmploymentRate),
        )
    }

    private fun sumRateBreakdown(breakdown: TaxReserveRateBreakdown): Double =
        normalizeRate(breakdown.federalRate + breakdown.stateRate + breakdown.selfEmploymentRate)

    private fun getDueDateStatus(daysUntilDue: Int): QuarterlyDueDateStatus = when {
        daysUntilDue == 0 -> QuarterlyDueDateStatus.DUE_TODAY
        daysUntilDue <= 7 -> QuarterlyDueDateStatus.DUE_SOON
        else -> QuarterlyDueDateStatus.FUTURE
    }
}

@Serializable
data class GigTakeHomeInput(
    val grossIncomeCents: Cents,
    val businessExpenseCents: Cents = Cents.ZERO,
    /**
     * Mileage deductions for the period, produced by the canonical mileage package
     * (`com.finance.core.mileage.MileageCalculator`). The take-home math consumes only the
     * per-trip [MileageCalculation.deductionCents]; the IRS standard-rate table and deduction
     * math now live solely in `com.finance.core.mileage`.
     */
    val mileageDeductions: List<MileageCalculation> = emptyList(),
    val reserveRate: Double = TaxReserveCalculator.DEFAULT_TAX_RESERVE_RATE,
    val wagesCents: Cents = Cents.ZERO,
    val isMarriedFilingSeparately: Boolean = false,
)

@Serializable
data class GigTakeHomeResult(
    val grossIncomeCents: Cents,
    val businessExpenseCents: Cents,
    val mileageDeductionCents: Cents,
    val netSelfEmploymentIncomeCents: Cents,
    val estimatedTaxReserveCents: Cents,
    val estimatedSETax: SelfEmploymentTaxWithAdditionalMedicareResult,
    val takeHomeCents: Cents,
)

object GigTakeHomeCalculator {
    fun calculate(input: GigTakeHomeInput): GigTakeHomeResult {
        val mileageDeductionCents = Cents(input.mileageDeductions.sumOf { it.deductionCents })
        val deductibleExpenses = input.businessExpenseCents.amount.coerceAtLeast(0L) +
            mileageDeductionCents.amount.coerceAtLeast(0L)
        val netSelfEmploymentIncomeCents = Cents(
            (input.grossIncomeCents.amount.coerceAtLeast(0L) - deductibleExpenses).coerceAtLeast(0L),
        )
        val estimatedTaxReserveCents = TaxReserveCalculator.calculateRecommendedTaxReserveCents(
            netIncomeCents = netSelfEmploymentIncomeCents,
            rate = input.reserveRate,
        )
        val estimatedSETax = SelfEmploymentTaxCalculator.calculateSETaxWithAdditionalMedicare(
            netIncome = netSelfEmploymentIncomeCents,
            wages = input.wagesCents,
            isMarriedFilingSeparately = input.isMarriedFilingSeparately,
        )
        val cashNetIncome = input.grossIncomeCents.amount.coerceAtLeast(0L) - input.businessExpenseCents.amount.coerceAtLeast(0L)
        val takeHomeCents = Cents((cashNetIncome - estimatedTaxReserveCents.amount).coerceAtLeast(0L))

        return GigTakeHomeResult(
            grossIncomeCents = input.grossIncomeCents,
            businessExpenseCents = input.businessExpenseCents,
            mileageDeductionCents = mileageDeductionCents,
            netSelfEmploymentIncomeCents = netSelfEmploymentIncomeCents,
            estimatedTaxReserveCents = estimatedTaxReserveCents,
            estimatedSETax = estimatedSETax,
            takeHomeCents = takeHomeCents,
        )
    }
}

private fun normalizeRate(rate: Double): Double =
    if (rate.isFinite()) rate.coerceIn(0.0, 1.0) else TaxReserveCalculator.DEFAULT_TAX_RESERVE_RATE

private fun normalizeOptionalRate(rate: Double?): Double =
    if (rate != null && rate.isFinite()) rate.coerceIn(0.0, 1.0) else 0.0

private fun roundCents(value: Double): Cents = Cents(value.roundToLong())
