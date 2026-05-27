// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.liability

import com.finance.models.LiabilityInstallment
import com.finance.models.LiabilityInstallmentStatus
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class StackingRiskCalculatorTest {
    private val now = Instant.parse("2025-01-01T00:00:00Z")
    private val referenceDate = LocalDate(2025, 1, 1)

    @Test
    fun evaluate_returnsNoneWhenNoOutstandingInstallments() {
        val result = StackingRiskCalculator.evaluate(emptyList(), referenceDate)

        assertFalse(result.hasRisk)
        assertEquals(StackingRiskSeverity.NONE, result.severity)
    }

    @Test
    fun evaluate_alertsWhenExposureExceedsThreshold() {
        val result = StackingRiskCalculator.evaluate(
            installments = listOf(installment("i1", "l1", LocalDate(2025, 1, 5), 60_000L)),
            referenceDate = referenceDate,
            config = StackingRiskConfig(exposureThreshold = Cents(50_000L)),
        )

        assertTrue(result.hasRisk)
        assertEquals(StackingRiskSeverity.MEDIUM, result.severity)
        assertEquals(Cents(60_000L), result.totalExposure)
    }

    @Test
    fun evaluate_alertsWhenMultipleLiabilitiesCollideInsideWindow() {
        val result = StackingRiskCalculator.evaluate(
            installments = listOf(
                installment("i1", "l1", LocalDate(2025, 1, 5), 5_000L),
                installment("i2", "l2", LocalDate(2025, 1, 8), 6_000L),
            ),
            referenceDate = referenceDate,
            config = StackingRiskConfig(exposureThreshold = Cents(50_000L), collisionWindowDays = 7),
        )

        assertTrue(result.hasRisk)
        assertEquals(2, result.overlappingLiabilityCount)
        assertEquals(Cents(11_000L), result.windowExposure)
    }

    @Test
    fun evaluate_ignoresPaidDeletedAndOutOfWindowInstallments() {
        val paid = installment("i2", "l2", LocalDate(2025, 1, 8), 60_000L, LiabilityInstallmentStatus.PAID)
        val deleted = installment("i3", "l3", LocalDate(2025, 1, 9), 60_000L).copy(deletedAt = now)
        val future = installment("i4", "l4", LocalDate(2025, 3, 1), 60_000L)

        val result = StackingRiskCalculator.evaluate(
            installments = listOf(installment("i1", "l1", LocalDate(2025, 1, 5), 4_000L), paid, deleted, future),
            referenceDate = referenceDate,
            config = StackingRiskConfig(exposureThreshold = Cents(50_000L), lookAheadDays = 30),
        )

        assertFalse(result.hasRisk)
        assertEquals(1, result.dueInstallmentCount)
        assertEquals(Cents(4_000L), result.totalExposure)
    }

    private fun installment(
        id: String,
        liabilityId: String,
        dueDate: LocalDate,
        amount: Long,
        status: LiabilityInstallmentStatus = LiabilityInstallmentStatus.DUE,
    ): LiabilityInstallment = LiabilityInstallment(
        id = SyncId(id),
        liabilityId = SyncId(liabilityId),
        householdId = SyncId("hh-1"),
        ownerId = SyncId("user-1"),
        sequenceNumber = 1,
        dueDate = dueDate,
        amount = Cents(amount),
        currency = Currency.USD,
        status = status,
        paidAt = if (status == LiabilityInstallmentStatus.PAID) now else null,
        createdAt = now,
        updatedAt = now,
    )
}
