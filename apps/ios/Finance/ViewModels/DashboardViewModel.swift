// SPDX-License-Identifier: BUSL-1.1

// DashboardViewModel.swift
// Finance
//
// ViewModel for the main dashboard screen. Aggregates data from account,
// transaction, and budget repositories to present net worth, monthly
// spending, budget health, and recent transactions.

import Observation
import os
import SwiftUI

@Observable
@MainActor
final class DashboardViewModel {
    private let accountRepository: AccountRepository
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository

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

    /// Computed from the sum of all account balances.
    var netWorth: Int64 { accounts.reduce(0) { $0 + $1.balanceMinorUnits } }

    /// Sum of income transactions in the current dataset.
    var monthlyIncome: Int64 {
        recentTransactions
            .filter { $0.type == .income }
            .reduce(0) { $0 + $1.amountMinorUnits }
    }

    /// Sum of expense transactions in the current dataset (as a positive value).
    var monthlyExpenses: Int64 {
        recentTransactions
            .filter { $0.isExpense }
            .reduce(0) { $0 + abs($1.amountMinorUnits) }
    }

    init(
        accountRepository: AccountRepository,
        transactionRepository: TransactionRepository,
        budgetRepository: BudgetRepository
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
    }

    func loadDashboard() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let accountsResult = accountRepository.getAccounts()
            async let transactionsResult = transactionRepository.getRecentTransactions(limit: 5)
            async let budgetsResult = budgetRepository.getBudgets()

            accounts = try await accountsResult
            recentTransactions = try await transactionsResult
            budgets = try await budgetsResult
        } catch {
            errorMessage = String(localized: "Failed to load dashboard. Please try again.")
            Self.logger.error("Dashboard load failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
