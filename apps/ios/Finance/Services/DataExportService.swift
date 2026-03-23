// SPDX-License-Identifier: BUSL-1.1

// DataExportService.swift
// Finance
//
// Actor-isolated service for exporting financial data to JSON and CSV
// formats. Writes to temporary files and returns URLs for sharing via
// UIActivityViewController or ShareLink. Refs #565

import Foundation
import os

// MARK: - Export Format

/// Supported data export formats.
enum ExportFormat: String, CaseIterable, Sendable {
    case json
    case csv

    var fileExtension: String { rawValue }

    var displayName: String {
        switch self {
        case .json: String(localized: "JSON")
        case .csv: String(localized: "CSV")
        }
    }
}

// MARK: - Export Error

/// Errors that can occur during data export.
enum ExportError: LocalizedError, Sendable {
    case encodingFailed(underlying: Error)
    case fileWriteFailed(underlying: Error)
    case noDataToExport

    var errorDescription: String? {
        switch self {
        case .encodingFailed(let error):
            String(localized: "Failed to encode data: \(error.localizedDescription)")
        case .fileWriteFailed(let error):
            String(localized: "Failed to write export file: \(error.localizedDescription)")
        case .noDataToExport:
            String(localized: "No data available to export.")
        }
    }
}

// MARK: - Codable Export DTOs

/// Lightweight Codable representation of an account for export.
///
/// Strips UI-only fields (e.g., icon) and maps the `AccountTypeUI`
/// enum to its raw `String` for portable serialisation.
struct AccountExportDTO: Codable, Sendable {
    let id: String
    let name: String
    let balanceMinorUnits: Int64
    let currencyCode: String
    let type: String
    let isArchived: Bool

    init(from account: AccountItem) {
        self.id = account.id
        self.name = account.name
        self.balanceMinorUnits = account.balanceMinorUnits
        self.currencyCode = account.currencyCode
        self.type = account.type.rawValue
        self.isArchived = account.isArchived
    }
}

/// Lightweight Codable representation of a transaction for export.
struct TransactionExportDTO: Codable, Sendable {
    let id: String
    let payee: String
    let category: String
    let accountName: String
    let amountMinorUnits: Int64
    let currencyCode: String
    let date: Date
    let type: String
    let status: String

    init(from transaction: TransactionItem) {
        self.id = transaction.id
        self.payee = transaction.payee
        self.category = transaction.category
        self.accountName = transaction.accountName
        self.amountMinorUnits = transaction.amountMinorUnits
        self.currencyCode = transaction.currencyCode
        self.date = transaction.date
        self.type = transaction.type.rawValue
        self.status = transaction.status.rawValue
    }
}

/// Lightweight Codable representation of a budget for export.
struct BudgetExportDTO: Codable, Sendable {
    let id: String
    let name: String
    let categoryName: String
    let spentMinorUnits: Int64
    let limitMinorUnits: Int64
    let currencyCode: String
    let period: String

    init(from budget: BudgetItem) {
        self.id = budget.id
        self.name = budget.name
        self.categoryName = budget.categoryName
        self.spentMinorUnits = budget.spentMinorUnits
        self.limitMinorUnits = budget.limitMinorUnits
        self.currencyCode = budget.currencyCode
        self.period = budget.period
    }
}

/// Lightweight Codable representation of a goal for export.
///
/// The SwiftUI `Color` property is intentionally omitted — it is a
/// UI-only concern with no stable Codable representation.
struct GoalExportDTO: Codable, Sendable {
    let id: String
    let name: String
    let currentMinorUnits: Int64
    let targetMinorUnits: Int64
    let currencyCode: String
    let targetDate: Date?
    let status: String

    init(from goal: GoalItem) {
        self.id = goal.id
        self.name = goal.name
        self.currentMinorUnits = goal.currentMinorUnits
        self.targetMinorUnits = goal.targetMinorUnits
        self.currencyCode = goal.currencyCode
        self.targetDate = goal.targetDate
        self.status = goal.status.rawValue
    }
}

/// Top-level container for full JSON export.
struct FinanceExportDTO: Codable, Sendable {
    let exportDate: Date
    let version: String
    let accounts: [AccountExportDTO]
    let transactions: [TransactionExportDTO]
    let budgets: [BudgetExportDTO]
    let goals: [GoalExportDTO]
}

// MARK: - DataExportService

