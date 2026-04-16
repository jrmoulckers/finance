// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.core.TestFixtures
import com.finance.core.export.*
import com.finance.models.*
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlin.test.*

/**
 * Round-trip tests: export via [CsvExportSerializer] → import via [DataImportService].
 *
 * These tests verify that data exported in CSV format can be re-imported
 * losslessly (modulo sync-internal fields like `syncVersion` and `isSynced`
 * which are intentionally stripped during export).
 */
class ExportImportRoundTripTest {

    private val testHouseholdId = SyncId("household-1")
    private val fixedInstant = Instant.parse("2024-06-15T12:00:00Z")

    private fun createExportData(): ExportData {
        TestFixtures.reset()
        return ExportData(
            accounts = listOf(
                Account(
                    id = SyncId("acc-1"),
                    householdId = testHouseholdId,
                    name = "Checking",
                    type = AccountType.CHECKING,
                    currency = Currency.USD,
                    currentBalance = Cents(10000),
                    isArchived = false,
                    sortOrder = 0,
                    createdAt = fixedInstant,
                    updatedAt = fixedInstant,
                ),
                Account(
                    id = SyncId("acc-2"),
                    householdId = testHouseholdId,
                    name = "Savings",
                    type = AccountType.SAVINGS,
                    currency = Currency.USD,
                    currentBalance = Cents(50000),
                    isArchived = false,
                    sortOrder = 1,
                    createdAt = fixedInstant,
                    updatedAt = fixedInstant,
                ),
            ),
            transactions = listOf(
                Transaction(
                    id = SyncId("txn-1"),
                    householdId = testHouseholdId,
                    accountId = SyncId("acc-1"),
                    categoryId = SyncId("cat-1"),
                    type = TransactionType.EXPENSE,
                    status = TransactionStatus.CLEARED,
                    amount = Cents(2500),
                    currency = Currency.USD,
                    payee = "Grocery Store",
                    note = "Weekly groceries",
                    date = kotlinx.datetime.LocalDate(2024, 6, 15),
                    tags = listOf("food", "weekly"),
                    createdAt = fixedInstant,
                    updatedAt = fixedInstant,
                ),
            ),
            categories = listOf(
                Category(
                    id = SyncId("cat-1"),
                    householdId = testHouseholdId,
                    name = "Food",
                    icon = "🍕",
                    isIncome = false,
                    isSystem = false,
                    sortOrder = 0,
                    createdAt = fixedInstant,
                    updatedAt = fixedInstant,
                ),
            ),
            budgets = listOf(
                Budget(
                    id = SyncId("bud-1"),
                    householdId = testHouseholdId,
                    categoryId = SyncId("cat-1"),
                    name = "Food Budget",
                    amount = Cents(50000),
                    currency = Currency.USD,
                    period = BudgetPeriod.MONTHLY,
                    startDate = kotlinx.datetime.LocalDate(2024, 6, 1),
                    isRollover = false,
                    createdAt = fixedInstant,
                    updatedAt = fixedInstant,
                ),
            ),
            goals = listOf(
                Goal(
                    id = SyncId("goal-1"),
                    householdId = testHouseholdId,
                    name = "Emergency Fund",
                    targetAmount = Cents(100000),
                    currentAmount = Cents(25000),
                    currency = Currency.USD,
                    status = GoalStatus.ACTIVE,
                    accountId = SyncId("acc-2"),
                    createdAt = fixedInstant,
                    updatedAt = fixedInstant,
                ),
            ),
        )
    }

    @Test
    fun roundTrip_csvExportThenImport_preservesAccountData() {
        val exportData = createExportData()
        val csvSerializer = CsvExportSerializer()
        val metadata = ExportMetadata(
            exportDate = fixedInstant,
            appVersion = "2.0.0",
            schemaVersion = "1.0",
            userIdHash = "sha256:test",
            entityCounts = ExportEntityCounts(
                accounts = exportData.accounts.size,
                transactions = exportData.transactions.size,
                categories = exportData.categories.size,
                budgets = exportData.budgets.size,
                goals = exportData.goals.size,
            ),
        )

        val csvContent = csvSerializer.serialize(exportData, metadata)
        val importOutcome = DataImportService.importCsv(csvContent, householdId = testHouseholdId)

        assertTrue(importOutcome is ImportOutcome.Success, "Import should succeed")
        val imported = (importOutcome as ImportOutcome.Success).result.data

        // Verify accounts round-trip
        assertEquals(exportData.accounts.size, imported.accounts.size)
        val origAccount = exportData.accounts[0]
        val impAccount = imported.accounts[0]
        assertEquals(origAccount.id, impAccount.id)
        assertEquals(origAccount.name, impAccount.name)
        assertEquals(origAccount.type, impAccount.type)
        assertEquals(origAccount.currency, impAccount.currency)
        assertEquals(origAccount.currentBalance, impAccount.currentBalance)
        assertEquals(origAccount.isArchived, impAccount.isArchived)
    }

