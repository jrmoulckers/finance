// SPDX-License-Identifier: BUSL-1.1

// DashboardViewModel.swift
// Finance
//
// ViewModel for the main dashboard screen. Aggregates data from account,
// transaction, and budget repositories to present net worth, monthly
// spending, budget health, and recent transactions.
//
// Business logic (aggregation, formatting) is sourced from the Swift Export
// bridge modules. ViewModels never import KMP types directly — they use
// the bridge's Swift-native protocols.
//
// References: #414, #289

import Observation
import os
import SwiftUI

@Observable
final class DashboardViewModel {
    private let accountRepository: AccountRepository
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let aggregator: any SwiftExportAggregatorModule
    private let formatter: any SwiftExportFormatterModule

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DashboardViewModel"
    )

    var accounts: [AccountItem] = []
    var budgets: [BudgetItem] = []
    var recentTransactions: [TransactionItem] = []
    var isLoading = false
    var errorMessage: String?
    var currencyCode: String = "USD"

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    /// Net worth computed via the Swift Export aggregator module.
    var netWorth: Int64 { aggregator.netWorth(accounts: accounts) }

    // MARK: - Cached Aggregations
    //
    // These values are pre-computed when data loads rather than being
    // recalculated as computed properties on every SwiftUI body evaluation.
    // `monthlyIncome` / `monthlyExpenses` iterate the full transaction list,
    // and `savingsRate` / `spendingByCategory` cross the bridge and
    // map the entire list — doing this on every render caused redundant
    // O(n) + bridge-interop work during scrolling and animation frames.

    /// Sum of income transactions in the current dataset.
    private(set) var monthlyIncome: Int64 = 0

    /// Sum of expense transactions in the current dataset (as a positive value).
    private(set) var monthlyExpenses: Int64 = 0

    /// Savings rate for the current month, computed via the Swift Export aggregator.
    /// Returns a percentage (0–100). Available only when monthly transaction data is loaded.
    private(set) var savingsRate: Double = 0

    /// Spending grouped by category for the current month, via Swift Export aggregator.
    private(set) var spendingByCategory: [String: Int64] = [:]

    /// Recomputes cached aggregation values from the current `recentTransactions`.
    ///
    /// Called once after data loads instead of on every view body evaluation.
    /// Uses Swift-native Date types — the bridge handles KMP type mapping internally.
    private func recomputeAggregations() {
        let cal = Calendar.current
        let now = Date.now
        let startOfMonth = cal.date(from: cal.dateComponents([.year, .month], from: now)) ?? now
        let endOfMonth = cal.date(byAdding: DateComponents(month: 1, day: -1), to: startOfMonth) ?? now

        monthlyIncome = aggregator.totalIncome(
            transactions: recentTransactions,
            from: startOfMonth,
            to: endOfMonth
        )

        monthlyExpenses = aggregator.totalSpending(
            transactions: recentTransactions,
            from: startOfMonth,
            to: endOfMonth
        )

        savingsRate = aggregator.savingsRate(
            transactions: recentTransactions,
            from: startOfMonth,
            to: endOfMonth
        )

        spendingByCategory = aggregator.spendingByCategory(
            transactions: recentTransactions,
            from: startOfMonth,
            to: endOfMonth
        )
    }

    /// Formats a monetary amount using the Swift Export formatter module.
    func formatCurrency(_ amountMinorUnits: Int64, showSign: Bool = false) -> String {
        formatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode,
            showSign: showSign
        )
    }

    init(
        accountRepository: AccountRepository,
        transactionRepository: TransactionRepository,
        budgetRepository: BudgetRepository,
        aggregator: any SwiftExportAggregatorModule = SwiftExportBridgeProvider.shared.aggregator,
        formatter: any SwiftExportFormatterModule = SwiftExportBridgeProvider.shared.formatter
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.aggregator = aggregator
        self.formatter = formatter
    }

    func loadDashboard() async {
        isLoading = true
        defer { isLoading = false }

        do {
            // Instrumented with os_signpost for Instruments profiling (#903)
            (accounts, recentTransactions, budgets) = try await PerformanceMonitor.shared.measure("Dashboard Load") {
                async let a = self.accountRepository.getAccounts()
                async let t = self.transactionRepository.getRecentTransactions(limit: 5)
                async let b = self.budgetRepository.getBudgets()
                return try await (a, t, b)
            }

            recomputeAggregations()
        } catch {
            errorMessage = String(localized: "Failed to load dashboard. Please try again.")
            Self.logger.error("Dashboard load failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
