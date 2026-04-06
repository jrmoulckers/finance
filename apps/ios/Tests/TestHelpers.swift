// SPDX-License-Identifier: BUSL-1.1

// TestHelpers.swift
// FinanceTests
//
// Configurable stub repositories and sample data factories for unit tests.
// Stubs use @unchecked Sendable because they are single-threaded test doubles
// whose mutable state is only accessed from the MainActor in test methods.

import Foundation
import SwiftUI
@testable import FinanceApp

// MARK: - Test Error

/// Synthetic error used to verify error-handling code paths in ViewModels.
enum TestError: Error, LocalizedError {
    case simulated

    var errorDescription: String? { "Simulated test error" }
}

// MARK: - Stub Account Repository

/// Configurable stub that returns pre-set accounts or throws on demand.
final class StubAccountRepository: AccountRepository, @unchecked Sendable {
    var accountsToReturn: [AccountItem] = []
    var errorToThrow: Error?
    private(set) var deletedAccountIds: [String] = []

    func getAccounts() async throws -> [AccountItem] {
        if let error = errorToThrow { throw error }
        return accountsToReturn
    }

    func getAccount(id: String) async throws -> AccountItem? {
        if let error = errorToThrow { throw error }
        return accountsToReturn.first { $0.id == id }
    }

    func deleteAccount(id: String) async throws {
        if let error = errorToThrow { throw error }
        deletedAccountIds.append(id)
    }

    func deleteAllAccounts() async throws {
        if let error = errorToThrow { throw error }
    }
}

// MARK: - Stub Transaction Repository

/// Configurable stub that returns pre-set transactions or throws on demand.
final class StubTransactionRepository: TransactionRepository, @unchecked Sendable {
    var transactionsToReturn: [TransactionItem] = []
    var errorToThrow: Error?
    private(set) var deletedTransactionIds: [String] = []
    private(set) var createdTransactions: [TransactionItem] = []
    private(set) var updatedTransactions: [TransactionItem] = []
    private(set) var paginationRequests: [(offset: Int, limit: Int)] = []

    func getTransactions() async throws -> [TransactionItem] {
        if let error = errorToThrow { throw error }
        return transactionsToReturn
    }


    func getTransactions(offset: Int, limit: Int) async throws -> [TransactionItem] {
        if let error = errorToThrow { throw error }
        paginationRequests.append((offset: offset, limit: limit))
        let sorted = transactionsToReturn.sorted { $0.date > $1.date }
        let start = min(offset, sorted.count)
        let end = min(start + limit, sorted.count)
        return Array(sorted[start..<end])
    }

    func getTransactions(forAccountId accountId: String) async throws -> [TransactionItem] {
        if let error = errorToThrow { throw error }
        return transactionsToReturn
    }

    func getRecentTransactions(limit: Int) async throws -> [TransactionItem] {
        if let error = errorToThrow { throw error }
        return Array(transactionsToReturn.sorted { $0.date > $1.date }.prefix(limit))
    }

    func createTransaction(_ transaction: TransactionItem) async throws {
        if let error = errorToThrow { throw error }
        createdTransactions.append(transaction)
    }

    func updateTransaction(_ transaction: TransactionItem) async throws {
        if let error = errorToThrow { throw error }
        updatedTransactions.append(transaction)
    }

    func deleteTransaction(id: String) async throws {
        if let error = errorToThrow { throw error }
        deletedTransactionIds.append(id)
    }
}

    func deleteAllTransactions() async throws { if let error = errorToThrow { throw error } }
}

// MARK: - Stub Budget Repository

/// Configurable stub that returns pre-set budgets or throws on demand.
final class StubBudgetRepository: BudgetRepository, @unchecked Sendable {
    var budgetsToReturn: [BudgetItem] = []
    var errorToThrow: Error?
    private(set) var createdBudgets: [BudgetItem] = []
    private(set) var updatedBudgets: [BudgetItem] = []

    func getBudgets() async throws -> [BudgetItem] {
        if let error = errorToThrow { throw error }
        return budgetsToReturn
    }

    func createBudget(_ budget: BudgetItem) async throws {
        if let error = errorToThrow { throw error }
        createdBudgets.append(budget)
    }

    func updateBudget(_ budget: BudgetItem) async throws {
        if let error = errorToThrow { throw error }
        updatedBudgets.append(budget)
    }

