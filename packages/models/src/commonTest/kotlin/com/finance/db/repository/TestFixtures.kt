// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository

import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Budget
import com.finance.models.BudgetPeriod
import com.finance.models.Category
import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.Liability
import com.finance.models.LiabilityInstallment
import com.finance.models.LiabilityInstallmentStatus
import com.finance.models.LiabilityStatus
import com.finance.models.LiabilityType
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.TransactionStatus
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate

object TestFixtures {
    private val now = Clock.System.now()
    private val today = LocalDate(2025, 1, 15)

    fun account(id: String = "acc-001", householdId: String = "hh-001", ownerId: String = "user-001",
        name: String = "Checking", type: AccountType = AccountType.CHECKING,
        balance: Long = 150000L, isSynced: Boolean = false,
    ) = Account(SyncId(id), SyncId(householdId), SyncId(ownerId), name, type,
        Currency.USD, Cents(balance), false, 0, null, null, now, now, null, 0, isSynced)

    fun transaction(id: String = "txn-001", accountId: String = "acc-001",
        amount: Long = -5000L, type: TransactionType = TransactionType.EXPENSE,
        date: LocalDate = today, isSynced: Boolean = false,
    ) = Transaction(SyncId(id), SyncId("hh-001"), SyncId("user-001"), SyncId(accountId),
        SyncId("cat-001"), type, TransactionStatus.CLEARED, Cents(amount), Currency.USD,
        "Payee", null, date, null, null, false, null, emptyList(), now, now, null, 0, isSynced)

    fun budget(id: String = "bgt-001", name: String = "Food Budget",
        amount: Long = 50000L, isSynced: Boolean = false,
    ) = Budget(SyncId(id), SyncId("hh-001"), SyncId("user-001"), SyncId("cat-001"),
        name, Cents(amount), Currency.USD, BudgetPeriod.MONTHLY, LocalDate(2025, 1, 1),
        null, false, now, now, null, 0, isSynced)

    fun goal(id: String = "goal-001", name: String = "Emergency Fund",
        target: Long = 1000000L, current: Long = 250000L, isSynced: Boolean = false,
    ) = Goal(SyncId(id), SyncId("hh-001"), SyncId("user-001"), name, Cents(target),
        Cents(current), Currency.USD, LocalDate(2025, 12, 31), GoalStatus.ACTIVE,
        null, null, null, now, now, null, 0, isSynced)

    fun category(id: String = "cat-001", name: String = "Food & Dining",
        isIncome: Boolean = false, isSynced: Boolean = false,
    ) = Category(SyncId(id), SyncId("hh-001"), SyncId("user-001"), name,
        null, null, null, isIncome, false, 0, false, now, now, null, 0, isSynced)

    fun liability(id: String = "lia-001", remainingBalance: Long = 7500L,
        status: LiabilityStatus = LiabilityStatus.ACTIVE,
    ) = Liability(SyncId(id), SyncId("hh-001"), SyncId("user-001"), LiabilityType.BNPL,
        status, "Klarna", "Store", Cents(10000L), Cents(remainingBalance), Currency.USD,
        LocalDate(2025, 1, 1), null, null, null, now, now)

    fun liabilityInstallment(id: String = "lin-001", liabilityId: String = "lia-001",
        dueDate: LocalDate = today, amount: Long = 2500L,
        status: LiabilityInstallmentStatus = LiabilityInstallmentStatus.DUE,
    ) = LiabilityInstallment(SyncId(id), SyncId(liabilityId), SyncId("hh-001"), SyncId("user-001"),
        1, dueDate, Cents(amount), Currency.USD, status,
        if (status == LiabilityInstallmentStatus.PAID) now else null, null, now, now)
}
