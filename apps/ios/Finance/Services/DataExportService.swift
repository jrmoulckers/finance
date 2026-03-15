// SPDX-License-Identifier: BUSL-1.1

// DataExportService.swift
// Finance
//
// Exports user financial data as CSV or JSON for GDPR compliance.
// All monetary values are converted from minor units (cents) to major
// units (dollars) for human-readable output. Sensitive financial values
// are never logged — only metadata (format, filename) is recorded.

import Foundation
import os

/// Thread-safe service that exports user financial data to temporary files.
///
/// Uses `actor` isolation to ensure safe concurrent access. All exported
/// files are written to the system temporary directory and should be
/// cleaned up by the caller after sharing.
actor DataExportService {

    // MARK: - Types

    /// Supported export file formats.
    enum ExportFormat: String, CaseIterable, Sendable {
        case csv, json

        var fileExtension: String { rawValue }

        var mimeType: String {
            switch self {
            case .csv: return "text/csv"
            case .json: return "application/json"
            }
        }

        var displayName: String {
            switch self {
            case .csv: return "CSV"
            case .json: return "JSON"
            }
        }
    }

    /// Container for all user data to be exported.
    struct ExportData: Sendable {
        let accounts: [AccountItem]
        let transactions: [TransactionItem]
        let budgets: [BudgetItem]
        let goals: [GoalItem]
    }

    /// Errors specific to the export process.
    enum ExportError: LocalizedError, Sendable {
        case encodingFailed
        case writeFailed(underlying: String)

        var errorDescription: String? {
            switch self {
            case .encodingFailed:
                return String(localized: "Failed to encode export data.")
            case .writeFailed(let detail):
                return String(localized: "Failed to write export file: \(detail)")
            }
        }
    }

    // MARK: - Private Properties

    private let logger = Logger(subsystem: "com.finance.app", category: "DataExportService")

    /// ISO 8601 formatter used for all date output in exports.
    private let iso8601Formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    // MARK: - Public API

    /// Exports all user data to a temporary file in the specified format.
    ///
    /// - Parameters:
    ///   - data: The complete user data to export.
    ///   - format: The desired output format (CSV or JSON).
    /// - Returns: A file URL pointing to the generated export file.
    /// - Throws: `ExportError` if encoding or file writing fails.
    func export(data: ExportData, format: ExportFormat) throws -> URL {
        let timestamp = iso8601Formatter.string(from: Date())
            .replacingOccurrences(of: ":", with: "-")
        let filename = "finance-export-\(timestamp).\(format.fileExtension)"
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(filename)

        switch format {
        case .csv:
            let csvContent = generateCSV(data: data)
            try csvContent.write(to: tempURL, atomically: true, encoding: .utf8)
        case .json:
            let jsonData = try generateJSON(data: data)
            try jsonData.write(to: tempURL)
        }

        logger.info(
            "Exported data as \(format.rawValue, privacy: .public) to \(tempURL.lastPathComponent, privacy: .public)"
        )
        return tempURL
    }

    // MARK: - CSV Generation

    /// Generates a complete CSV string with sections for accounts,
    /// transactions, budgets, and goals.
    ///
    /// Each section starts with a comment header (`# SectionName`),
    /// followed by a column header row and data rows. Fields containing
    /// commas, quotes, or newlines are properly escaped per RFC 4180.
    private func generateCSV(data: ExportData) -> String {
        var lines: [String] = []

        // — Accounts —
        lines.append("# Accounts")
        lines.append("Name,Type,Balance,Currency,Archived")
        for account in data.accounts {
            let row = [
                csvEscape(account.name),
                csvEscape(account.type.rawValue),
                formatAmount(account.balanceMinorUnits),
                csvEscape(account.currencyCode),
                String(account.isArchived),
            ]
            lines.append(row.joined(separator: ","))
        }

        lines.append("")

        // — Transactions —
        lines.append("# Transactions")
        lines.append("Date,Payee,Amount,Currency,Category,Type,Status,Account")
        for transaction in data.transactions {
            let row = [
                csvEscape(iso8601Formatter.string(from: transaction.date)),
                csvEscape(transaction.payee),
                formatAmount(transaction.amountMinorUnits),
                csvEscape(transaction.currencyCode),
                csvEscape(transaction.category),
                csvEscape(transaction.type.rawValue),
                csvEscape(transaction.status.rawValue),
                csvEscape(transaction.accountName),
            ]
            lines.append(row.joined(separator: ","))
        }

        lines.append("")

        // — Budgets —
        lines.append("# Budgets")
        lines.append("Name,Category,Spent,Limit,Currency,Period")
        for budget in data.budgets {
            let row = [
                csvEscape(budget.name),
                csvEscape(budget.categoryName),
                formatAmount(budget.spentMinorUnits),
                formatAmount(budget.limitMinorUnits),
                csvEscape(budget.currencyCode),
                csvEscape(budget.period),
            ]
            lines.append(row.joined(separator: ","))
        }

        lines.append("")

        // — Goals —
        lines.append("# Goals")
        lines.append("Name,Current,Target,Currency,Status,Target Date")
        for goal in data.goals {
            let targetDateStr = goal.targetDate
                .map { iso8601Formatter.string(from: $0) } ?? ""
            let row = [
                csvEscape(goal.name),
                formatAmount(goal.currentMinorUnits),
                formatAmount(goal.targetMinorUnits),
                csvEscape(goal.currencyCode),
                csvEscape(goal.status.rawValue),
                csvEscape(targetDateStr),
            ]
            lines.append(row.joined(separator: ","))
        }

        return lines.joined(separator: "\n") + "\n"
    }

    /// Escapes a CSV field per RFC 4180.
    ///
    /// If the field contains a comma, double-quote, or newline, the
    /// entire field is wrapped in double-quotes and any existing
    /// double-quotes are doubled.
    private func csvEscape(_ field: String) -> String {
        let needsEscaping = field.contains(",")
            || field.contains("\"")
            || field.contains("\n")
            || field.contains("\r")
        guard needsEscaping else { return field }
        let escaped = field.replacingOccurrences(of: "\"", with: "\"\"")
        return "\"\(escaped)\""
    }

    // MARK: - JSON Generation

    /// Generates a structured JSON representation of all user data.
    ///
    /// The output includes an `exportDate` timestamp and arrays for
    /// accounts, transactions, budgets, and goals.
    private func generateJSON(data: ExportData) throws -> Data {
        let exportDict: [String: Any] = [
            "exportDate": iso8601Formatter.string(from: Date()),
            "accounts": data.accounts.map { accountToDict($0) },
            "transactions": data.transactions.map { transactionToDict($0) },
            "budgets": data.budgets.map { budgetToDict($0) },
            "goals": data.goals.map { goalToDict($0) },
        ]

        guard JSONSerialization.isValidJSONObject(exportDict) else {
            throw ExportError.encodingFailed
        }

        return try JSONSerialization.data(
            withJSONObject: exportDict,
            options: [.prettyPrinted, .sortedKeys]
        )
    }

    private func accountToDict(_ account: AccountItem) -> [String: Any] {
        [
            "id": account.id,
            "name": account.name,
            "balance": Double(account.balanceMinorUnits) / 100.0,
            "currency": account.currencyCode,
            "type": account.type.rawValue,
            "archived": account.isArchived,
        ]
    }

    private func transactionToDict(_ transaction: TransactionItem) -> [String: Any] {
        [
            "id": transaction.id,
            "date": iso8601Formatter.string(from: transaction.date),
            "payee": transaction.payee,
            "amount": Double(transaction.amountMinorUnits) / 100.0,
            "currency": transaction.currencyCode,
            "category": transaction.category,
            "type": transaction.type.rawValue,
            "status": transaction.status.rawValue,
            "account": transaction.accountName,
        ]
    }

    private func budgetToDict(_ budget: BudgetItem) -> [String: Any] {
        [
            "id": budget.id,
            "name": budget.name,
            "category": budget.categoryName,
            "spent": Double(budget.spentMinorUnits) / 100.0,
            "limit": Double(budget.limitMinorUnits) / 100.0,
            "currency": budget.currencyCode,
            "period": budget.period,
        ]
    }

    private func goalToDict(_ goal: GoalItem) -> [String: Any] {
        var dict: [String: Any] = [
            "id": goal.id,
            "name": goal.name,
            "current": Double(goal.currentMinorUnits) / 100.0,
            "target": Double(goal.targetMinorUnits) / 100.0,
            "currency": goal.currencyCode,
            "status": goal.status.rawValue,
        ]
        if let targetDate = goal.targetDate {
            dict["targetDate"] = iso8601Formatter.string(from: targetDate)
        }
        return dict
    }

    // MARK: - Formatting Helpers

    /// Converts a minor-unit integer (cents) to a decimal string in major
    /// units (dollars). For example, `12450` becomes `"124.50"`.
    private func formatAmount(_ minorUnits: Int64) -> String {
        let major = Double(minorUnits) / 100.0
        return String(format: "%.2f", major)
    }
}
