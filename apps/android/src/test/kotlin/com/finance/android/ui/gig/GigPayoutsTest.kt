// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Unit tests for [GigPayouts] platform grouping (#2133). */
class GigPayoutsTest {

    private val hh = SyncId("hh-1")
    private val now = Instant.fromEpochMilliseconds(1_700_000_000_000L)

    private fun txn(
        id: String,
        payee: String?,
        amountCents: Long,
        type: TransactionType = TransactionType.INCOME,
        date: LocalDate = LocalDate(2024, 1, 10),
        deleted: Instant? = null,
    ) = Transaction(
        id = SyncId(id),
        householdId = hh,
        ownerId = hh,
        accountId = SyncId("acc-1"),
        type = type,
        amount = Cents(amountCents),
        currency = Currency.USD,
        payee = payee,
        date = date,
        createdAt = now,
        updatedAt = now,
        deletedAt = deleted,
    )

    @Test
    fun `groups income by platform and sums totals`() {
        val txns = listOf(
            txn("1", "UBER", 4_000),
            txn("2", "UBER", 2_500),
            txn("3", "DOORDASH", 1_800),
        )
        val groups = GigPayouts.group(txns)
        val uber = groups.first { it.platform == GigPlatform.UBER }
        assertEquals(6_500L, uber.totalCents.amount)
        assertEquals(2, uber.payoutCount)
        // Biggest earner (Uber) sorts before DoorDash.
        assertEquals(GigPlatform.UBER, groups.first().platform)
    }

    @Test
    fun `ignores expenses and deleted rows`() {
        val txns = listOf(
            txn("1", "UBER", 4_000),
            txn("2", "UBER RIDE PAID", -1_500, type = TransactionType.EXPENSE),
            txn("3", "UBER", 1_000, deleted = now),
        )
        val total = GigPayouts.totalCents(txns)
        assertEquals(4_000L, total.amount)
    }

    @Test
    fun `unmatched income is grouped under OTHER and sorted last`() {
        val txns = listOf(
            txn("1", "UBER", 1_000),
            txn("2", "Mystery Deposit", 9_999),
        )
        val groups = GigPayouts.group(txns)
        assertEquals(GigPlatform.OTHER, groups.last().platform)
        assertTrue(groups.any { it.platform == GigPlatform.UBER })
    }

    @Test
    fun `empty input yields empty groups and zero total`() {
        assertTrue(GigPayouts.group(emptyList()).isEmpty())
        assertEquals(0L, GigPayouts.totalCents(emptyList()).amount)
    }
}
