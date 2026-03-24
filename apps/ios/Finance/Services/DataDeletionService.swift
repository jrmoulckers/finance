// SPDX-License-Identifier: BUSL-1.1

// DataDeletionService.swift
// Finance
//
// GDPR "Delete Everything" service. Orchestrates biometric authentication,
// repository data deletion, Keychain token clearing, and UserDefaults
// reset in a single auditable flow. Refs #652

import Foundation
import os

// MARK: - DataDeletionError

/// Errors that can occur during the GDPR data deletion flow.
enum DataDeletionError: LocalizedError, Sendable {
    case authenticationRequired
    case authenticationFailed(underlying: Error)
    case repositoryDeletionFailed(repository: String, underlying: Error)
    case keychainClearFailed(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .authenticationRequired:
            String(localized: "Authentication is required before deleting data.")
        case .authenticationFailed:
            String(localized: "Authentication failed. Data was not deleted.")
        case .repositoryDeletionFailed(let repository, _):
            String(localized: "Failed to delete data from \(repository). Please try again.")
        case .keychainClearFailed:
            String(localized: "Failed to clear stored credentials. Please try again.")
        }
    }
}

// MARK: - DataDeletionResult

/// The outcome of a GDPR "Delete Everything" operation.
enum DataDeletionResult: Sendable, Equatable {
    /// All data was deleted successfully.
    case success
    /// Deletion was not attempted because authentication failed or was cancelled.
    case authenticationFailed
    /// One or more steps failed. The associated message describes what went wrong.
    case failure(message: String)
}

// MARK: - DataDeletionService

