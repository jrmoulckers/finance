// SPDX-License-Identifier: BUSL-1.1

// DataExportServiceTests.swift
// FinanceTests
//
// Tests for DataExportService — JSON export, CSV export, edge cases,
// and RFC 4180 compliance. Refs #565

import XCTest
@testable import FinanceApp

final class DataExportServiceTests: XCTestCase {

    private let service = DataExportService()

    // MARK: - JSON Export

    func testJSONExportCreatesFile() async throws {
        let url = try await service.exportJSON(
            accounts: SampleData.allAccounts,
            transactions: SampleData.allTransactions,
            budgets: SampleData.allBudgets,
            goals: SampleData.allGoals
        )

        XCTAssertTrue(
            FileManager.default.fileExists(atPath: url.path),
            "JSON export file should exist on disk"
        )
        XCTAssertEqual(url.pathExtension, "json", "File should have .json extension")

        try FileManager.default.removeItem(at: url)
    }

    func testJSONExportContainsValidJSON() async throws {
        let url = try await service.exportJSON(
            accounts: SampleData.allAccounts,
            transactions: SampleData.allTransactions,
            budgets: SampleData.allBudgets,
            goals: SampleData.allGoals
        )

        let data = try Data(contentsOf: url)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertNotNil(json, "Export should be valid JSON")
        XCTAssertNotNil(json?["accounts"], "JSON should contain accounts key")
        XCTAssertNotNil(json?["transactions"], "JSON should contain transactions key")
        XCTAssertNotNil(json?["budgets"], "JSON should contain budgets key")
        XCTAssertNotNil(json?["goals"], "JSON should contain goals key")
        XCTAssertNotNil(json?["exportDate"], "JSON should contain exportDate key")
        XCTAssertNotNil(json?["version"], "JSON should contain version key")

        let accounts = json?["accounts"] as? [[String: Any]]
        XCTAssertEqual(
            accounts?.count, SampleData.allAccounts.count,
            "JSON should contain all accounts"
        )

        try FileManager.default.removeItem(at: url)
    }

    func testJSONExportWithEmptyData() async throws {
        let url = try await service.exportJSON(
            accounts: [],
            transactions: [],
            budgets: [],
            goals: []
        )

        let data = try Data(contentsOf: url)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        let accounts = json?["accounts"] as? [Any]
        XCTAssertEqual(accounts?.count, 0, "Empty accounts array should be present")

        try FileManager.default.removeItem(at: url)
    }

    func testJSONExportIsDecodable() async throws {
        let url = try await service.exportJSON(
            accounts: SampleData.allAccounts,
            transactions: SampleData.allTransactions,
            budgets: SampleData.allBudgets,
            goals: SampleData.allGoals
        )

        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let exported = try decoder.decode(FinanceExportDTO.self, from: data)
        XCTAssertEqual(exported.accounts.count, SampleData.allAccounts.count)
        XCTAssertEqual(exported.transactions.count, SampleData.allTransactions.count)
        XCTAssertEqual(exported.budgets.count, SampleData.allBudgets.count)
        XCTAssertEqual(exported.goals.count, SampleData.allGoals.count)

        try FileManager.default.removeItem(at: url)
    }

    // MARK: - CSV Export

    func testCSVExportCreatesFile() async throws {
        let url = try await service.exportCSV(
            transactions: SampleData.allTransactions
        )

        XCTAssertTrue(
            FileManager.default.fileExists(atPath: url.path),
            "CSV export file should exist on disk"
        )
        XCTAssertEqual(url.pathExtension, "csv", "File should have .csv extension")

        try FileManager.default.removeItem(at: url)
    }

    func testCSVExportContainsHeaderRow() async throws {
        let url = try await service.exportCSV(
            transactions: SampleData.allTransactions
        )

        let content = try String(contentsOf: url, encoding: .utf8)
        let lines = content.components(separatedBy: "\r\n")

        XCTAssertEqual(
            lines.first,
            "Date,Description,Amount,Category,Account,Type,Status",
            "First line should be the RFC 4180 header row"
        )

        try FileManager.default.removeItem(at: url)
    }

    func testCSVExportContainsAllTransactions() async throws {
        let url = try await service.exportCSV(
            transactions: SampleData.allTransactions
        )

        let content = try String(contentsOf: url, encoding: .utf8)
        // RFC 4180: trailing CRLF means last element after split is empty
        let lines = content.components(separatedBy: "\r\n").filter { !$0.isEmpty }

        // 1 header + N data rows
        XCTAssertEqual(
            lines.count, SampleData.allTransactions.count + 1,
            "CSV should have header + one row per transaction"
        )

        try FileManager.default.removeItem(at: url)
    }

    func testCSVExportUsesCRLFLineEndings() async throws {
        let url = try await service.exportCSV(
            transactions: [SampleData.expenseTransaction]
        )

        let content = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            content.contains("\r\n"),
            "CSV should use CRLF line endings per RFC 4180"
        )

