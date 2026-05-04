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

    /// Category data access.
    let categories: any CategoryRepository

    /// Investment portfolio data access.
    let investments: any InvestmentRepository

    /// Bill reminder data access.
    let bills: any BillRepository

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "RepositoryProvider"
    )

    // MARK: - Initialisation

    /// Creates a repository provider with the given implementations.
    ///
    /// - Parameters:
    ///   - accounts:     Account repository (defaults to Swift Export bridged).
    ///   - transactions: Transaction repository (defaults to Swift Export bridged).
    ///   - budgets:      Budget repository (defaults to Swift Export bridged).
    ///   - goals:        Goal repository (defaults to Swift Export bridged).
    ///   - categories:   Category repository (defaults to Swift Export bridged).
    ///   - investments:  Investment repository (defaults to mock — KMP bridge pending).
    ///   - bills:        Bill repository (defaults to mock — KMP bridge pending).
    ///
    /// Since Sprint 7, the default implementations delegate through the
    /// ``SwiftExportBridgeProvider`` which auto-selects between the live
    /// KMP XCFramework and the in-process stub. The legacy `KMP*Repository`
    /// types are retained for backward compatibility but new code should
    /// use the `Bridged*Repository` adapters. Refs #414, #289
    init(
        accounts: any AccountRepository = BridgedAccountRepository(),
        transactions: any TransactionRepository = BridgedTransactionRepository(),
        budgets: any BudgetRepository = BridgedBudgetRepository(),
        goals: any GoalRepository = BridgedGoalRepository(),
        categories: any CategoryRepository = BridgedCategoryRepository(),
        investments: any InvestmentRepository = MockInvestmentRepository(),
        bills: any BillRepository = MockBillRepository()
    ) {
        self.accounts = accounts
        self.transactions = transactions
        self.budgets = budgets
        self.goals = goals
        self.categories = categories
        self.investments = investments
        self.bills = bills

        Self.logger.info("RepositoryProvider initialised")
    }
}
