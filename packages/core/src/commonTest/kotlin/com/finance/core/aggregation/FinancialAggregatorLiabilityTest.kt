// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.aggregation

import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Liability
import com.finance.models.LiabilityInstallment
import com.finance.models.LiabilityInstallmentStatus
import com.finance.models.LiabilityStatus
import com.finance.models.LiabilityType
import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

class FinancialAggregatorLiabilityTest {
    private val now = Instant.parse("2025-01-01T00:00:00Z")

    @Test
    fun netWorth_subtractsActiveFirstClassLiabilities() {
        val accounts = listOf(account("checking", AccountType.CHECKING, 100_000L))
        val liabilities = listOf(liability("bnpl", 25_000L))

        assertEquals(Cents(75_000L), FinancialAggregator.netWorth(accounts, liabilities))
    }

    @Test
    fun netWorth_ignoresClosedLiabilities() {
        val accounts = listOf(account("checking", AccountType.CHECKING, 100_000L))
        val liabilities = listOf(liability("bnpl", 25_000L, LiabilityStatus.CLOSED))

        assertEquals(Cents(100_000L), FinancialAggregator.netWorth(accounts, liabilities))
    }

    @Test
    fun netCashFlow_subtractsOutstandingInstallmentsDueInRange() {
        val transactions = listOf(transaction("income", 200_000L, TransactionType.INCOME))
        val installments = listOf(
            installment("one", LocalDate(2025, 1, 5), 30_000L),
            installment("two", LocalDate(2025, 2, 5), 30_000L),
        )

        val cashFlow = FinancialAggregator.netCashFlow(
            transactions,
            installments,
            LocalDate(2025, 1, 1),
            LocalDate(2025, 1, 31),
        )

        assertEquals(Cents(170_000L), cashFlow)
    }

    private fun account(id: String, type: AccountType, balance: Long): Account = Account(
        SyncId(id), SyncId("hh-1"), SyncId("user-1"), id, type, Currency.USD, Cents(balance),
        false, 0, null, null, now, now,
    )

    private fun liability(id: String, remainingBalance: Long, status: LiabilityStatus = LiabilityStatus.ACTIVE): Liability =
        Liability(
            SyncId(id), SyncId("hh-1"), SyncId("user-1"), LiabilityType.BNPL, status,
            "Klarna", "Store", Cents(50_000L), Cents(remainingBalance), Currency.USD,
            LocalDate(2025, 1, 1), null, null, null, now, now,
        )

    private fun transaction(id: String, amount: Long, type: TransactionType): Transaction = Transaction(
        SyncId(id), SyncId("hh-1"), SyncId("user-1"), SyncId("checking"), null, type,
        TransactionStatus.CLEARED, Cents(amount), Currency.USD, "Employer", null,
        LocalDate(2025, 1, 10), null, null, false, null, emptyList(), now, now,
    )

    private fun installment(id: String, dueDate: LocalDate, amount: Long): LiabilityInstallment = LiabilityInstallment(
        SyncId(id), SyncId("bnpl"), SyncId("hh-1"), SyncId("user-1"), 1, dueDate,
        Cents(amount), Currency.USD, LiabilityInstallmentStatus.DUE, null, null, now, now,
    )
}