    @Test
    fun roundTrip_csvExportThenImport_preservesTransactionData() {
        val exportData = createExportData()
        val csvSerializer = CsvExportSerializer()
        val metadata = ExportMetadata(
            exportDate = fixedInstant,
            appVersion = "2.0.0",
            schemaVersion = "1.0",
            userIdHash = "sha256:test",
            entityCounts = ExportEntityCounts(
                accounts = exportData.accounts.size,
                transactions = exportData.transactions.size,
                categories = exportData.categories.size,
                budgets = exportData.budgets.size,
                goals = exportData.goals.size,
            ),
        )

        val csvContent = csvSerializer.serialize(exportData, metadata)
        val importOutcome = DataImportService.importCsv(csvContent, householdId = testHouseholdId)

        assertTrue(importOutcome is ImportOutcome.Success)
        val imported = (importOutcome as ImportOutcome.Success).result.data

        // Verify transactions round-trip
        assertEquals(exportData.transactions.size, imported.transactions.size)
        val origTxn = exportData.transactions[0]
        val impTxn = imported.transactions[0]
        assertEquals(origTxn.id, impTxn.id)
        assertEquals(origTxn.accountId, impTxn.accountId)
        assertEquals(origTxn.type, impTxn.type)
        assertEquals(origTxn.amount, impTxn.amount)
        assertEquals(origTxn.payee, impTxn.payee)
        assertEquals(origTxn.note, impTxn.note)
        assertEquals(origTxn.date, impTxn.date)
        assertEquals(origTxn.tags, impTxn.tags)
    }

    @Test
    fun roundTrip_csvExportThenImport_preservesCategoryData() {
        val exportData = createExportData()
        val csvSerializer = CsvExportSerializer()
        val metadata = ExportMetadata(
            exportDate = fixedInstant,
            appVersion = "2.0.0",
            schemaVersion = "1.0",
            userIdHash = "sha256:test",
            entityCounts = ExportEntityCounts(
                accounts = exportData.accounts.size,
                transactions = exportData.transactions.size,
                categories = exportData.categories.size,
                budgets = exportData.budgets.size,
                goals = exportData.goals.size,
            ),
        )

        val csvContent = csvSerializer.serialize(exportData, metadata)
        val importOutcome = DataImportService.importCsv(csvContent, householdId = testHouseholdId)

        assertTrue(importOutcome is ImportOutcome.Success)
        val imported = (importOutcome as ImportOutcome.Success).result.data

        assertEquals(exportData.categories.size, imported.categories.size)
        val origCat = exportData.categories[0]
        val impCat = imported.categories[0]
        assertEquals(origCat.id, impCat.id)
        assertEquals(origCat.name, impCat.name)
        assertEquals(origCat.isIncome, impCat.isIncome)
        assertEquals(origCat.isSystem, impCat.isSystem)
    }

    @Test
    fun roundTrip_csvExportThenImport_preservesBudgetData() {
        val exportData = createExportData()
        val csvSerializer = CsvExportSerializer()
        val metadata = ExportMetadata(
            exportDate = fixedInstant,
            appVersion = "2.0.0",
            schemaVersion = "1.0",
            userIdHash = "sha256:test",
            entityCounts = ExportEntityCounts(
                accounts = exportData.accounts.size,
                transactions = exportData.transactions.size,
                categories = exportData.categories.size,
                budgets = exportData.budgets.size,
                goals = exportData.goals.size,
            ),
        )

        val csvContent = csvSerializer.serialize(exportData, metadata)
        val importOutcome = DataImportService.importCsv(csvContent, householdId = testHouseholdId)

        assertTrue(importOutcome is ImportOutcome.Success)
        val imported = (importOutcome as ImportOutcome.Success).result.data

        assertEquals(exportData.budgets.size, imported.budgets.size)
        val origBudget = exportData.budgets[0]
        val impBudget = imported.budgets[0]
        assertEquals(origBudget.id, impBudget.id)
        assertEquals(origBudget.name, impBudget.name)
        assertEquals(origBudget.amount, impBudget.amount)
        assertEquals(origBudget.period, impBudget.period)
        assertEquals(origBudget.startDate, impBudget.startDate)
        assertEquals(origBudget.isRollover, impBudget.isRollover)
    }

