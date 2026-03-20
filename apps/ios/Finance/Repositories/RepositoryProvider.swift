// SPDX-License-Identifier: BUSL-1.1

// RepositoryProvider.swift
// Finance
//
// Centralised dependency container for repository implementations.
// In production this provides KMP-bridged repositories; in tests and
// SwiftUI previews it can be overridden with stubs or mocks.
//
// ## Usage
//
// Views use the shared instance via default parameter values:
//
// ```swift
// init(viewModel: AccountsViewModel = AccountsViewModel(
//     repository: RepositoryProvider.shared.accounts
// )) { … }
// ```
//
// Tests inject stubs directly through the ViewModel initialiser.

import Foundation
import os

/// Provides the canonical set of repository implementations used throughout
/// the Finance app.
///
/// The provider is intentionally a simple, immutable container rather than a
/// full-blown service locator. It is created once at launch and never mutated,
/// which makes it safe to share across concurrency domains without additional
/// synchronisation.
///
/// - Note: All repository protocols require `Sendable` conformance, so every
///   concrete implementation stored here is `Sendable` as well.
final class RepositoryProvider: @unchecked Sendable {

    // MARK: - Singleton

    /// The app-wide shared instance.
    ///
    /// Uses KMP-bridged repositories by default. When the `FinanceCore`
    /// framework is unavailable (e.g., building on Windows), the KMP
    /// repositories automatically fall back to mock data.
    static let shared = RepositoryProvider()

    // MARK: - Repositories

    /// Account data access.
    let accounts: any AccountRepository

    /// Transaction data access.
    let transactions: any TransactionRepository

    /// Budget data access.
    let budgets: any BudgetRepository

    /// Goal data access.
    let goals: any GoalRepository

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "RepositoryProvider"
    )

    // MARK: - Initialisation

    /// Creates a repository provider with the given implementations.
    ///
    /// - Parameters:
    ///   - accounts:     Account repository (defaults to KMP-bridged).
    ///   - transactions: Transaction repository (defaults to KMP-bridged).
    ///   - budgets:      Budget repository (defaults to KMP-bridged).
    ///   - goals:        Goal repository (defaults to KMP-bridged).
    init(
        accounts: any AccountRepository = KMPAccountRepository(),
        transactions: any TransactionRepository = KMPTransactionRepository(),
        budgets: any BudgetRepository = KMPBudgetRepository(),
        goals: any GoalRepository = KMPGoalRepository()
    ) {
        self.accounts = accounts
        self.transactions = transactions
        self.budgets = budgets
        self.goals = goals

        Self.logger.info("RepositoryProvider initialised")
    }
}
