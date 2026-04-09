// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.*
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlin.test.*

class DataImportServiceTest {

    private val testHouseholdId = SyncId("household-test")

    // ═════════════════════════════════════════════════════════════════
    // Empty / invalid input
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun importCsv_emptyString_returnsFailure() {
        val outcome = DataImportService.importCsv("")
        assertTrue(outcome is ImportOutcome.Failure)
        assertTrue((outcome as ImportOutcome.Failure).error is ImportError.EmptyFile)
    }

    @Test
    fun importCsv_blankString_returnsFailure() {
        val outcome = DataImportService.importCsv("   \n  ")
        assertTrue(outcome is ImportOutcome.Failure)
        assertTrue((outcome as ImportOutcome.Failure).error is ImportError.EmptyFile)
    }

    @Test
    fun importCsv_headerOnly_returnsFailure() {
        val outcome = DataImportService.importCsv("date,amount,description")
        assertTrue(outcome is ImportOutcome.Failure)
        val error = (outcome as ImportOutcome.Failure).error
        assertTrue(error is ImportError.EmptyFile)
    }

    // ═════════════════════════════════════════════════════════════════
    // Flat transaction CSV (bank statement import)
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun importCsv_flatTransactions_parsesCorrectly() {
        val csv = buildString {
            append("date,amount,description\n")
            append("2024-06-15,25.00,Grocery Store\n")
            append("2024-06-16,-12.50,Coffee Shop\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)

        assertTrue(outcome is ImportOutcome.Success)
        val result = (outcome as ImportOutcome.Success).result

        assertEquals(2, result.data.transactions.size)
        assertEquals(2, result.stats.successfulRows)
        assertEquals(0, result.stats.skippedRows)
        assertEquals(2, result.stats.totalRows)

        // Other entity lists should be empty
        assertTrue(result.data.accounts.isEmpty())
        assertTrue(result.data.categories.isEmpty())
        assertTrue(result.data.budgets.isEmpty())
        assertTrue(result.data.goals.isEmpty())
    }

    @Test
    fun importCsv_flatTransactions_parsesAmountCorrectly() {
        val csv = "date,amount,payee\n2024-06-15,25.50,Store\n"

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val txn = (outcome as ImportOutcome.Success).result.data.transactions.first()
        assertEquals(Cents(2550), txn.amount)
    }

    @Test
    fun importCsv_flatTransactions_infersTypeFromAmount() {
        val csv = buildString {
            append("date,amount,description\n")
            append("2024-06-15,100.00,Salary\n")       // positive → INCOME
            append("2024-06-16,-25.00,Coffee\n")        // negative → EXPENSE
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val txns = (outcome as ImportOutcome.Success).result.data.transactions
        assertEquals(TransactionType.INCOME, txns[0].type)
        assertEquals(TransactionType.EXPENSE, txns[1].type)
    }

    @Test
    fun importCsv_flatTransactions_flexibleColumnNames() {
        // Using alternative column names
        val csv = "transaction_date,value,merchant,memo\n2024-06-15,30.00,Amazon,Online Order\n"

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val txn = (outcome as ImportOutcome.Success).result.data.transactions.first()
        assertEquals("Amazon", txn.payee)
        assertEquals("Online Order", txn.note)
    }

    @Test
    fun importCsv_flatTransactions_usesDefaultCurrency() {
        val csv = "date,amount,description\n2024-06-15,10.00,Test\n"

        val outcome = DataImportService.importCsv(csv, defaultCurrency = Currency.EUR)
        assertTrue(outcome is ImportOutcome.Success)

        val txn = (outcome as ImportOutcome.Success).result.data.transactions.first()
        assertEquals(Currency.EUR, txn.currency)
    }

    @Test
    fun importCsv_flatTransactions_skipsInvalidRows() {
        val csv = buildString {
            append("date,amount,description\n")
            append("2024-06-15,25.00,Valid Row\n")
            append("not-a-date,10.00,Invalid Date\n")
            append("2024-06-17,0,Zero Amount\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val result = (outcome as ImportOutcome.Success).result
        assertEquals(1, result.data.transactions.size) // only the valid row
        assertEquals(2, result.stats.skippedRows)
        assertTrue(result.warnings.isNotEmpty())
    }

    @Test
    fun importCsv_flatTransactions_allRowsInvalid_returnsFailure() {
        val csv = "date,amount,description\nnot-a-date,abc,Bad\n"

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Failure)
        val error = (outcome as ImportOutcome.Failure).error
        assertTrue(error is ImportError.InvalidFormat)
    }

    @Test
    fun importCsv_flatTransactions_usesHouseholdId() {
        val csv = "date,amount,description\n2024-06-15,10.00,Test\n"

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val txn = (outcome as ImportOutcome.Success).result.data.transactions.first()
        assertEquals(testHouseholdId, txn.householdId)
    }

    // ═════════════════════════════════════════════════════════════════
    // Multi-section CSV (round-trip from export)
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun importCsv_multiSection_parsesAccounts() {
        val csv = buildString {
            append("# ACCOUNTS\r\n")
            append("id,household_id,name,type,currency,current_balance,is_archived,sort_order,icon,color,created_at,updated_at,deleted_at\r\n")
            append("acc-1,hh-1,Checking,CHECKING,USD,100.00,false,0,,,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val result = (outcome as ImportOutcome.Success).result
        assertEquals(1, result.data.accounts.size)

        val account = result.data.accounts.first()
        assertEquals("acc-1", account.id.value)
        assertEquals("Checking", account.name)
        assertEquals(AccountType.CHECKING, account.type)
        assertEquals(Currency.USD, account.currency)
        assertEquals(Cents(10000), account.currentBalance)
        assertEquals(false, account.isArchived)
    }

    @Test
    fun importCsv_multiSection_parsesTransactions() {
        val csv = buildString {
            append("# TRANSACTIONS\r\n")
            append("id,household_id,account_id,category_id,type,status,amount,currency,payee,note,date,transfer_account_id,transfer_transaction_id,is_recurring,recurring_rule_id,tags,created_at,updated_at,deleted_at\r\n")
            append("txn-1,hh-1,acc-1,cat-1,EXPENSE,CLEARED,25.00,USD,Grocery Store,Weekly groceries,2024-06-15,,,,false,,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val result = (outcome as ImportOutcome.Success).result
        assertEquals(1, result.data.transactions.size)

        val txn = result.data.transactions.first()
        assertEquals("txn-1", txn.id.value)
        assertEquals("acc-1", txn.accountId.value)
        assertEquals(TransactionType.EXPENSE, txn.type)
        assertEquals(Cents(2500), txn.amount)
        assertEquals("Grocery Store", txn.payee)
        assertEquals("Weekly groceries", txn.note)
    }

    @Test
    fun importCsv_multiSection_parsesCategories() {
        val csv = buildString {
            append("# CATEGORIES\r\n")
            append("id,household_id,name,icon,color,parent_id,is_income,is_system,sort_order,created_at,updated_at,deleted_at\r\n")
            append("cat-1,hh-1,Groceries,🛒,,,,false,false,0,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val result = (outcome as ImportOutcome.Success).result
        assertEquals(1, result.data.categories.size)

        val category = result.data.categories.first()
        assertEquals("cat-1", category.id.value)
        assertEquals("Groceries", category.name)
    }

    @Test
    fun importCsv_multiSection_parsesBudgets() {
        val csv = buildString {
            append("# BUDGETS\r\n")
            append("id,household_id,category_id,name,amount,currency,period,start_date,end_date,is_rollover,created_at,updated_at,deleted_at\r\n")
            append("bud-1,hh-1,cat-1,Food Budget,500.00,USD,MONTHLY,2024-06-01,,false,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val result = (outcome as ImportOutcome.Success).result
        assertEquals(1, result.data.budgets.size)

        val budget = result.data.budgets.first()
        assertEquals("bud-1", budget.id.value)
        assertEquals("Food Budget", budget.name)
        assertEquals(Cents(50000), budget.amount)
        assertEquals(BudgetPeriod.MONTHLY, budget.period)
    }

    @Test
    fun importCsv_multiSection_parsesGoals() {
        val csv = buildString {
            append("# GOALS\r\n")
            append("id,household_id,name,target_amount,current_amount,currency,target_date,status,icon,color,account_id,created_at,updated_at,deleted_at\r\n")
            append("goal-1,hh-1,Emergency Fund,1000.00,250.00,USD,,ACTIVE,,,acc-1,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val result = (outcome as ImportOutcome.Success).result
        assertEquals(1, result.data.goals.size)

        val goal = result.data.goals.first()
        assertEquals("goal-1", goal.id.value)
        assertEquals("Emergency Fund", goal.name)
        assertEquals(Cents(100000), goal.targetAmount)
        assertEquals(Cents(25000), goal.currentAmount)
        assertEquals(GoalStatus.ACTIVE, goal.status)
        assertEquals("acc-1", goal.accountId?.value)
    }

    @Test
    fun importCsv_multiSection_allEntityTypes() {
        val csv = buildString {
            append("# METADATA\r\n")
            append("key,value\r\n")
            append("export_date,2024-06-15T12:00:00Z\r\n")
            append("\r\n")
            append("# ACCOUNTS\r\n")
            append("id,household_id,name,type,currency,current_balance,is_archived,sort_order,icon,color,created_at,updated_at,deleted_at\r\n")
            append("acc-1,hh-1,Checking,CHECKING,USD,100.00,false,0,,,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
            append("\r\n")
            append("# TRANSACTIONS\r\n")
            append("id,household_id,account_id,category_id,type,status,amount,currency,payee,note,date,transfer_account_id,transfer_transaction_id,is_recurring,recurring_rule_id,tags,created_at,updated_at,deleted_at\r\n")
            append("txn-1,hh-1,acc-1,cat-1,EXPENSE,CLEARED,25.00,USD,Store,,2024-06-15,,,,false,,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
            append("\r\n")
            append("# CATEGORIES\r\n")
            append("id,household_id,name,icon,color,parent_id,is_income,is_system,sort_order,created_at,updated_at,deleted_at\r\n")
            append("cat-1,hh-1,Food,,,,,false,false,0,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
            append("\r\n")
            append("# BUDGETS\r\n")
            append("id,household_id,category_id,name,amount,currency,period,start_date,end_date,is_rollover,created_at,updated_at,deleted_at\r\n")
            append("bud-1,hh-1,cat-1,Food Budget,500.00,USD,MONTHLY,2024-06-01,,false,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
            append("\r\n")
            append("# GOALS\r\n")
            append("id,household_id,name,target_amount,current_amount,currency,target_date,status,icon,color,account_id,created_at,updated_at,deleted_at\r\n")
            append("goal-1,hh-1,Savings Goal,1000.00,250.00,USD,,ACTIVE,,,,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val result = (outcome as ImportOutcome.Success).result
        assertEquals(1, result.data.accounts.size)
        assertEquals(1, result.data.transactions.size)
        assertEquals(1, result.data.categories.size)
        assertEquals(1, result.data.budgets.size)
        assertEquals(1, result.data.goals.size)

        val stats = result.stats
        assertEquals(5, stats.totalRows)
        assertEquals(5, stats.successfulRows)
        assertEquals(0, stats.skippedRows)
    }

    @Test
    fun importCsv_multiSection_emptyDataSections_returnsFailure() {
        val csv = buildString {
            append("# METADATA\r\n")
            append("key,value\r\n")
            append("export_date,2024-06-15T12:00:00Z\r\n")
            append("\r\n")
            append("# ACCOUNTS\r\n")
            append("id,name\r\n")
            // No data rows in any section
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Failure)
    }

    @Test
    fun importCsv_multiSection_missingRequiredFields_skipsRow() {
        val csv = buildString {
            append("# ACCOUNTS\r\n")
            append("id,household_id,name,type,currency,current_balance,is_archived,sort_order,icon,color,created_at,updated_at,deleted_at\r\n")
            append(",hh-1,,CHECKING,USD,100.00,false,0,,,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n") // missing id and name
            append("acc-2,hh-1,Savings,SAVINGS,USD,500.00,false,1,,,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val result = (outcome as ImportOutcome.Success).result
        assertEquals(1, result.data.accounts.size) // only second row succeeds
        assertEquals(1, result.stats.skippedRows)
        assertTrue(result.warnings.isNotEmpty())
    }

    @Test
    fun importCsv_multiSection_transactionWithTags() {
        val csv = buildString {
            append("# TRANSACTIONS\r\n")
            append("id,household_id,account_id,category_id,type,status,amount,currency,payee,note,date,transfer_account_id,transfer_transaction_id,is_recurring,recurring_rule_id,tags,created_at,updated_at,deleted_at\r\n")
            append("txn-1,hh-1,acc-1,,EXPENSE,CLEARED,25.00,USD,Store,,2024-06-15,,,false,,food;groceries;weekly,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val txn = (outcome as ImportOutcome.Success).result.data.transactions.first()
        assertEquals(listOf("food", "groceries", "weekly"), txn.tags)
    }

    @Test
    fun importCsv_multiSection_defaultsOptionalFields() {
        val csv = buildString {
            append("# ACCOUNTS\r\n")
            append("id,name,created_at,updated_at\r\n")
            append("acc-1,Checking,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z\r\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val account = (outcome as ImportOutcome.Success).result.data.accounts.first()
        assertEquals("acc-1", account.id.value)
        assertEquals("Checking", account.name)
        assertEquals(AccountType.OTHER, account.type) // defaulted
        assertEquals(testHouseholdId, account.householdId) // defaulted from parameter
    }

    // ═════════════════════════════════════════════════════════════════
    // Import stats
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun importCsv_statsAreAccurate() {
        val csv = buildString {
            append("# ACCOUNTS\r\n")
            append("id,household_id,name,type,currency,current_balance,is_archived,sort_order,icon,color,created_at,updated_at,deleted_at\r\n")
            append("acc-1,hh-1,Checking,CHECKING,USD,100.00,false,0,,,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
            append("acc-2,hh-1,Savings,SAVINGS,USD,500.00,false,1,,,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
            append("\r\n")
            append("# TRANSACTIONS\r\n")
            append("id,household_id,account_id,category_id,type,status,amount,currency,payee,note,date,transfer_account_id,transfer_transaction_id,is_recurring,recurring_rule_id,tags,created_at,updated_at,deleted_at\r\n")
            append("txn-1,hh-1,acc-1,,EXPENSE,CLEARED,25.00,USD,Store,,2024-06-15,,,false,,,2024-06-15T12:00:00Z,2024-06-15T12:00:00Z,\r\n")
        }

        val outcome = DataImportService.importCsv(csv, householdId = testHouseholdId)
        assertTrue(outcome is ImportOutcome.Success)

        val stats = (outcome as ImportOutcome.Success).result.stats
        assertEquals(3, stats.totalRows)
        assertEquals(3, stats.successfulRows)
        assertEquals(0, stats.skippedRows)
        assertEquals(2, stats.entityCounts.accounts)
        assertEquals(1, stats.entityCounts.transactions)
        assertEquals(0, stats.entityCounts.categories)
        assertEquals(0, stats.entityCounts.budgets)
        assertEquals(0, stats.entityCounts.goals)
    }

    // ═════════════════════════════════════════════════════════════════
    // ImportData
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun importData_isEmpty_allEmpty() {
        val data = ImportData(
            accounts = emptyList(),
            transactions = emptyList(),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        assertTrue(data.isEmpty)
        assertEquals(0, data.totalRecords)
    }
}