    @Test
    fun roundTrip_csvExportThenImport_preservesGoalData() {
        val exportData = createExportData()
        val csvSerializer = CsvExportSerializer()
        val metadata = ExportMetadata(
            exportDate = fixedInstant,
            appVersion = "2.0.0",
            schemaVersion = "1.0",
            userIdHash = "sha256:test",
            entityCounts = ExportEntityCounts(
                accounts = exportData.accounts.size,
                transactions = exportData.transactions.size,
                categories = exportData.categories.size,
                budgets = exportData.budgets.size,
                goals = exportData.goals.size,
            ),
        )

        val csvContent = csvSerializer.serialize(exportData, metadata)
        val importOutcome = DataImportService.importCsv(csvContent, householdId = testHouseholdId)

        assertTrue(importOutcome is ImportOutcome.Success)
        val imported = (importOutcome as ImportOutcome.Success).result.data

        assertEquals(exportData.goals.size, imported.goals.size)
        val origGoal = exportData.goals[0]
        val impGoal = imported.goals[0]
        assertEquals(origGoal.id, impGoal.id)
        assertEquals(origGoal.name, impGoal.name)
        assertEquals(origGoal.targetAmount, impGoal.targetAmount)
        assertEquals(origGoal.currentAmount, impGoal.currentAmount)
        assertEquals(origGoal.status, impGoal.status)
        assertEquals(origGoal.accountId, impGoal.accountId)
    }

    @Test
    fun roundTrip_csvExportThenImport_entityCountsMatch() {
        val exportData = createExportData()
        val csvSerializer = CsvExportSerializer()
        val metadata = ExportMetadata(
            exportDate = fixedInstant,
            appVersion = "2.0.0",
            schemaVersion = "1.0",
            userIdHash = "sha256:test",
            entityCounts = ExportEntityCounts(
                accounts = exportData.accounts.size,
                transactions = exportData.transactions.size,
                categories = exportData.categories.size,
                budgets = exportData.budgets.size,
                goals = exportData.goals.size,
            ),
        )

        val csvContent = csvSerializer.serialize(exportData, metadata)
        val importOutcome = DataImportService.importCsv(csvContent, householdId = testHouseholdId)

        assertTrue(importOutcome is ImportOutcome.Success)
        val stats = (importOutcome as ImportOutcome.Success).result.stats

        assertEquals(exportData.totalRecords, stats.successfulRows)
        assertEquals(0, stats.skippedRows)
        assertEquals(exportData.accounts.size, stats.entityCounts.accounts)
        assertEquals(exportData.transactions.size, stats.entityCounts.transactions)
        assertEquals(exportData.categories.size, stats.entityCounts.categories)
        assertEquals(exportData.budgets.size, stats.entityCounts.budgets)
        assertEquals(exportData.goals.size, stats.entityCounts.goals)
    }

    @Test
    fun roundTrip_csvExportThenImport_syncFieldsAreNotInExport() {
        // Verify that exported + re-imported entities don't carry syncVersion/isSynced
        // from the original. The export strips them; import defaults them.
        val exportData = ExportData(
            accounts = listOf(
                Account(
                    id = SyncId("acc-1"),
                    householdId = testHouseholdId,
                    name = "Checking",
                    type = AccountType.CHECKING,
                    currency = Currency.USD,
                    currentBalance = Cents(10000),
                    createdAt = fixedInstant,
                    updatedAt = fixedInstant,
                    syncVersion = 42,  // non-default sync field
                    isSynced = true,   // non-default sync field
                ),
            ),
            transactions = emptyList(),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )

        val csvSerializer = CsvExportSerializer()
        val metadata = ExportMetadata(
            exportDate = fixedInstant,
            appVersion = "2.0.0",
            schemaVersion = "1.0",
            userIdHash = "sha256:test",
            entityCounts = ExportEntityCounts(1, 0, 0, 0, 0),
        )

        val csvContent = csvSerializer.serialize(exportData, metadata)

        // Verify the CSV content does NOT contain syncVersion or isSynced columns
        assertFalse(csvContent.contains("sync_version"), "CSV should not contain sync_version")
        assertFalse(csvContent.contains("is_synced"), "CSV should not contain is_synced")

        val importOutcome = DataImportService.importCsv(csvContent, householdId = testHouseholdId)
        assertTrue(importOutcome is ImportOutcome.Success)

        val impAccount = (importOutcome as ImportOutcome.Success).result.data.accounts.first()
        // Imported account should have default sync field values
        assertEquals(0L, impAccount.syncVersion)
        assertEquals(false, impAccount.isSynced)
    }
}
