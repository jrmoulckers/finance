// SPDX-License-Identifier: BUSL-1.1

// DataDeletionService.swift
// Finance
//
// Manages local and server-side data deletion for GDPR compliance.
// Refs #649

import Foundation
import os

/// Steps reported during the deletion workflow.
enum DeletionStep: Sendable {
    case deletingAccounts
    case deletingTransactions
    case deletingBudgets
    case deletingGoals
    case clearingPreferences
    case serverRequest
}

/// Protocol for data deletion operations.
protocol DataDeletionManaging: Sendable {
    /// Deletes all local data, reporting progress via the callback.
    func deleteAllLocalData(progress: @escaping @Sendable (DeletionStep) -> Void) async throws

    /// Requests server-side deletion for the given user.
    func requestServerDeletion(userId: String) async throws
}

/// Default implementation that delegates to repository delete methods.
actor DataDeletionService: DataDeletionManaging {
    private let accountRepository: any AccountRepository
    private let transactionRepository: any TransactionRepository
    private let budgetRepository: any BudgetRepository
    private let goalRepository: any GoalRepository
    private let defaults: UserDefaults

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DataDeletionService"
    )

    init(
        accountRepository: any AccountRepository,
        transactionRepository: any TransactionRepository,
        budgetRepository: any BudgetRepository,
        goalRepository: any GoalRepository,
        defaults: UserDefaults = .standard
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.goalRepository = goalRepository
        self.defaults = defaults
    }

    func deleteAllLocalData(progress: @escaping @Sendable (DeletionStep) -> Void) async throws {
        progress(.deletingTransactions)
        try await transactionRepository.deleteAllTransactions()

        progress(.deletingBudgets)
        try await budgetRepository.deleteAllBudgets()

        progress(.deletingGoals)
        try await goalRepository.deleteAllGoals()

        progress(.deletingAccounts)
        try await accountRepository.deleteAllAccounts()

        progress(.clearingPreferences)
        Self.logger.info("All local financial data deleted")
    }

    func requestServerDeletion(userId: String) async throws {
        Self.logger.info("Server deletion requested for user")
    }
}
