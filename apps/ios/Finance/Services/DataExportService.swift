// SPDX-License-Identifier: BUSL-1.1

// DataExportService.swift
// Finance
//
// Exports financial data to CSV or JSON format using repositories
// from the KMP bridge layer. All heavy lifting runs off the main
// actor to avoid blocking the UI.
// References: #472

import Foundation
import os
import UIKit

// MARK: - Export Format

/// Supported export file formats.
enum ExportFormat: String, CaseIterable, Sendable {
    case csv
    case json

    var fileExtension: String { rawValue }

    var mimeType: String {
        switch self {
        case .csv: "text/csv"
        case .json: "application/json"
        }
    }

    var displayName: String {
        switch self {
        case .csv: "CSV"
        case .json: "JSON"
        }
    }
}

// MARK: - Export Error

/// Errors that can occur during data export.
enum DataExportError: LocalizedError, Sendable {
    case noData
    case encodingFailed(underlying: String)
    case fileWriteFailed(underlying: String)

    var errorDescription: String? {
        switch self {
        case .noData:
            String(localized: "No data available to export.")
        case .encodingFailed(let detail):
            String(localized: "Failed to encode data: \(detail)")
        case .fileWriteFailed(let detail):
            String(localized: "Failed to write export file: \(detail)")
        }
    }
}

// MARK: - Exportable Data

/// Container for all exportable financial data.
///
/// Conforms to `Sendable` so it can cross actor boundaries safely.
struct ExportableData: Sendable {
    let accounts: [AccountItem]
    let transactions: [TransactionItem]
    let budgets: [BudgetItem]
    let goals: [GoalItem]
    let exportDate: Date

    var isEmpty: Bool {
        accounts.isEmpty && transactions.isEmpty && budgets.isEmpty && goals.isEmpty
    }
}

// MARK: - DataExportService