    func deleteAllBudgets() async throws {
        if let error = errorToThrow { throw error }
    }
}

// MARK: - Stub Goal Repository

/// Configurable stub that returns pre-set goals or throws on demand.
final class StubGoalRepository: GoalRepository, @unchecked Sendable {
    var goalsToReturn: [GoalItem] = []
    var errorToThrow: Error?
    private(set) var createdGoals: [GoalItem] = []
    private(set) var updatedGoals: [GoalItem] = []

    func getGoals() async throws -> [GoalItem] {
        if let error = errorToThrow { throw error }
        return goalsToReturn
    }

    func createGoal(_ goal: GoalItem) async throws {
        if let error = errorToThrow { throw error }
        createdGoals.append(goal)
    }

    func updateGoal(_ goal: GoalItem) async throws {
        if let error = errorToThrow { throw error }
        updatedGoals.append(goal)
    }
}


// MARK: - Stub Category Repository

/// Configurable stub that returns pre-set categories or throws on demand.
final class StubCategoryRepository: CategoryRepository, @unchecked Sendable {
    var categoriesToReturn: [CategoryItem] = []
    var errorToThrow: Error?
    private(set) var createdCategories: [CategoryItem] = []
    private(set) var updatedCategories: [CategoryItem] = []
    private(set) var deletedCategoryIds: [String] = []

    func getCategories() async throws -> [CategoryItem] {
        if let error = errorToThrow { throw error }
        return categoriesToReturn
    }

    func getCategory(id: String) async throws -> CategoryItem? {
        if let error = errorToThrow { throw error }
        return categoriesToReturn.first { $0.id == id }
    }

    func createCategory(_ category: CategoryItem) async throws {
        if let error = errorToThrow { throw error }
        createdCategories.append(category)
    }

    func updateCategory(_ category: CategoryItem) async throws {
        if let error = errorToThrow { throw error }
        updatedCategories.append(category)
    }

    func deleteCategory(id: String) async throws {
        if let error = errorToThrow { throw error }
        deletedCategoryIds.append(id)
    }
}

// MARK: - Stub Biometric Auth Manager

/// Configurable stub for biometric authentication in tests.
///
/// Allows tests to simulate success, failure, and cancellation scenarios
/// without requiring physical biometric hardware.
final class StubBiometricAuthManager: BiometricAuthManaging, @unchecked Sendable {
    var canAuthenticateResult = true
    var errorToThrow: BiometricError?

    func canAuthenticate() -> Bool {
        canAuthenticateResult
    }

    func authenticate(reason: String) async throws {
        if let error = errorToThrow { throw error }
    }
}

// MARK: - Sample Data Factory

/// Deterministic sample data for use across all test files.
///
/// These mirror the mock repository data but are structured for
/// targeted injection into individual test cases.
enum SampleData {

    // MARK: Accounts

    static let checkingAccount = AccountItem(
        id: "a1", name: "Main Checking",
        balanceMinorUnits: 12_450_00, currencyCode: "USD",
        type: .checking, icon: "building.columns", isArchived: false
    )

    static let savingsAccount = AccountItem(
        id: "a2", name: "Savings",
        balanceMinorUnits: 25_000_00, currencyCode: "USD",
        type: .savings, icon: "banknote", isArchived: false
    )

    static let creditCardAccount = AccountItem(
        id: "a3", name: "Travel Card",
        balanceMinorUnits: -1_200_00, currencyCode: "USD",
        type: .creditCard, icon: "creditcard", isArchived: false
    )

    static let investmentAccount = AccountItem(
        id: "a4", name: "Brokerage",
        balanceMinorUnits: 18_500_00, currencyCode: "USD",
        type: .investment, icon: "chart.line.uptrend.xyaxis", isArchived: false
    )

    static let emergencyFundAccount = AccountItem(
        id: "a5", name: "Emergency Fund",
        balanceMinorUnits: 10_000_00, currencyCode: "USD",
        type: .savings, icon: "banknote", isArchived: false
    )

    static let archivedAccount = AccountItem(
        id: "a6", name: "Old Checking",
        balanceMinorUnits: 0, currencyCode: "USD",
        type: .checking, icon: "building.columns", isArchived: true
    )