/// Actor-isolated service for exporting financial data to shareable files.
///
/// Generates RFC 4180-compliant CSV for transactions and structured JSON
/// for full data exports. All file I/O is performed on temporary storage
/// to avoid polluting the app's document directory.
actor DataExportService {

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DataExportService"
    )

    // MARK: - JSON Export

    /// Exports all financial data as a formatted JSON file.
    ///
    /// - Parameters:
    ///   - accounts: Accounts to include in the export.
    ///   - transactions: Transactions to include in the export.
    ///   - budgets: Budgets to include in the export.
    ///   - goals: Goals to include in the export.
    /// - Returns: A file URL pointing to the temporary JSON file.
    /// - Throws: ``ExportError`` if encoding or file writing fails.
    func exportJSON(
        accounts: [AccountItem],
        transactions: [TransactionItem],
        budgets: [BudgetItem],
        goals: [GoalItem]
    ) throws -> URL {
        let exportData = FinanceExportDTO(
            exportDate: .now,
            version: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0",
            accounts: accounts.map(AccountExportDTO.init),
            transactions: transactions.map(TransactionExportDTO.init),
            budgets: budgets.map(BudgetExportDTO.init),
            goals: goals.map(GoalExportDTO.init)
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        let jsonData: Data
        do {
            jsonData = try encoder.encode(exportData)
        } catch {
            Self.logger.error(
                "JSON encoding failed: \(error.localizedDescription, privacy: .public)"
            )
            throw ExportError.encodingFailed(underlying: error)
        }

        let fileURL = temporaryFileURL(name: "finance-export", extension: "json")

        do {
            try jsonData.write(to: fileURL, options: .atomic)
        } catch {
            Self.logger.error(
                "JSON file write failed: \(error.localizedDescription, privacy: .public)"
            )
            throw ExportError.fileWriteFailed(underlying: error)
        }

        Self.logger.info(
            "JSON export written to \(fileURL.lastPathComponent, privacy: .public)"
        )
        return fileURL
    }

    // MARK: - CSV Export

    /// Exports transactions as an RFC 4180-compliant CSV file.
    ///
    /// Headers: Date, Description, Amount, Category, Account, Type, Status
    ///
    /// - Parameter transactions: Transactions to include in the export.
    /// - Returns: A file URL pointing to the temporary CSV file.
    /// - Throws: ``ExportError`` if encoding or file writing fails.
    func exportCSV(transactions: [TransactionItem]) throws -> URL {
        guard !transactions.isEmpty else {
            throw ExportError.noDataToExport
        }

        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withFullDate]

        var lines: [String] = []

        // RFC 4180 header row
        lines.append("Date,Description,Amount,Category,Account,Type,Status")

        for transaction in transactions.sorted(by: { $0.date > $1.date }) {
            let date = dateFormatter.string(from: transaction.date)
            let description = csvEscape(transaction.payee)
            let amount = formatMinorUnits(transaction.amountMinorUnits)
            let category = csvEscape(transaction.category)
            let account = csvEscape(transaction.accountName)
            let type = transaction.type.rawValue
            let status = transaction.status.rawValue

            lines.append(
                "\(date),\(description),\(amount),\(category),\(account),\(type),\(status)"
            )
        }

        // RFC 4180 requires CRLF line endings
        let csvContent = lines.joined(separator: "\r\n") + "\r\n"

        guard let csvData = csvContent.data(using: .utf8) else {
            throw ExportError.encodingFailed(
                underlying: NSError(
                    domain: "DataExportService",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "UTF-8 encoding failed"]
                )
            )
        }

        let fileURL = temporaryFileURL(name: "finance-transactions", extension: "csv")

        do {
            try csvData.write(to: fileURL, options: .atomic)
        } catch {
            Self.logger.error(
                "CSV file write failed: \(error.localizedDescription, privacy: .public)"
            )
            throw ExportError.fileWriteFailed(underlying: error)
        }

        Self.logger.info(
            "CSV export written to \(fileURL.lastPathComponent, privacy: .public)"
        )
        return fileURL
    }

    // MARK: - Private Helpers

    /// Creates a timestamped temporary file URL.
    private func temporaryFileURL(name: String, extension ext: String) -> URL {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd-HHmmss"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        let timestamp = formatter.string(from: .now)
        let fileName = "\(name)-\(timestamp).\(ext)"
        return FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
    }

    /// Escapes a string value for RFC 4180 CSV.
    ///
    /// If the value contains a comma, double-quote, or newline, the entire
    /// field is wrapped in double-quotes with internal quotes doubled.
    private func csvEscape(_ value: String) -> String {
        let needsQuoting = value.contains(",")
            || value.contains("\"")
            || value.contains("\n")
            || value.contains("\r")
        if needsQuoting {
            let escaped = value.replacingOccurrences(of: "\"", with: "\"\"")
            return "\"\(escaped)\""
        }
        return value
    }

    /// Formats minor units (cents) as a decimal string (e.g., 12345 → "123.45").
    private func formatMinorUnits(_ minorUnits: Int64) -> String {
        let whole = minorUnits / 100
        let fraction = abs(minorUnits) % 100
        return String(format: "%d.%02d", whole, fraction)
    }
}