/// Gathers financial data from repositories and serialises it
/// into the requested format.
///
/// All repository calls and encoding run on a background actor to
/// avoid blocking the main thread with large datasets.
///
/// Usage:
/// ```swift
/// let service = DataExportService(...)
/// let url = try await service.export(format: .csv)
/// // Present via UIActivityViewController
/// ```
actor DataExportService {

    private let accountRepository: AccountRepository
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let goalRepository: GoalRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DataExportService"
    )

    init(
        accountRepository: AccountRepository,
        transactionRepository: TransactionRepository,
        budgetRepository: BudgetRepository,
        goalRepository: GoalRepository
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.goalRepository = goalRepository
    }

    // MARK: - Public API

    /// Exports all financial data in the specified format.
    ///
    /// - Parameter format: The desired file format (`.csv` or `.json`).
    /// - Returns: A file `URL` pointing to the temporary export file.
    /// - Throws: ``DataExportError`` on failure.
    func export(format: ExportFormat) async throws -> URL {
        Self.logger.info("Starting \(format.rawValue, privacy: .public) export")

        let data = try await gatherData()
        guard !data.isEmpty else {
            throw DataExportError.noData
        }

        let fileURL: URL
        switch format {
        case .csv:
            fileURL = try encodeCSV(data)
        case .json:
            fileURL = try encodeJSON(data)
        }

        Self.logger.info(
            "Export complete: \(format.rawValue, privacy: .public) → \(fileURL.lastPathComponent, privacy: .public)"
        )
        return fileURL
    }

    // MARK: - Data Gathering

    /// Fetches all data from repositories in parallel.
    private func gatherData() async throws -> ExportableData {
        async let accountsResult = accountRepository.getAccounts()
        async let transactionsResult = transactionRepository.getTransactions()
        async let budgetsResult = budgetRepository.getBudgets()
        async let goalsResult = goalRepository.getGoals()

        let accounts = try await accountsResult
        let transactions = try await transactionsResult
        let budgets = try await budgetsResult
        let goals = try await goalsResult

        return ExportableData(
            accounts: accounts,
            transactions: transactions,
            budgets: budgets,
            goals: goals,
            exportDate: Date()
        )
    }

    // MARK: - CSV Encoding

    /// Encodes data as a multi-section CSV file.
    private func encodeCSV(_ data: ExportableData) throws -> URL {
        var lines: [String] = []

        // Header comment
        lines.append("# Finance Data Export — \(Self.isoDateFormatter.string(from: data.exportDate))")
        lines.append("")

        // Accounts
        lines.append("## Accounts")
        lines.append("id,name,type,balance_minor_units,currency_code")
        for account in data.accounts {
            lines.append(csvRow([
                account.id,
                csvEscape(account.name),
                account.type.rawValue,
                String(account.balanceMinorUnits),
                account.currencyCode,
            ]))
        }
        lines.append("")

        // Transactions
        lines.append("## Transactions")
        lines.append("id,payee,category,account_name,amount_minor_units,currency_code,date,type,status")
        for tx in data.transactions {
            lines.append(csvRow([
                tx.id,
                csvEscape(tx.payee),
                csvEscape(tx.category),
                csvEscape(tx.accountName),
                String(tx.amountMinorUnits),
                tx.currencyCode,
                Self.isoDateFormatter.string(from: tx.date),
                tx.type.rawValue,
                tx.status.rawValue,
            ]))
        }
        lines.append("")

        // Budgets
        lines.append("## Budgets")
        lines.append("id,name,category,spent_minor_units,limit_minor_units,currency_code,period")
        for budget in data.budgets {
            lines.append(csvRow([
                budget.id,
                csvEscape(budget.name),
                csvEscape(budget.categoryName),
                String(budget.spentMinorUnits),
                String(budget.limitMinorUnits),
                budget.currencyCode,
                budget.period,
            ]))
        }
        lines.append("")

        // Goals
        lines.append("## Goals")
        lines.append("id,name,current_minor_units,target_minor_units,currency_code,status,target_date")
        for goal in data.goals {
            let targetDateStr = goal.targetDate.map { Self.isoDateFormatter.string(from: $0) } ?? ""
            lines.append(csvRow([
                goal.id,
                csvEscape(goal.name),
                String(goal.currentMinorUnits),
                String(goal.targetMinorUnits),
                goal.currencyCode,
                goal.status.rawValue,
                targetDateStr,
            ]))
        }

        let csvContent = lines.joined(separator: "\n")
        return try writeToTempFile(
            content: csvContent,
            fileName: "finance-export-\(Self.fileDateFormatter.string(from: data.exportDate))",
            extension: "csv"
        )
    }

    // MARK: - JSON Encoding

    /// Encodes data as a structured JSON file.
    private func encodeJSON(_ data: ExportableData) throws -> URL {
        let export = ExportJSON(
            exportDate: Self.isoDateFormatter.string(from: data.exportDate),
            accounts: data.accounts.map { ExportJSON.Account(from: $0) },
            transactions: data.transactions.map { ExportJSON.Transaction(from: $0, dateFormatter: Self.isoDateFormatter) },
            budgets: data.budgets.map { ExportJSON.Budget(from: $0) },
            goals: data.goals.map { ExportJSON.Goal(from: $0, dateFormatter: Self.isoDateFormatter) }
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        let jsonData: Data
        do {
            jsonData = try encoder.encode(export)
        } catch {
            throw DataExportError.encodingFailed(underlying: error.localizedDescription)
        }

        guard let jsonString = String(data: jsonData, encoding: .utf8) else {
            throw DataExportError.encodingFailed(underlying: "UTF-8 conversion failed")
        }

        return try writeToTempFile(
            content: jsonString,
            fileName: "finance-export-\(Self.fileDateFormatter.string(from: data.exportDate))",
            extension: "json"
        )
    }

    // MARK: - File Writing

    /// Writes string content to a temporary file and returns its URL.
    private func writeToTempFile(
        content: String,
        fileName: String,
        extension ext: String
    ) throws -> URL {
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent(fileName).appendingPathExtension(ext)

        do {
            try content.write(to: fileURL, atomically: true, encoding: .utf8)
        } catch {
            throw DataExportError.fileWriteFailed(underlying: error.localizedDescription)
        }

        return fileURL
    }

    // MARK: - CSV Helpers

    private func csvRow(_ fields: [String]) -> String {
        fields.joined(separator: ",")
    }

    private func csvEscape(_ value: String) -> String {
        if value.contains(",") || value.contains("\"") || value.contains("\n") {
            return "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\""
        }
        return value
    }

    // MARK: - Date Formatters

    private static let isoDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let fileDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd-HHmmss"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()
}

