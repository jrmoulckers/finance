// SPDX-License-Identifier: BUSL-1.1

// SettingsViewModel.swift
// Finance
//
// ViewModel for the settings screen. Manages user preferences for
// currency, notifications, biometric auth, and data management.

import Foundation
import Observation
import os

@Observable
@MainActor
final class SettingsViewModel {
    var selectedCurrency = "USD"
    var notificationsEnabled = true
    var budgetAlerts = true
    var goalMilestones = true
    var biometricEnabled: Bool = UserDefaults.standard.bool(
        forKey: BiometricAuthManager.appLockEnabledKey
    )
    var appVersion = "1.0.0"
    var buildNumber = "1"
    var showingExportConfirmation = false
    var isExporting = false
    var showingDeleteConfirmation = false
    var biometricError: BiometricError?
    var showingBiometricError = false
    var exportFormat: DataExportService.ExportFormat = .csv
    var exportFileURL: URL?
    var showExportSheet = false
    var exportError: String?
    var showingExportError = false

    private let accountRepository: AccountRepository
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let goalRepository: GoalRepository
    private let exportService = DataExportService()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SettingsViewModel"
    )

    let supportedCurrencies = [
        ("USD", "US Dollar"), ("EUR", "Euro"), ("GBP", "British Pound"),
        ("CAD", "Canadian Dollar"), ("JPY", "Japanese Yen"),
        ("AUD", "Australian Dollar"), ("CHF", "Swiss Franc"),
    ]

    init(
        accountRepository: AccountRepository = MockAccountRepository(),
        transactionRepository: TransactionRepository = MockTransactionRepository(),
        budgetRepository: BudgetRepository = MockBudgetRepository(),
        goalRepository: GoalRepository = MockGoalRepository()
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.goalRepository = goalRepository
    }

    func loadSettings() async {
        biometricEnabled = UserDefaults.standard.bool(
            forKey: BiometricAuthManager.appLockEnabledKey
        )
        // TODO: Load settings from KMP shared preferences and Keychain
    }

    /// Toggles biometric app lock, requiring authentication to confirm
    /// the change in both directions (enable and disable).
    func toggleBiometric(using manager: BiometricAuthManager) async {
        let newValue = !biometricEnabled
        let reason = newValue
            ? String(localized: "Verify your identity to enable biometric lock")
            : String(localized: "Verify your identity to disable biometric lock")

        do {
            try await manager.authenticate(reason: reason)
            biometricEnabled = newValue
            UserDefaults.standard.set(
                newValue,
                forKey: BiometricAuthManager.appLockEnabledKey
            )
            Self.logger.info(
                "Biometric app lock \(newValue ? "enabled" : "disabled", privacy: .public)"
            )
        } catch let error as BiometricError {
            Self.logger.warning(
                "Biometric toggle failed: \(error.localizedDescription, privacy: .public)"
            )
            if case .cancelled = error { return }
            biometricError = error
            showingBiometricError = true
        } catch {
            Self.logger.error(
                "Biometric toggle unexpected error: \(error.localizedDescription, privacy: .public)"
            )
            biometricError = .unknown(underlying: error)
            showingBiometricError = true
        }
    }

    /// Authenticates the user before allowing data export.
    ///
    /// Export contains sensitive financial data and is gated behind
    /// biometric / passcode authentication regardless of whether
    /// biometric app lock is enabled.
    ///
    /// - Returns: `true` if the user was successfully authenticated.
    func authenticateForExport(using manager: BiometricAuthManager) async -> Bool {
        do {
            try await manager.authenticate(
                reason: String(localized: "Verify your identity to export financial data")
            )
            Self.logger.info("Export data authentication succeeded")
            return true
        } catch let error as BiometricError {
            Self.logger.warning(
                "Export auth failed: \(error.localizedDescription, privacy: .public)"
            )
            if case .cancelled = error { return false }
            biometricError = error
            showingBiometricError = true
            return false
        } catch {
            Self.logger.error(
                "Export auth unexpected error: \(error.localizedDescription, privacy: .public)"
            )
            biometricError = .unknown(underlying: error)
            showingBiometricError = true
            return false
        }
    }

    /// Exports all user financial data in the selected format.
    ///
    /// Fetches current data from all repositories, passes it to the
    /// `DataExportService`, and presents the resulting file via the
    /// share sheet. Only metadata (format, filename) is logged —
    /// actual financial values are never written to the log.
    func exportData() async {
        isExporting = true
        defer { isExporting = false }

        Self.logger.info(
            "Starting data export as \(self.exportFormat.rawValue, privacy: .public)"
        )

        do {
            async let accounts = accountRepository.getAccounts()
            async let transactions = transactionRepository.getTransactions()
            async let budgets = budgetRepository.getBudgets()
            async let goals = goalRepository.getGoals()

            let exportData = DataExportService.ExportData(
                accounts: try await accounts,
                transactions: try await transactions,
                budgets: try await budgets,
                goals: try await goals
            )

            let fileURL = try await exportService.export(
                data: exportData,
                format: exportFormat
            )

            exportFileURL = fileURL
            showExportSheet = true

            Self.logger.info(
                "Export complete: \(fileURL.lastPathComponent, privacy: .public)"
            )
        } catch {
            Self.logger.error(
                "Export failed: \(error.localizedDescription, privacy: .public)"
            )
            exportError = error.localizedDescription
            showingExportError = true
        }
    }
}