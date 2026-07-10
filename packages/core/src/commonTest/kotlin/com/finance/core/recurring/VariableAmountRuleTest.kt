// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Tests for variable-amount recurring rules and forecasts (#3729). */
class VariableAmountRuleTest {

    private val fixedInstant: Instant = Instant.parse("2024-06-15T12:00:00Z")

    private fun rule(
        estimate: Long,
        isVariable: Boolean = false,
        overrides: Map<LocalDate, Cents> = emptyMap(),
        frequency: RecurrenceFrequency = RecurrenceFrequency.MONTHLY,
        startDate: LocalDate = LocalDate(2024, 1, 15),
    ) = RecurringTransactionRule(
        id = SyncId("rule-1"),
        ownerId = SyncId("owner-1"),
        householdId = SyncId("household-1"),
        merchant = "Electric Co",
        amount = Cents(estimate),
        isVariable = isVariable,
        amountOverrides = overrides,
        currency = Currency.USD,
        accountId = SyncId("account-1"),
        recurrenceRule = RecurrenceRule(
            id = SyncId("rec-1"),
            frequency = frequency,
            startDate = startDate,
            dayOfMonth = 15,
        ),
        nextDueDate = LocalDate(2024, 7, 15),
        createdAt = fixedInstant,
        updatedAt = fixedInstant,
    )

    @Test
    fun fixedRule_alwaysReturnsEstimate() {
        val r = rule(estimate = 5000, isVariable = false, overrides = mapOf(LocalDate(2024, 7, 15) to Cents(9999)))
        // Non-variable rules ignore overrides entirely.
        assertFalse(r.isVariable)
        assertEquals(Cents(5000), r.amountFor(LocalDate(2024, 7, 15)))
    }

    @Test
    fun variableRule_usesOverrideWhenPresent() {
        val r = rule(
            estimate = 5000,
            isVariable = true,
            overrides = mapOf(LocalDate(2024, 7, 15) to Cents(7350)),
        )
        assertEquals(Cents(7350), r.amountFor(LocalDate(2024, 7, 15)))
    }

    @Test
    fun variableRule_fallsBackToEstimateWhenNoOverride() {
        val r = rule(estimate = 5000, isVariable = true, overrides = mapOf(LocalDate(2024, 7, 15) to Cents(7350)))
        assertEquals(Cents(5000), r.amountFor(LocalDate(2024, 8, 15)))
    }

    @Test
    fun calendarForecast_usesOverridePerOccurrence() {
        val r = rule(
            estimate = 5000,
            isVariable = true,
            overrides = mapOf(LocalDate(2024, 7, 15) to Cents(8200)),
        )

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(r),
            year = 2024,
            month = 7,
            today = LocalDate(2024, 7, 1),
        )

        val entry = calendar.days.flatMap { it.bills }.single { it.dueDate == LocalDate(2024, 7, 15) }
        assertEquals(Cents(8200), entry.amount)
        assertEquals(Cents(8200), calendar.totalDue)
    }

    @Test
    fun calendarForecast_usesEstimateWhenNoOverride() {
        val r = rule(estimate = 5000, isVariable = true) // no overrides

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(r),
            year = 2024,
            month = 7,
            today = LocalDate(2024, 7, 1),
        )

        val entry = calendar.days.flatMap { it.bills }.single { it.dueDate == LocalDate(2024, 7, 15) }
        assertEquals(Cents(5000), entry.amount)
    }

    @Test
    fun overridesStayInIntegerCents() {
        val r = rule(estimate = 5000, isVariable = true, overrides = mapOf(LocalDate(2024, 7, 15) to Cents(12345)))
        val amount = r.amountFor(LocalDate(2024, 7, 15))
        assertTrue(amount.amount == 12345L)
    }
}
