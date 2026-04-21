// SPDX-License-Identifier: BUSL-1.1

// InsightsViewModel.swift
// Finance
//
// ViewModel for the Financial Insights screen. Orchestrates the
// InsightsEngine with repository data and exposes computed state
// for the view layer.
//
// Uses @Observable and @MainActor for SwiftUI integration.
//
// References: #241

import Observation
import os
import SwiftUI

@Observable
final class InsightsViewModel {
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let goalRepository: GoalRepository
    private let engine: InsightsEngineProtocol
    private let formatter: any SwiftExportFormatterModule

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "InsightsViewModel"
    )

    // MARK: - Published State

    var summary: InsightsSummary?
    var isLoading = false
    var errorMessage: String?

    /// Filter for insight severity display.
    var selectedFilter: InsightFilter = .all

    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }

    /// Filtered insights based on selected filter.
    var filteredInsights: [FinancialInsight] {
        guard let insights = summary?.insights else { return [] }
        switch selectedFilter {
        case .all: return insights
        case .warnings: return insights.filter { $0.severity == .warning || $0.severity == .critical }
        case .suggestions: return insights.filter { $0.severity == .suggestion }
        case .info: return insights.filter { $0.severity == .info }
        }
    }

    // MARK: - Init

    init(
        transactionRepository: TransactionRepository = RepositoryProvider.shared.transactions,
        budgetRepository: BudgetRepository = RepositoryProvider.shared.budgets,
        goalRepository: GoalRepository = RepositoryProvider.shared.goals,
        engine: InsightsEngineProtocol = InsightsEngine.shared,
        formatter: any SwiftExportFormatterModule = SwiftExportBridgeProvider.shared.formatter
    ) {
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.goalRepository = goalRepository
        self.engine = engine
        self.formatter = formatter
    }

    // MARK: - Data Loading

    func loadInsights() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let transactions = transactionRepository.getTransactions()
            async let budgets = budgetRepository.getBudgets()
            async let goals = goalRepository.getGoals()

            let (txns, budgetList, goalList) = try await (transactions, budgets, goals)
            let currencyCode = "USD" // TODO: derive from account

            summary = await engine.generateInsights(
                transactions: txns,
                budgets: budgetList,
                goals: goalList,
                currencyCode: currencyCode
            )

            Self.logger.debug(
                "Insights loaded: \(self.summary?.insights.count ?? 0, privacy: .public) insights"
            )
        } catch {
            errorMessage = String(localized: "Failed to load insights. Please try again.")
            Self.logger.error("Insights load failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Formatting

    func formatCurrency(_ amountMinorUnits: Int64) -> String {
        let code = summary?.currencyCode ?? "USD"
        return formatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: code,
            showSign: false
        )
    }

    func formatSignedCurrency(_ amountMinorUnits: Int64) -> String {
        let code = summary?.currencyCode ?? "USD"
        return formatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: code,
            showSign: true
        )
    }
}

// MARK: - Insight Filter

enum InsightFilter: String, CaseIterable, Sendable {
    case all
    case warnings
    case suggestions
    case info

    var displayName: String {
        switch self {
        case .all: String(localized: "All")
        case .warnings: String(localized: "Warnings")
        case .suggestions: String(localized: "Suggestions")
        case .info: String(localized: "Info")
        }
    }
}
