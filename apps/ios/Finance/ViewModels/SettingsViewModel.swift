// SPDX-License-Identifier: BUSL-1.1

// SettingsViewModel.swift
// Finance
//
// ViewModel for the settings screen. Manages user preferences for
// currency, notifications, biometric auth, data export, and sync status.
// Settings are persisted via UserDefaults so they survive app restarts.
// Refs #565

import Foundation
import Observation
import os

// MARK: - UserDefaults Keys

/// Centralised `UserDefaults` keys for settings persistence.
///
/// Prefixed with `finance_` to avoid collisions with system or
/// third-party keys when using the standard suite.
private enum SettingsKeys {
    static let currency = "finance_currency"
    static let notifications = "finance_notifications"
    static let budgetAlerts = "finance_budget_alerts"
    static let goalMilestones = "finance_goal_milestones"
    static let lastSyncDate = "finance_last_sync_date"
    static let pendingChangesCount = "finance_pending_changes_count"
}

// MARK: - SettingsViewModel

@Observable
@MainActor
final class SettingsViewModel {

    // MARK: - Persisted Preferences

    /// The user's preferred currency code, persisted to UserDefaults.
    var selectedCurrency: String {
        didSet { defaults.set(selectedCurrency, forKey: SettingsKeys.currency) }
    }

    /// Master toggle for push notifications, persisted to UserDefaults.
    var notificationsEnabled: Bool {
        didSet { defaults.set(notificationsEnabled, forKey: SettingsKeys.notifications) }
    }

    /// Whether budget-threshold alerts are enabled, persisted to UserDefaults.
    var budgetAlertsEnabled: Bool {
        didSet { defaults.set(budgetAlertsEnabled, forKey: SettingsKeys.budgetAlerts) }
    }

    /// Whether goal-milestone notifications are enabled, persisted to UserDefaults.
    var goalMilestonesEnabled: Bool {
        didSet { defaults.set(goalMilestonesEnabled, forKey: SettingsKeys.goalMilestones) }
    }

    // MARK: - Biometric State

    /// Whether the biometric app-lock is currently enabled.
    var biometricEnabled: Bool = UserDefaults.standard.bool(
        forKey: BiometricAuthManager.appLockEnabledKey
    )

    // MARK: - App Info

    /// App version from the main bundle (e.g. "1.0.0").
    let appVersion: String

    /// Build number from the main bundle (e.g. "42").
    let buildNumber: String

    // MARK: - Export State

    /// Controls visibility of the export format confirmation dialog.
    var showingExportConfirmation = false

    /// `true` while an export operation is in flight.
    var isExporting = false

    /// The file URL produced by the last successful export, used to
    /// drive the share sheet presentation.
    var exportedFileURL: URL?

    /// `true` when the share sheet should be presented.
    var showingShareSheet = false

    /// User-facing error message from a failed export.
    var exportErrorMessage: String?

    /// Controls visibility of the export error alert.
    var showingExportError = false

    // MARK: - Delete Confirmation

    /// Controls visibility of the destructive-delete confirmation dialog.
    var showingDeleteConfirmation = false

    // MARK: - Biometric Error State

    /// The error returned by the last failed biometric evaluation.
    var biometricError: BiometricError?

    /// Controls visibility of the biometric error alert.
    var showingBiometricError = false
    var errorMessage: String?

    /// Whether a general error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    // MARK: - Sync State

    /// The date of the last successful sync, read from UserDefaults.
    var lastSyncDate: Date?

    /// Number of local changes not yet pushed to the server.
    var pendingChangesCount: Int = 0

    /// `true` while a manual sync operation is in progress.
    var isSyncing = false

    // MARK: - Constants

    let supportedCurrencies = [
        ("USD", "US Dollar"), ("EUR", "Euro"), ("GBP", "British Pound"),
        ("CAD", "Canadian Dollar"), ("JPY", "Japanese Yen"),
        ("AUD", "Australian Dollar"), ("CHF", "Swiss Franc"),
    ]

    // MARK: - Private

