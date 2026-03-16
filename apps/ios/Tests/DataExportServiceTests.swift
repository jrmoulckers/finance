// SPDX-License-Identifier: BUSL-1.1

// DataExportServiceTests.swift
// FinanceTests
//
// Tests for DataExportService — CSV generation, JSON generation,
// empty data handling, special character escaping, and amount formatting.

import XCTest
@testable import FinanceApp

final class DataExportServiceTests: XCTestCase {

    private var service: DataExportService!

    override func setUp() {
        super.setUp()
        service = DataExportService()
    }

    override func tearDown() {
        service = nil
        super.tearDown()
    }

    // MARK: - Helpers

    /// Creates standard export data from SampleData for reuse across tests.
    private func makeSampleExportData() -> DataExportService.ExportData {
        DataExportService.ExportData(
            accounts: SampleData.allAccounts,
            transactions: SampleData.allTransactions,
            budgets: SampleData.allBudgets,
            goals: SampleData.allGoals
        )
    }

    /// Creates empty export data for edge-case testing.
    private func makeEmptyExportData() -> DataExportService.ExportData {
        DataExportService.ExportData(
            accounts: [],
            transactions: [],
            budgets: [],
            goals: []
        )
    }

    // MARK: - CSV Generation Tests

    func testCSVExportCreatesFile() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .csv)

        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path),
                      "CSV export file should exist on disk")
        XCTAssertTrue(url.lastPathComponent.hasSuffix(".csv"),
                      "File should have .csv extension")

        // Clean up
        try? FileManager.default.removeItem(at: url)
    }

    func testCSVExportContainsAccountHeaders() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(content.contains("# Accounts"),
                      "CSV should contain Accounts section header")
        XCTAssertTrue(content.contains("Name,Type,Balance,Currency,Archived"),
                      "CSV should contain account column headers")

        try? FileManager.default.removeItem(at: url)
    }

    func testCSVExportContainsTransactionHeaders() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(content.contains("# Transactions"),
                      "CSV should contain Transactions section header")
        XCTAssertTrue(content.contains("Date,Payee,Amount,Currency,Category,Type,Status,Account"),
                      "CSV should contain transaction column headers")

        try? FileManager.default.removeItem(at: url)
    }

    func testCSVExportContainsBudgetHeaders() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(content.contains("# Budgets"),
                      "CSV should contain Budgets section header")
        XCTAssertTrue(content.contains("Name,Category,Spent,Limit,Currency,Period"),
                      "CSV should contain budget column headers")

        try? FileManager.default.removeItem(at: url)
    }

    func testCSVExportContainsGoalHeaders() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(content.contains("# Goals"),
                      "CSV should contain Goals section header")
        XCTAssertTrue(content.contains("Name,Current,Target,Currency,Status,Target Date"),
                      "CSV should contain goal column headers")

        try? FileManager.default.removeItem(at: url)
    }

    func testCSVExportContainsAccountData() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        // Main Checking: 12450.00 cents = 124.50 dollars? No.
        // balanceMinorUnits: 12_450_00 = 1245000 cents → 12450.00 dollars
        XCTAssertTrue(content.contains("Main Checking"),
                      "CSV should contain account name")
        XCTAssertTrue(content.contains("12450.00"),
                      "CSV should contain account balance in major units")
        XCTAssertTrue(content.contains("checking"),
                      "CSV should contain account type")

        try? FileManager.default.removeItem(at: url)
    }

    func testCSVExportContainsTransactionData() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(content.contains("Whole Foods"),
                      "CSV should contain transaction payee")
        // -85_40 = -8540 minor units → -85.40
        XCTAssertTrue(content.contains("-85.40"),
                      "CSV should contain transaction amount in major units")
        XCTAssertTrue(content.contains("Groceries"),
                      "CSV should contain transaction category")

        try? FileManager.default.removeItem(at: url)
    }

    func testCSVExportContainsBudgetData() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(content.contains("Groceries"),
                      "CSV should contain budget name")
        // 320_00 = 32000 minor units → 320.00
        XCTAssertTrue(content.contains("320.00"),
                      "CSV should contain budget spent amount in major units")
        // 500_00 = 50000 minor units → 500.00
        XCTAssertTrue(content.contains("500.00"),
                      "CSV should contain budget limit amount in major units")

        try? FileManager.default.removeItem(at: url)
    }

    func testCSVExportContainsGoalData() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(content.contains("Emergency Fund"),
                      "CSV should contain goal name")
        // 7_500_00 = 750000 minor units → 7500.00
        XCTAssertTrue(content.contains("7500.00"),
                      "CSV should contain goal current amount in major units")
        // 10_000_00 = 1000000 minor units → 10000.00
        XCTAssertTrue(content.contains("10000.00"),
                      "CSV should contain goal target amount in major units")
        XCTAssertTrue(content.contains("active"),
                      "CSV should contain goal status")

        try? FileManager.default.removeItem(at: url)
    }

    func testCSVAmountConversionFromMinorToMajorUnits() async throws {
        let account = AccountItem(
            id: "test", name: "Test",
            balanceMinorUnits: 1_234_56, currencyCode: "USD",
            type: .checking, icon: "building.columns", isArchived: false
        )
        let data = DataExportService.ExportData(
            accounts: [account],
            transactions: [],
            budgets: [],
            goals: []
        )
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        // 1_234_56 = 123456 minor units → 1234.56
        XCTAssertTrue(content.contains("1234.56"),
                      "Amount should be converted from minor units (cents) to major units (dollars)")

        try? FileManager.default.removeItem(at: url)
    }

    func testCSVNegativeAmountFormatting() async throws {
        let account = AccountItem(
            id: "test", name: "Credit Card",
            balanceMinorUnits: -1_200_00, currencyCode: "USD",
            type: .creditCard, icon: "creditcard", isArchived: false
        )
        let data = DataExportService.ExportData(
            accounts: [account],
            transactions: [],
            budgets: [],
            goals: []
        )
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        // -1_200_00 = -120000 minor units → -1200.00
        XCTAssertTrue(content.contains("-1200.00"),
                      "Negative amounts should be formatted correctly")

        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - CSV Special Characters Tests

    func testCSVEscapesCommasInFields() async throws {
        let account = AccountItem(
            id: "test", name: "Checking, Primary",
            balanceMinorUnits: 100_00, currencyCode: "USD",
            type: .checking, icon: "building.columns", isArchived: false
        )
        let data = DataExportService.ExportData(
            accounts: [account],
            transactions: [],
            budgets: [],
            goals: []
        )
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(content.contains("\"Checking, Primary\""),
                      "Fields containing commas should be wrapped in double quotes")

        try? FileManager.default.removeItem(at: url)
    }

    func testCSVEscapesQuotesInFields() async throws {
        let account = AccountItem(
            id: "test", name: "My \"Special\" Account",
            balanceMinorUnits: 100_00, currencyCode: "USD",
            type: .checking, icon: "building.columns", isArchived: false
        )
        let data = DataExportService.ExportData(
            accounts: [account],
            transactions: [],
            budgets: [],
            goals: []
        )
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(content.contains("\"My \"\"Special\"\" Account\""),
                      "Fields containing quotes should have quotes doubled and be wrapped in double quotes")

        try? FileManager.default.removeItem(at: url)
    }

    func testCSVEscapesNewlinesInFields() async throws {
        let transaction = TransactionItem(
            id: "test", payee: "Store\nName",
            category: "Shopping", accountName: "Main",
            amountMinorUnits: -50_00, currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_000_000),
            type: .expense, status: .cleared
        )
        let data = DataExportService.ExportData(
            accounts: [],
            transactions: [transaction],
            budgets: [],
            goals: []
        )
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(content.contains("\"Store\nName\""),
                      "Fields containing newlines should be wrapped in double quotes")

        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - JSON Generation Tests

    func testJSONExportCreatesFile() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .json)

        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path),
                      "JSON export file should exist on disk")
        XCTAssertTrue(url.lastPathComponent.hasSuffix(".json"),
                      "File should have .json extension")

        try? FileManager.default.removeItem(at: url)
    }

    func testJSONExportProducesValidJSON() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .json)
        let jsonData = try Data(contentsOf: url)

        let json = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        XCTAssertNotNil(json, "Export should produce valid JSON")

        try? FileManager.default.removeItem(at: url)
    }

    func testJSONExportContainsExportDate() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .json)
        let jsonData = try Data(contentsOf: url)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        )

        let exportDate = json["exportDate"] as? String
        XCTAssertNotNil(exportDate, "JSON should contain exportDate")
        XCTAssertFalse(exportDate?.isEmpty ?? true,
                       "exportDate should not be empty")

        try? FileManager.default.removeItem(at: url)
    }

    func testJSONExportContainsAllSections() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .json)
        let jsonData = try Data(contentsOf: url)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        )

        XCTAssertNotNil(json["accounts"] as? [[String: Any]],
                        "JSON should contain accounts array")
        XCTAssertNotNil(json["transactions"] as? [[String: Any]],
                        "JSON should contain transactions array")
        XCTAssertNotNil(json["budgets"] as? [[String: Any]],
                        "JSON should contain budgets array")
        XCTAssertNotNil(json["goals"] as? [[String: Any]],
                        "JSON should contain goals array")

        try? FileManager.default.removeItem(at: url)
    }

    func testJSONExportAccountData() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .json)
        let jsonData = try Data(contentsOf: url)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        )
        let accounts = try XCTUnwrap(json["accounts"] as? [[String: Any]])

        XCTAssertEqual(accounts.count, SampleData.allAccounts.count,
                       "JSON should contain all accounts")

        let firstAccount = try XCTUnwrap(accounts.first { ($0["name"] as? String) == "Main Checking" })
        XCTAssertEqual(firstAccount["name"] as? String, "Main Checking")
        XCTAssertEqual(firstAccount["type"] as? String, "checking")
        XCTAssertEqual(firstAccount["currency"] as? String, "USD")
        XCTAssertEqual(firstAccount["archived"] as? Bool, false)
        // 12_450_00 = 1245000 minor units → 12450.0
        XCTAssertEqual(firstAccount["balance"] as? Double, 12450.0, accuracy: 0.01,
                       "Balance should be in major units")

        try? FileManager.default.removeItem(at: url)
    }

    func testJSONExportTransactionData() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .json)
        let jsonData = try Data(contentsOf: url)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        )
        let transactions = try XCTUnwrap(json["transactions"] as? [[String: Any]])

        XCTAssertEqual(transactions.count, SampleData.allTransactions.count,
                       "JSON should contain all transactions")

        let expense = try XCTUnwrap(transactions.first { ($0["payee"] as? String) == "Whole Foods" })
        XCTAssertEqual(expense["category"] as? String, "Groceries")
        XCTAssertEqual(expense["type"] as? String, "expense")
        XCTAssertEqual(expense["status"] as? String, "cleared")
        // -85_40 = -8540 minor units → -85.40
        XCTAssertEqual(expense["amount"] as? Double, -85.40, accuracy: 0.01,
                       "Amount should be in major units")

        try? FileManager.default.removeItem(at: url)
    }

    func testJSONExportBudgetData() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .json)
        let jsonData = try Data(contentsOf: url)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        )
        let budgets = try XCTUnwrap(json["budgets"] as? [[String: Any]])

        XCTAssertEqual(budgets.count, SampleData.allBudgets.count,
                       "JSON should contain all budgets")

        let groceries = try XCTUnwrap(budgets.first { ($0["name"] as? String) == "Groceries" })
        XCTAssertEqual(groceries["category"] as? String, "Groceries")
        // 320_00 = 32000 minor units → 320.00
        XCTAssertEqual(groceries["spent"] as? Double, 320.0, accuracy: 0.01)
        // 500_00 = 50000 minor units → 500.00
        XCTAssertEqual(groceries["limit"] as? Double, 500.0, accuracy: 0.01)
        XCTAssertEqual(groceries["period"] as? String, "Monthly")

        try? FileManager.default.removeItem(at: url)
    }

    func testJSONExportGoalData() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .json)
        let jsonData = try Data(contentsOf: url)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        )
        let goals = try XCTUnwrap(json["goals"] as? [[String: Any]])

        XCTAssertEqual(goals.count, SampleData.allGoals.count,
                       "JSON should contain all goals")

        let emergencyFund = try XCTUnwrap(goals.first { ($0["name"] as? String) == "Emergency Fund" })
        XCTAssertEqual(emergencyFund["status"] as? String, "active")
        // 7_500_00 = 750000 minor units → 7500.0
        XCTAssertEqual(emergencyFund["current"] as? Double, 7500.0, accuracy: 0.01)
        // 10_000_00 = 1000000 minor units → 10000.0
        XCTAssertEqual(emergencyFund["target"] as? Double, 10000.0, accuracy: 0.01)
        XCTAssertNotNil(emergencyFund["targetDate"] as? String,
                        "Active goal should have a target date")
    }

    func testJSONExportGoalWithoutTargetDate() async throws {
        let data = makeSampleExportData()
        let url = try await service.export(data: data, format: .json)
        let jsonData = try Data(contentsOf: url)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        )
        let goals = try XCTUnwrap(json["goals"] as? [[String: Any]])

        let completedGoal = try XCTUnwrap(goals.first { ($0["name"] as? String) == "New Laptop" })
        XCTAssertNil(completedGoal["targetDate"],
                     "Goal without target date should not have targetDate key")

        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - Empty Data Tests

    func testCSVExportWithEmptyData() async throws {
        let data = makeEmptyExportData()
        let url = try await service.export(data: data, format: .csv)
        let content = try String(contentsOf: url, encoding: .utf8)

        // Should still contain section headers even with no data rows
        XCTAssertTrue(content.contains("# Accounts"),
                      "Empty CSV should still have Accounts header")
        XCTAssertTrue(content.contains("# Transactions"),
                      "Empty CSV should still have Transactions header")
        XCTAssertTrue(content.contains("# Budgets"),
                      "Empty CSV should still have Budgets header")
        XCTAssertTrue(content.contains("# Goals"),
                      "Empty CSV should still have Goals header")

        // Column headers should be present
        XCTAssertTrue(content.contains("Name,Type,Balance,Currency,Archived"),
                      "Empty CSV should still have account column headers")

        try? FileManager.default.removeItem(at: url)
    }

    func testJSONExportWithEmptyData() async throws {
        let data = makeEmptyExportData()
        let url = try await service.export(data: data, format: .json)
        let jsonData = try Data(contentsOf: url)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        )

        let accounts = try XCTUnwrap(json["accounts"] as? [[String: Any]])
        let transactions = try XCTUnwrap(json["transactions"] as? [[String: Any]])
        let budgets = try XCTUnwrap(json["budgets"] as? [[String: Any]])
        let goals = try XCTUnwrap(json["goals"] as? [[String: Any]])

        XCTAssertTrue(accounts.isEmpty, "Accounts array should be empty")
        XCTAssertTrue(transactions.isEmpty, "Transactions array should be empty")
        XCTAssertTrue(budgets.isEmpty, "Budgets array should be empty")
        XCTAssertTrue(goals.isEmpty, "Goals array should be empty")
        XCTAssertNotNil(json["exportDate"],
                        "Empty export should still have exportDate")

        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - File Naming Tests

    func testCSVFileHasCorrectExtension() async throws {
        let data = makeEmptyExportData()
        let url = try await service.export(data: data, format: .csv)

        XCTAssertEqual(url.pathExtension, "csv",
                       "CSV export should have .csv extension")

        try? FileManager.default.removeItem(at: url)
    }

    func testJSONFileHasCorrectExtension() async throws {
        let data = makeEmptyExportData()
        let url = try await service.export(data: data, format: .json)

        XCTAssertEqual(url.pathExtension, "json",
                       "JSON export should have .json extension")

        try? FileManager.default.removeItem(at: url)
    }

    func testExportFilenameContainsPrefix() async throws {
        let data = makeEmptyExportData()
        let url = try await service.export(data: data, format: .csv)

        XCTAssertTrue(url.lastPathComponent.hasPrefix("finance-export-"),
                      "Export filename should start with 'finance-export-'")

        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - ExportFormat Tests

    func testExportFormatProperties() {
        XCTAssertEqual(DataExportService.ExportFormat.csv.fileExtension, "csv")
        XCTAssertEqual(DataExportService.ExportFormat.json.fileExtension, "json")
        XCTAssertEqual(DataExportService.ExportFormat.csv.mimeType, "text/csv")
        XCTAssertEqual(DataExportService.ExportFormat.json.mimeType, "application/json")
        XCTAssertEqual(DataExportService.ExportFormat.csv.displayName, "CSV")
        XCTAssertEqual(DataExportService.ExportFormat.json.displayName, "JSON")
    }

    func testExportFormatAllCases() {
        XCTAssertEqual(DataExportService.ExportFormat.allCases.count, 2,
                       "ExportFormat should have exactly 2 cases")
    }
}