    static let allAccounts: [AccountItem] = [
        checkingAccount, savingsAccount, creditCardAccount,
        investmentAccount, emergencyFundAccount,
    ]

    // MARK: Transactions

    static let expenseTransaction = TransactionItem(
        id: "t1", payee: "Whole Foods",
        category: "Groceries", accountName: "Main Checking",
        amountMinorUnits: -85_40, currencyCode: "USD",
        date: Date(timeIntervalSince1970: 1_700_000_000),
        type: .expense, status: .cleared
    )

    static let incomeTransaction = TransactionItem(
        id: "t2", payee: "Payroll",
        category: "Income", accountName: "Main Checking",
        amountMinorUnits: 4_250_00, currencyCode: "USD",
        date: Date(timeIntervalSince1970: 1_700_000_000),
        type: .income, status: .cleared
    )

    static let transferTransaction = TransactionItem(
        id: "t3", payee: "Transfer to Savings",
        category: "Transfer", accountName: "Main Checking",
        amountMinorUnits: -500_00, currencyCode: "USD",
        date: Date(timeIntervalSince1970: 1_699_900_000),
        type: .transfer, status: .cleared
    )

    static let entertainmentTransaction = TransactionItem(
        id: "t4", payee: "Netflix",
        category: "Entertainment", accountName: "Travel Card",
        amountMinorUnits: -15_99, currencyCode: "USD",
        date: Date(timeIntervalSince1970: 1_699_900_000),
        type: .expense, status: .cleared
    )

    static let pendingTransaction = TransactionItem(
        id: "t5", payee: "Shell Gas",
        category: "Transport", accountName: "Travel Card",
        amountMinorUnits: -45_00, currencyCode: "USD",
        date: Date(timeIntervalSince1970: 1_699_800_000),
        type: .expense, status: .pending
    )

    static let allTransactions: [TransactionItem] = [
        expenseTransaction, incomeTransaction, transferTransaction,
        entertainmentTransaction, pendingTransaction,
    ]

    // MARK: Budgets

    static let groceriesBudget = BudgetItem(
        id: "b1", name: "Groceries", categoryName: "Groceries",
        spentMinorUnits: 320_00, limitMinorUnits: 500_00,
        currencyCode: "USD", period: "Monthly", icon: "cart"
    )

    static let diningBudget = BudgetItem(
        id: "b2", name: "Dining Out", categoryName: "Dining Out",
        spentMinorUnits: 180_00, limitMinorUnits: 200_00,
        currencyCode: "USD", period: "Monthly", icon: "fork.knife"
    )

    static let overBudget = BudgetItem(
        id: "b3", name: "Entertainment", categoryName: "Entertainment",
        spentMinorUnits: 210_00, limitMinorUnits: 200_00,
        currencyCode: "USD", period: "Monthly", icon: "film"
    )

    static let allBudgets: [BudgetItem] = [
        groceriesBudget, diningBudget, overBudget,
    ]

    // MARK: Goals

    static let activeGoal = GoalItem(
        id: "g1", name: "Emergency Fund",
        currentMinorUnits: 7_500_00, targetMinorUnits: 10_000_00,
        currencyCode: "USD",
        targetDate: Date(timeIntervalSince1970: 1_720_000_000),
        status: .active, icon: "shield", color: .blue
    )

    static let completedGoal = GoalItem(
        id: "g2", name: "New Laptop",
        currentMinorUnits: 2_000_00, targetMinorUnits: 2_000_00,
        currencyCode: "USD", targetDate: nil,
        status: .completed, icon: "laptopcomputer", color: .green
    )

    static let allGoals: [GoalItem] = [activeGoal, completedGoal]

    // MARK: Categories

    static let groceriesCategory = CategoryItem(
        id: "cat1", name: "Groceries",
        colorHex: "#38A169", icon: "cart", sortOrder: 0
    )

    static let diningCategory = CategoryItem(
        id: "cat2", name: "Dining Out",
        colorHex: "#DD6B20", icon: "fork.knife", sortOrder: 1
    )

    static let transportCategory = CategoryItem(
        id: "cat3", name: "Transport",
        colorHex: "#3182CE", icon: "car", sortOrder: 2
    )

    static let allCategories: [CategoryItem] = [
        groceriesCategory, diningCategory, transportCategory,
    ]
}