    private let defaults: UserDefaults
    private let accountRepository: AccountRepository
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let goalRepository: GoalRepository
    private let exportService: DataExportService

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SettingsViewModel"
    )

    // MARK: - Init

    /// Creates a new settings view model.
    ///
    /// - Parameters:
    ///   - accountRepository: Data source for accounts.
    ///   - transactionRepository: Data source for transactions.
    ///   - budgetRepository: Data source for budgets.
    ///   - goalRepository: Data source for goals.
    ///   - exportService: Service used to serialise data for export.
    ///   - defaults: The `UserDefaults` suite to use for persistence.
    init(
        accountRepository: AccountRepository = MockAccountRepository(),
        transactionRepository: TransactionRepository = MockTransactionRepository(),
        budgetRepository: BudgetRepository = MockBudgetRepository(),
        goalRepository: GoalRepository = MockGoalRepository(),
        exportService: DataExportService = DataExportService(),
        defaults: UserDefaults = .standard
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.goalRepository = goalRepository
        self.exportService = exportService
        self.defaults = defaults

        // Hydrate persisted preferences (use sensible defaults for first launch)
        self.selectedCurrency = defaults.string(forKey: SettingsKeys.currency) ?? "USD"
        self.notificationsEnabled = Self.bool(
            forKey: SettingsKeys.notifications, default: true, in: defaults
        )
        self.budgetAlertsEnabled = Self.bool(
            forKey: SettingsKeys.budgetAlerts, default: true, in: defaults
        )
        self.goalMilestonesEnabled = Self.bool(
            forKey: SettingsKeys.goalMilestones, default: true, in: defaults
        )
        self.lastSyncDate = defaults.object(forKey: SettingsKeys.lastSyncDate) as? Date
        self.pendingChangesCount = defaults.integer(forKey: SettingsKeys.pendingChangesCount)

        self.appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        self.buildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    // MARK: - Settings Loading

    func loadSettings() async {
        biometricEnabled = defaults.bool(
            forKey: BiometricAuthManager.appLockEnabledKey
        )
        lastSyncDate = defaults.object(forKey: SettingsKeys.lastSyncDate) as? Date
        pendingChangesCount = defaults.integer(forKey: SettingsKeys.pendingChangesCount)
    }

    // MARK: - Biometric Toggle

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
            defaults.set(
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

    // MARK: - Export Authentication

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

    // MARK: - Data Export

    /// Exports all financial data in the specified format.
    ///
    /// Fetches current data from all repositories, serialises it via
    /// ``DataExportService``, and stores the resulting file URL so the
    /// view can present a share sheet.
    ///
    /// - Parameter format: The desired export format (`.json` or `.csv`).
    func exportData(format: ExportFormat) async {
        isExporting = true
        defer { isExporting = false }

        do {
            let fileURL: URL

            switch format {
            case .json:
                async let accounts = accountRepository.getAccounts()
                async let transactions = transactionRepository.getTransactions()
                async let budgets = budgetRepository.getBudgets()
                async let goals = goalRepository.getGoals()

                fileURL = try await exportService.exportJSON(
                    accounts: accounts,
                    transactions: transactions,
                    budgets: budgets,
                    goals: goals
                )

            case .csv:
                let transactions = try await transactionRepository.getTransactions()
                fileURL = try await exportService.exportCSV(transactions: transactions)
            }

            exportedFileURL = fileURL
            showingShareSheet = true
            Self.logger.info(
                "Export completed: \(format.rawValue, privacy: .public)"
            )
        } catch {
            Self.logger.error(
                "Export failed: \(error.localizedDescription, privacy: .public)"
            )
            exportErrorMessage = error.localizedDescription
            showingExportError = true
        }
    }

    // MARK: - Sync

    /// Triggers a manual sync operation.
    ///
    /// In the current implementation this simulates a sync with a brief
    /// delay. Once the KMP sync module is integrated, this will call
    /// into the shared `SyncManager`.
    func syncNow() async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        Self.logger.info("Manual sync started")

        // TODO: Replace with KMP SyncManager call
        try? await Task.sleep(for: .seconds(1))

        let now = Date.now
        lastSyncDate = now
        defaults.set(now, forKey: SettingsKeys.lastSyncDate)
        pendingChangesCount = 0
        defaults.set(0, forKey: SettingsKeys.pendingChangesCount)

        Self.logger.info("Manual sync completed")
    }

    // MARK: - Helpers

    /// Reads a `Bool` from `UserDefaults`, returning `defaultValue` when
    /// the key has never been written (avoids the implicit `false` that
    /// `UserDefaults.bool(forKey:)` returns for missing keys).
    private static func bool(
        forKey key: String,
        default defaultValue: Bool,
        in defaults: UserDefaults
    ) -> Bool {
        defaults.object(forKey: key) == nil
            ? defaultValue
            : defaults.bool(forKey: key)
    }
}