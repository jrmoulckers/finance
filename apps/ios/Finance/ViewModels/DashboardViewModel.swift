// SPDX-License-Identifier: BUSL-1.1

// DashboardViewModel.swift
// Finance
//
// ViewModel for the main dashboard screen. Aggregates data from account,
// transaction, and budget repositories to present net worth, monthly
// spending, budget health, and recent transactions.
//
// KMP bridge services (FinancialAggregator, BudgetCalculator,
// CurrencyFormatter) are injected for business-logic computations.

import Observation
import os
import SwiftUI

@Observable
final class DashboardViewModel {
    private let accountRepository: AccountRepository
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let financialAggregator: KMPFinancialAggregatorProtocol
    private let budgetCalculator: KMPBudgetCalculatorProtocol
    private let currencyFormatter: KMPCurrencyFormatterProtocol

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

    /// Savings rate for the current month, computed via the KMP FinancialAggregator.
    /// Returns a percentage (0–100). Available only when monthly transaction data is loaded.
    var savingsRate: Double {
        let kmpTransactions = recentTransactions.map { txn in
            txn.toKMP(householdId: "default", accountId: "", categoryId: nil)
        }
        let from = DateComponents.startOfCurrentMonth()
        let to = DateComponents.endOfCurrentMonth()
        return financialAggregator.savingsRate(transactions: kmpTransactions, from: from, to: to)
    }

    /// Spending grouped by category for the current month, via KMP FinancialAggregator.
    var spendingByCategory: [String: Int64] {
        let kmpTransactions = recentTransactions.map { txn in
            txn.toKMP(householdId: "default", accountId: "", categoryId: nil)
        }
        let from = DateComponents.startOfCurrentMonth()
        let to = DateComponents.endOfCurrentMonth()
        return financialAggregator.spendingByCategory(
            transactions: kmpTransactions, from: from, to: to
        )
    }

    /// Formats a monetary amount using the injected KMP CurrencyFormatter.
    func formatCurrency(_ amountMinorUnits: Int64, showSign: Bool = false) -> String {
        currencyFormatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode,
            showSign: showSign
        )
    }

    init(
        accountRepository: AccountRepository,
        transactionRepository: TransactionRepository,
        budgetRepository: BudgetRepository,
        financialAggregator: KMPFinancialAggregatorProtocol = KMPBridge.shared.financialAggregator,
        budgetCalculator: KMPBudgetCalculatorProtocol = KMPBridge.shared.budgetCalculator,
        currencyFormatter: KMPCurrencyFormatterProtocol = KMPBridge.shared.currencyFormatter
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.financialAggregator = financialAggregator
        self.budgetCalculator = budgetCalculator
        self.currencyFormatter = currencyFormatter
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
