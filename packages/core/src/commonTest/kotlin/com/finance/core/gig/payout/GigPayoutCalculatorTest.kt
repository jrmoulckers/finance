// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.gig.payout

import com.finance.core.TestFixtures
import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GigPayoutCalculatorTest {
    private val june1 = LocalDate(2024, 6, 1)
    private val june7 = LocalDate(2024, 6, 7)
    private val june15 = LocalDate(2024, 6, 15)
    private val june30 = LocalDate(2024, 6, 30)

    @Test
    fun matcher_matchesPayeeCaseInsensitively() {
        val match = GigPayoutCalculator.matchPlatform(
            GigPayoutMatchInput(payee = "UBER TECHNOLOGIES PAYMENT"),
            GigPlatformDefaults.mappings,
        )

        assertNotNull(match)
        assertEquals("uber", match.platformId)
        assertTrue(GigPayoutMatchField.PAYEE in match.matchedFields)
    }

    @Test
    fun matcher_usesDescriptionAndAccountSignals() {
        val match = GigPayoutCalculator.matchPlatform(
            GigPayoutMatchInput(
                payee = "Stripe Transfer",
                description = "Weekly Dasher payout",
                accountName = "DoorDash Business Checking",
            ),
            GigPlatformDefaults.mappings,
        )

        assertNotNull(match)
        assertEquals("doordash", match.platformId)
        assertTrue(GigPayoutMatchField.DESCRIPTION in match.matchedFields)
        assertTrue(GigPayoutMatchField.ACCOUNT in match.matchedFields)
    }

    @Test
    fun matcher_returnsNullWhenNoMappingMatches() {
        val match = GigPayoutCalculator.matchPlatform(
            GigPayoutMatchInput(payee = "ACME Payroll"),
            GigPlatformDefaults.mappings,
        )

        assertNull(match)
    }

    @Test
    fun defaultMappings_matchWebMerchantSeedFixtures() {
        val webFixturePayees = mapOf(
            "Uber" to "uber",
            "Lyft" to "lyft",
            "DoorDash" to "doordash",
        )

        webFixturePayees.forEach { (payee, expectedPlatformId) ->
            val match = GigPayoutCalculator.matchPlatform(
                GigPayoutMatchInput(payee = payee),
                GigPlatformDefaults.mappings,
            )
            assertEquals(expectedPlatformId, match?.platformId)
        }
    }

    @Test
    fun groupIncomeByPlatform_groupsOnlyEligibleIncomeAndUsesIntegerCents() {
        val transactions = listOf(
            income("uber-1", Cents(101), june1, payee = "Uber"),
            income("uber-2", Cents(202), june7, payee = "UBER BV"),
            income("lyft-1", Cents(-303), june15, payee = "Lyft"),
            expense("uber-expense", Cents(999), june15, payee = "Uber"),
            income("void", Cents(999), june15, payee = "Uber", status = TransactionStatus.VOID),
            income("deleted", Cents(999), june15, payee = "Uber", deleted = true),
            income("outside", Cents(999), LocalDate(2024, 7, 1), payee = "Uber"),
        )

        val groups = GigPayoutCalculator.groupIncomeByPlatform(
            transactions = transactions,
            mappings = GigPlatformDefaults.mappings,
            from = june1,
            to = june30,
        )

        val uber = groups.single { it.platformId == "uber" }
        val lyft = groups.single { it.platformId == "lyft" }
        assertEquals(Cents(303), uber.totalReceived)
        assertEquals(2, uber.transactionCount)
        assertEquals(Cents(303), lyft.totalReceived)
        assertEquals(1, lyft.transactionCount)
    }

    @Test
    fun groupIncomeByPlatform_canIncludeAndExcludeUnmatchedIncome() {
        val transactions = listOf(
            income("unknown", Cents(5000), june15, payee = "Client ACH"),
        )

        val withUnmatched = GigPayoutCalculator.groupIncomeByPlatform(
            transactions,
            GigPlatformDefaults.mappings,
        )
        val withoutUnmatched = GigPayoutCalculator.groupIncomeByPlatform(
            transactions,
            GigPlatformDefaults.mappings,
            includeUnmatched = false,
        )

        assertEquals(1, withUnmatched.size)
        assertNull(withUnmatched.single().platformId)
        assertEquals(GigPayoutCalculator.UNMATCHED_PLATFORM_NAME, withUnmatched.single().platformName)
        assertEquals(Cents(5000), withUnmatched.single().totalReceived)
        assertTrue(withoutUnmatched.isEmpty())
    }

    @Test
    fun groupIncomeByPlatform_emptyInputReturnsEmpty() {
        assertTrue(
            GigPayoutCalculator.groupIncomeByPlatform(emptyList(), GigPlatformDefaults.mappings).isEmpty(),
        )
    }

    @Test
    fun receivedPayoutsFromTransactions_returnsOnlyMatchedIncome() {
        val accountId = SyncId("uber-account")
        val transactions = listOf(
            income("matched-by-account", Cents(12500), june15, payee = "ACH Credit", accountId = accountId),
            income("unmatched", Cents(9000), june15, payee = "Client ACH"),
        )

        val received = GigPayoutCalculator.receivedPayoutsFromTransactions(
            transactions = transactions,
            mappings = GigPlatformDefaults.mappings,
            accountNamesById = mapOf(accountId to "Uber Driver Checking"),
        )

        assertEquals(1, received.size)
        assertEquals("uber", received.single().platformId)
        assertEquals(Cents(12500), received.single().amount)
    }

    @Test
    fun reconcile_matchesExpectedToReceivedWithinOneCentTolerance() {
        val reconciliation = GigPayoutCalculator.reconcile(
            expectedPayouts = listOf(expected("uber-week-1", "uber", Cents(10000), june7)),
            receivedPayouts = listOf(received("tx-1", "uber", Cents(9999), june7)),
            defaultToleranceCents = Cents(1),
        )

        val item = reconciliation.items.single()
        assertEquals(GigPayoutReconciliationStatus.MATCHED, item.status)
        assertEquals(Cents(9999), item.receivedAmount)
        assertEquals(Cents(-1), item.variance)
        assertEquals(Cents(10000), reconciliation.totalExpected)
        assertEquals(Cents(9999), reconciliation.totalReceived)
    }

    @Test
    fun reconcile_combinesPartialPayoutsIntoMatchedExpectedPayout() {
        val reconciliation = GigPayoutCalculator.reconcile(
            expectedPayouts = listOf(expected("dd-week-1", "doordash", Cents(10000), june15)),
            receivedPayouts = listOf(
                received("tx-1", "doordash", Cents(6000), june15),
                received("tx-2", "doordash", Cents(4000), june15),
            ),
        )

        val item = reconciliation.items.single()
        assertEquals(GigPayoutReconciliationStatus.MATCHED, item.status)
        assertEquals(Cents(10000), item.receivedAmount)
        assertEquals(listOf("tx-1", "tx-2"), item.received.map { it.id })
    }

    @Test
    fun reconcile_reportsPartialMissingOverpaidAndUnexpectedPayouts() {
        val reconciliation = GigPayoutCalculator.reconcile(
            expectedPayouts = listOf(
                expected("uber-week", "uber", Cents(10000), june7),
                expected("lyft-week", "lyft", Cents(5000), june7),
                expected("dd-week", "doordash", Cents(8000), june15),
            ),
            receivedPayouts = listOf(
                received("uber-partial", "uber", Cents(6000), june7),
                received("dd-over", "doordash", Cents(9000), june15),
                received("instacart-extra", "instacart", Cents(7000), june15),
            ),
        )

        val byExpectedId = reconciliation.items.associateBy { it.expected.id }
        assertEquals(GigPayoutReconciliationStatus.PARTIAL, byExpectedId.getValue("uber-week").status)
        assertEquals(Cents(-4000), byExpectedId.getValue("uber-week").variance)
        assertEquals(GigPayoutReconciliationStatus.MISSING, byExpectedId.getValue("lyft-week").status)
        assertEquals(Cents(-5000), byExpectedId.getValue("lyft-week").variance)
        assertEquals(GigPayoutReconciliationStatus.OVERPAID, byExpectedId.getValue("dd-week").status)
        assertEquals(Cents(1000), byExpectedId.getValue("dd-week").variance)
        assertEquals(listOf("instacart-extra"), reconciliation.unexpectedReceived.map { it.received.id })
    }

    @Test
    fun reconcile_respectsDateToleranceAndDoesNotCrossPlatforms() {
        val reconciliation = GigPayoutCalculator.reconcile(
            expectedPayouts = listOf(expected("uber-week", "uber", Cents(10000), june7)),
            receivedPayouts = listOf(
                received("wrong-platform", "lyft", Cents(10000), june7),
                received("right-platform", "uber", Cents(10000), LocalDate(2024, 6, 8)),
            ),
            dateToleranceDays = 1,
        )

        assertEquals(GigPayoutReconciliationStatus.MATCHED, reconciliation.items.single().status)
        assertEquals(listOf("right-platform"), reconciliation.items.single().received.map { it.id })
        assertEquals(listOf("wrong-platform"), reconciliation.unexpectedReceived.map { it.received.id })
    }

    @Test
    fun serializesMappingAndReconciliationRoundTrip() {
        val json = Json { encodeDefaults = true }
        val mapping = GigPlatformMapping(
            platformId = "taskrabbit",
            displayName = "Taskrabbit",
            payeePatterns = listOf("Taskrabbit"),
            descriptionPatterns = listOf("Taskrabbit payout"),
        )
        val decodedMapping = json.decodeFromString<GigPlatformMapping>(json.encodeToString(mapping))
        assertEquals(mapping, decodedMapping)

        val reconciliation = GigPayoutCalculator.reconcile(
            expectedPayouts = listOf(expected("upwork-week", "upwork", Cents(12345), june15)),
            receivedPayouts = listOf(received("upwork-tx", "upwork", Cents(12345), june15)),
        )
        val decoded = json.decodeFromString<GigPayoutReconciliation>(json.encodeToString(reconciliation))
        assertEquals(reconciliation, decoded)
    }

    @Test
    fun validationRejectsInvalidMappingsAndReconciliationOptions() {
        assertFailsWithMessage("At least one matching pattern is required") {
            GigPlatformMapping(platformId = "bad", displayName = "Bad")
        }
        assertFailsWithMessage("dateToleranceDays must be non-negative") {
            GigPayoutCalculator.reconcile(
                expectedPayouts = emptyList(),
                receivedPayouts = emptyList(),
                dateToleranceDays = -1,
            )
        }
    }

    private fun expected(
        id: String,
        platformId: String,
        amount: Cents,
        date: LocalDate,
    ): ExpectedGigPayout = ExpectedGigPayout(
        id = id,
        platformId = platformId,
        expectedAmount = amount,
        expectedDate = date,
    )

    private fun received(
        id: String,
        platformId: String,
        amount: Cents,
        date: LocalDate,
    ): ReceivedGigPayout = ReceivedGigPayout(
        id = id,
        platformId = platformId,
        amount = amount,
        receivedDate = date,
        transactionId = SyncId(id),
    )

    private fun income(
        id: String,
        amount: Cents,
        date: LocalDate,
        payee: String?,
        note: String? = null,
        accountId: SyncId = SyncId("account-1"),
        status: TransactionStatus = TransactionStatus.CLEARED,
        deleted: Boolean = false,
    ): Transaction = TestFixtures.createTransaction(
        id = SyncId(id),
        accountId = accountId,
        type = TransactionType.INCOME,
        status = status,
        amount = amount,
        currency = Currency.USD,
        payee = payee,
        note = note,
        date = date,
        deletedAt = if (deleted) TestFixtures.fixedInstant else null,
    )

    private fun expense(
        id: String,
        amount: Cents,
        date: LocalDate,
        payee: String?,
    ): Transaction = TestFixtures.createTransaction(
        id = SyncId(id),
        type = TransactionType.EXPENSE,
        amount = amount,
        currency = Currency.USD,
        payee = payee,
        date = date,
    )

    private inline fun assertFailsWithMessage(
        expectedMessage: String,
        block: () -> Unit,
    ) {
        val failure = kotlin.test.assertFailsWith<IllegalArgumentException>(block = block)
        assertEquals(expectedMessage, failure.message)
    }
}