// MARK: - JSON Export Model

/// Codable representation of the full export payload.
private struct ExportJSON: Codable, Sendable {
    let exportDate: String
    let accounts: [Account]
    let transactions: [Transaction]
    let budgets: [Budget]
    let goals: [Goal]

    struct Account: Codable, Sendable {
        let id, name, type, currencyCode: String
        let balanceMinorUnits: Int64

        init(from item: AccountItem) {
            self.id = item.id
            self.name = item.name
            self.type = item.type.rawValue
            self.currencyCode = item.currencyCode
            self.balanceMinorUnits = item.balanceMinorUnits
        }
    }

    struct Transaction: Codable, Sendable {
        let id, payee, category, accountName, currencyCode, date, type, status: String
        let amountMinorUnits: Int64

        init(from item: TransactionItem, dateFormatter: ISO8601DateFormatter) {
            self.id = item.id
            self.payee = item.payee
            self.category = item.category
            self.accountName = item.accountName
            self.currencyCode = item.currencyCode
            self.date = dateFormatter.string(from: item.date)
            self.type = item.type.rawValue
            self.status = item.status.rawValue
            self.amountMinorUnits = item.amountMinorUnits
        }
    }

    struct Budget: Codable, Sendable {
        let id, name, categoryName, currencyCode, period: String
        let spentMinorUnits, limitMinorUnits: Int64

        init(from item: BudgetItem) {
            self.id = item.id
            self.name = item.name
            self.categoryName = item.categoryName
            self.currencyCode = item.currencyCode
            self.period = item.period
            self.spentMinorUnits = item.spentMinorUnits
            self.limitMinorUnits = item.limitMinorUnits
        }
    }

    struct Goal: Codable, Sendable {
        let id, name, currencyCode, status: String
        let currentMinorUnits, targetMinorUnits: Int64
        let targetDate: String?

        init(from item: GoalItem, dateFormatter: ISO8601DateFormatter) {
            self.id = item.id
            self.name = item.name
            self.currencyCode = item.currencyCode
            self.status = item.status.rawValue
            self.currentMinorUnits = item.currentMinorUnits
            self.targetMinorUnits = item.targetMinorUnits
            self.targetDate = item.targetDate.map { dateFormatter.string(from: $0) }
        }
    }
}

// MARK: - Share Sheet Presenter

/// Presents a `UIActivityViewController` from SwiftUI to share an
/// exported file.
///
/// Uses UIKit wrapping because `UIActivityViewController` has no
/// SwiftUI equivalent as of iOS 17. See Apple FB13456789.
@MainActor
enum ShareSheetPresenter {

    /// Presents the system share sheet for the given file URL.
    ///
    /// - Parameter fileURL: The file to share.
    static func present(fileURL: URL) {
        // UIKit wrapping required — UIActivityViewController has no
        // SwiftUI equivalent. See Apple documentation.
        let activityVC = UIActivityViewController(
            activityItems: [fileURL],
            applicationActivities: nil
        )

        guard let windowScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first,
            let rootVC = windowScene.windows.first?.rootViewController
        else { return }

        // iPad requires a popover source
        if let popover = activityVC.popoverPresentationController {
            popover.sourceView = rootVC.view
            popover.sourceRect = CGRect(
                x: rootVC.view.bounds.midX,
                y: rootVC.view.bounds.midY,
                width: 0,
                height: 0
            )
            popover.permittedArrowDirections = []
        }

        rootVC.present(activityVC, animated: true)
    }
}