        try FileManager.default.removeItem(at: url)
    }

    func testCSVExportEscapesCommasInFields() async throws {
        let transaction = TransactionItem(
            id: "t-special", payee: "Smith, Jones & Co",
            category: "Professional Services",
            accountName: "Main Checking",
            amountMinorUnits: -250_00, currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_000_000),
            type: .expense, status: .cleared
        )

        let url = try await service.exportCSV(transactions: [transaction])

        let content = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            content.contains("\"Smith, Jones & Co\""),
            "Payee containing a comma should be double-quoted"
        )

        try FileManager.default.removeItem(at: url)
    }

    func testCSVExportEscapesDoubleQuotesInFields() async throws {
        let transaction = TransactionItem(
            id: "t-quotes", payee: "The \"Best\" Store",
            category: "Shopping",
            accountName: "Main Checking",
            amountMinorUnits: -50_00, currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_000_000),
            type: .expense, status: .cleared
        )

        let url = try await service.exportCSV(transactions: [transaction])

        let content = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            content.contains("\"The \"\"Best\"\" Store\""),
            "Payee containing double quotes should be escaped per RFC 4180"
        )

        try FileManager.default.removeItem(at: url)
    }

    // MARK: - Error Cases

    func testCSVExportWithEmptyTransactionsThrows() async {
        do {
            _ = try await service.exportCSV(transactions: [])
            XCTFail("Export with empty transactions should throw")
        } catch {
            XCTAssertTrue(
                error is ExportError,
                "Error should be an ExportError"
            )
        }
    }

    // MARK: - Amount Formatting

    func testCSVAmountFormattingPositive() async throws {
        let transaction = TransactionItem(
            id: "t-pos", payee: "Payroll",
            category: "Income", accountName: "Checking",
            amountMinorUnits: 4_250_00, currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_000_000),
            type: .income, status: .cleared
        )

        let url = try await service.exportCSV(transactions: [transaction])
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            content.contains("4250.00"),
            "Positive amount should be formatted as decimal"
        )

        try FileManager.default.removeItem(at: url)
    }

    func testCSVAmountFormattingNegative() async throws {
        let transaction = TransactionItem(
            id: "t-neg", payee: "Store",
            category: "Shopping", accountName: "Checking",
            amountMinorUnits: -85_40, currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_000_000),
            type: .expense, status: .cleared
        )

        let url = try await service.exportCSV(transactions: [transaction])
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            content.contains("-85.40"),
            "Negative amount should preserve sign and format as decimal"
        )

        try FileManager.default.removeItem(at: url)
    }

    // MARK: - DTO Mapping

    func testAccountExportDTO() {
        let account = SampleData.checkingAccount
        let dto = AccountExportDTO(from: account)

        XCTAssertEqual(dto.id, account.id)
        XCTAssertEqual(dto.name, account.name)
        XCTAssertEqual(dto.balanceMinorUnits, account.balanceMinorUnits)
        XCTAssertEqual(dto.currencyCode, account.currencyCode)
        XCTAssertEqual(dto.type, account.type.rawValue)
        XCTAssertEqual(dto.isArchived, account.isArchived)
    }

    func testTransactionExportDTO() {
        let transaction = SampleData.expenseTransaction
        let dto = TransactionExportDTO(from: transaction)

        XCTAssertEqual(dto.id, transaction.id)
        XCTAssertEqual(dto.payee, transaction.payee)
        XCTAssertEqual(dto.category, transaction.category)
        XCTAssertEqual(dto.amountMinorUnits, transaction.amountMinorUnits)
        XCTAssertEqual(dto.type, transaction.type.rawValue)
        XCTAssertEqual(dto.status, transaction.status.rawValue)
    }

    func testBudgetExportDTO() {
        let budget = SampleData.groceriesBudget
        let dto = BudgetExportDTO(from: budget)

        XCTAssertEqual(dto.id, budget.id)
        XCTAssertEqual(dto.name, budget.name)
        XCTAssertEqual(dto.spentMinorUnits, budget.spentMinorUnits)
        XCTAssertEqual(dto.limitMinorUnits, budget.limitMinorUnits)
    }

    func testGoalExportDTO() {
        let goal = SampleData.activeGoal
        let dto = GoalExportDTO(from: goal)

        XCTAssertEqual(dto.id, goal.id)
        XCTAssertEqual(dto.name, goal.name)
        XCTAssertEqual(dto.currentMinorUnits, goal.currentMinorUnits)
        XCTAssertEqual(dto.targetMinorUnits, goal.targetMinorUnits)
        XCTAssertEqual(dto.status, goal.status.rawValue)
        XCTAssertEqual(dto.targetDate, goal.targetDate)
    }

    func testGoalExportDTOWithNilDate() {
        let goal = SampleData.completedGoal
        let dto = GoalExportDTO(from: goal)

        XCTAssertNil(dto.targetDate, "Nil target date should map to nil")
    }
}
