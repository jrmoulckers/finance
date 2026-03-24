// SPDX-License-Identifier: BUSL-1.1

// BudgetStatusIntent.swift
// Finance
//
// App Intent for checking budget status via Siri Shortcuts.
// Returns utilisation percentage and remaining amount for a specific
// budget, or a summary of all budgets when no name is provided.

import AppIntents
import Foundation
import os

/// Shows budget utilisation status.
///
/// Available as a Siri Shortcut with the phrase *"Budget status in Finance"*.
/// When a specific budget name is provided, returns detailed utilisation for
/// that budget. Otherwise, returns an overview highlighting any over-budget
/// categories.
struct BudgetStatusIntent: AppIntent {

    static let title: LocalizedStringResource = "Budget Status"

    static let description: IntentDescription = IntentDescription(
        "Check how your budgets are tracking this period.",
        categoryName: "Budgets"
    )

    // MARK: - Parameters

    @Parameter(
        title: "Budget Name",
        description: "Name of a specific budget to check. Leave empty for an overview."
    )
    var budgetName: String?

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "BudgetStatusIntent"
    )

    // MARK: - Perform

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let repository = RepositoryProvider.shared.budgets

        let budgets: [BudgetItem]
        do {
            budgets = try await repository.getBudgets()
        } catch {
            Self.logger.error(
                "Failed to fetch budgets: \(error.localizedDescription, privacy: .public)"
            )
            throw IntentError.saveFailed
        }

        guard !budgets.isEmpty else {
            return .result(
                dialog: "You don't have any budgets set up yet."
            )
        }

        // Specific budget
        if let name = budgetName {
            guard let matched = budgets.first(where: {
                $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame
            }) else {
                Self.logger.info("Budget not found: \(name, privacy: .private)")
                throw IntentError.notFound
            }

            return .result(dialog: IntentDialog(Self.budgetDetail(matched)))
        }

        // Overview of all budgets
        return .result(dialog: IntentDialog(Self.budgetOverview(budgets)))
    }

    // MARK: - Formatting

    /// Builds a detailed status string for a single budget.
    private static func budgetDetail(_ budget: BudgetItem) -> String {
        let percentage = Int((budget.progress * 100).rounded())
        let remaining = formatCurrency(
            minorUnits: budget.remainingMinorUnits,
            currencyCode: budget.currencyCode
        )

        if budget.progress >= 1.0 {
            let overAmount = formatCurrency(
                minorUnits: abs(budget.remainingMinorUnits),
                currencyCode: budget.currencyCode
            )
            return String(
                localized: "\(budget.name) is over budget by \(overAmount) (\(percentage)% used)."
            )
        }

        return String(
            localized: "\(budget.name) is \(percentage)% used with \(remaining) remaining."
        )
    }

    /// Builds an overview string summarising all budgets.
    private static func budgetOverview(_ budgets: [BudgetItem]) -> String {
        let overBudget = budgets.filter { $0.progress >= 1.0 }
        let onTrack = budgets.filter { $0.progress < 1.0 }

        var parts: [String] = []

        if !overBudget.isEmpty {
            let names = overBudget.map(\.name).formatted(.list(type: .and))
            let overCount = overBudget.count
            let word = overCount == 1
                ? String(localized: "budget is")
                : String(localized: "budgets are")
            parts.append(String(localized: "\(overCount) \(word) over limit: \(names)."))
        }

        if !onTrack.isEmpty {
            let onTrackCount = onTrack.count
            let word = onTrackCount == 1
                ? String(localized: "budget is")
                : String(localized: "budgets are")
            parts.append(String(localized: "\(onTrackCount) \(word) on track."))
        }

        return parts.joined(separator: " ")
    }

    private static func formatCurrency(
        minorUnits: Int64,
        currencyCode: String = "USD"
    ) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        let majorUnits = NSDecimalNumber(value: minorUnits)
            .dividing(by: NSDecimalNumber(decimal: 100))
        return formatter.string(from: majorUnits) ?? "\(currencyCode) \(minorUnits)"
    }
}