/// Orchestrates the GDPR "Delete Everything" flow.
///
/// The service:
/// 1. Authenticates the user via biometrics / device passcode.
/// 2. Deletes all data from each repository (accounts, transactions, budgets, goals).
/// 3. Clears all Keychain tokens (auth tokens, encryption keys).
/// 4. Resets UserDefaults (standard suite and widget app group suite).
///
/// All operations are logged via `os.Logger`. **No sensitive financial data
/// is ever written to the log** — only category names and success/failure status.
///
/// - Important: This operation is irreversible. Callers must confirm the user's
///   intent with a destructive confirmation dialog before invoking ``deleteAllData()``.
actor DataDeletionService {

    // MARK: - Dependencies

    private let accountRepository: AccountRepository
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let goalRepository: GoalRepository
    private let biometricAuth: BiometricAuthManaging
    private let keychain: KeychainManaging
    private let standardDefaults: UserDefaults
    private let appGroupDefaults: UserDefaults?

    // MARK: - Constants

    /// App group suite name for widget / watch extension shared data.
    static let appGroupSuiteName = "group.com.finance.shared"

    /// Keychain keys that must be cleared during GDPR deletion.
    ///
    /// Mirrors the keys used in `AuthenticationService` and any other
    /// service that stores tokens in the Keychain.
    static let keychainKeys: [String] = [
        "com.finance.auth.accessToken",
        "com.finance.auth.refreshToken",
        "com.finance.auth.userId",
        "com.finance.auth.userEmail",
        "com.finance.auth.userName",
    ]

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DataDeletionService"
    )

    // MARK: - Initialisation

    /// Creates a new data deletion service.
    ///
    /// - Parameters:
    ///   - accountRepository: Data source for accounts.
    ///   - transactionRepository: Data source for transactions.
    ///   - budgetRepository: Data source for budgets.
    ///   - goalRepository: Data source for goals.
    ///   - biometricAuth: Biometric / passcode authentication manager.
    ///   - keychain: Keychain manager for clearing stored secrets.
    ///   - standardDefaults: The standard `UserDefaults` suite.
    ///   - appGroupDefaults: The app group `UserDefaults` suite for widget data.
    init(
        accountRepository: AccountRepository,
        transactionRepository: TransactionRepository,
        budgetRepository: BudgetRepository,
        goalRepository: GoalRepository,
        biometricAuth: BiometricAuthManaging,
        keychain: KeychainManaging,
        standardDefaults: UserDefaults = .standard,
        appGroupDefaults: UserDefaults? = UserDefaults(suiteName: DataDeletionService.appGroupSuiteName)
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.goalRepository = goalRepository
        self.biometricAuth = biometricAuth
        self.keychain = keychain
        self.standardDefaults = standardDefaults
        self.appGroupDefaults = appGroupDefaults
    }

    // MARK: - Public API

    /// Performs the complete GDPR "Delete Everything" flow.
    ///
    /// 1. Authenticates the user via biometrics / passcode.
    /// 2. Deletes all repository data (accounts, transactions, budgets, goals).
    /// 3. Clears all Keychain tokens.
    /// 4. Resets all UserDefaults (standard and app group suites).
    ///
    /// - Returns: A ``DataDeletionResult`` indicating success or the reason for failure.
    /// - Throws: ``DataDeletionError`` if a critical step fails.
    func deleteAllData() async throws -> DataDeletionResult {
        Self.logger.info("GDPR deletion flow initiated")

        // Step 1: Biometric authentication
        do {
            try await biometricAuth.authenticate(
                reason: String(localized: "Verify your identity to delete all data")
            )
            Self.logger.info("GDPR deletion: authentication succeeded")
        } catch let error as BiometricError where error.isCancellation {
            Self.logger.info("GDPR deletion: authentication cancelled by user")
            return .authenticationFailed
        } catch {
            Self.logger.warning(
                "GDPR deletion: authentication failed — \(error.localizedDescription, privacy: .public)"
            )
            return .authenticationFailed
        }

        // Step 2: Delete all repository data
        do {
            try await deleteRepositoryData()
            Self.logger.info("GDPR deletion: all repository data deleted")
        } catch let error as DataDeletionError {
            Self.logger.error(
                "GDPR deletion: repository deletion failed — \(error.localizedDescription, privacy: .public)"
            )
            throw error
        }

        // Step 3: Clear Keychain tokens
        do {
            try clearKeychainTokens()
            Self.logger.info("GDPR deletion: Keychain tokens cleared")
        } catch {
            Self.logger.error(
                "GDPR deletion: Keychain clear failed — \(error.localizedDescription, privacy: .public)"
            )
            throw DataDeletionError.keychainClearFailed(underlying: error)
        }

        // Step 4: Reset UserDefaults
        clearUserDefaults()
        Self.logger.info("GDPR deletion: UserDefaults cleared")

        Self.logger.info("GDPR deletion flow completed successfully")
        return .success
    }

    // MARK: - Private Helpers

    /// Deletes all data from every repository.
    ///
    /// Each repository is called sequentially so that partial-failure
    /// diagnostics are clear in the logs. If any repository fails the
    /// error is surfaced immediately.
    private func deleteRepositoryData() async throws {
        do {
            try await accountRepository.deleteAllAccounts()
            Self.logger.info("GDPR deletion: accounts deleted")
        } catch {
            throw DataDeletionError.repositoryDeletionFailed(
                repository: "accounts", underlying: error
            )
        }

        do {
            try await transactionRepository.deleteAllTransactions()
            Self.logger.info("GDPR deletion: transactions deleted")
        } catch {
            throw DataDeletionError.repositoryDeletionFailed(
                repository: "transactions", underlying: error
            )
        }

        do {
            try await budgetRepository.deleteAllBudgets()
            Self.logger.info("GDPR deletion: budgets deleted")
        } catch {
            throw DataDeletionError.repositoryDeletionFailed(
                repository: "budgets", underlying: error
            )
        }

        do {
            try await goalRepository.deleteAllGoals()
            Self.logger.info("GDPR deletion: goals deleted")
        } catch {
            throw DataDeletionError.repositoryDeletionFailed(
                repository: "goals", underlying: error
            )
        }
    }

    /// Clears all known Keychain items used by the app.
    private func clearKeychainTokens() throws {
        for key in Self.keychainKeys {
            try keychain.delete(key: key)
        }
    }

    /// Resets both the standard and app group `UserDefaults` suites.
    private func clearUserDefaults() {
        if let bundleId = Bundle.main.bundleIdentifier {
            standardDefaults.removePersistentDomain(forName: bundleId)
        }
        standardDefaults.synchronize()

        if let appGroupDefaults {
            appGroupDefaults.removePersistentDomain(
                forName: Self.appGroupSuiteName
            )
            appGroupDefaults.synchronize()
        }
    }
}

// MARK: - BiometricError + Cancellation

extension BiometricError {
    /// Whether the error represents a user-initiated cancellation.
    var isCancellation: Bool {
        if case .cancelled = self { return true }
        return false
    }
}
