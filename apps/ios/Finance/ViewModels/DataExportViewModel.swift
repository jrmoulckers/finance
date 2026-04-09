// SPDX-License-Identifier: BUSL-1.1

// DataExportViewModel.swift
// Finance
//
// ViewModel for the enhanced data export screen. Manages filter state
// (date range, account selection, format), drives export progress, and
// produces a shareable file URL on completion. Uses @Observable (iOS 17+).
// Refs #680

import Foundation
import Observation
import os

// MARK: - Export Progress Step

/// Discrete steps reported during an export operation, used to drive
/// both the progress bar and VoiceOver announcements.
enum ExportProgressStep: String, Sendable {
    case idle
    case fetchingAccounts
    case fetchingTransactions
    case fetchingBudgets
    case fetchingGoals
    case filtering
    case encoding
    case writingFile
    case complete

    var displayName: String {
        switch self {
        case .idle: String(localized: "Ready")
        case .fetchingAccounts: String(localized: "Fetching accounts…")
        case .fetchingTransactions: String(localized: "Fetching transactions…")
        case .fetchingBudgets: String(localized: "Fetching budgets…")
        case .fetchingGoals: String(localized: "Fetching goals…")
        case .filtering: String(localized: "Filtering data…")
        case .encoding: String(localized: "Encoding export…")
        case .writingFile: String(localized: "Writing file…")
        case .complete: String(localized: "Export complete")
        }
    }

    /// Approximate progress fraction (0.0–1.0) for the progress bar.
    var progressFraction: Double {
        switch self {
        case .idle: 0
        case .fetchingAccounts: 0.1
        case .fetchingTransactions: 0.25
        case .fetchingBudgets: 0.35
        case .fetchingGoals: 0.45
        case .filtering: 0.6
        case .encoding: 0.75
        case .writingFile: 0.9
        case .complete: 1.0
        }
    }
}

// MARK: - DataExportViewModel

@Observable
@MainActor
final class DataExportViewModel {

    // MARK: - Filter State

    /// The selected export format (CSV or JSON).
    var selectedFormat: ExportFormat = .csv

    /// Whether date-range filtering is enabled.
    var dateFilterEnabled: Bool = false

    /// Start date for the date-range filter (defaults to 30 days ago).
    var startDate: Date = Calendar.current.date(
        byAdding: .month, value: -1, to: .now
    ) ?? .now

    /// End date for the date-range filter (defaults to today).
    var endDate: Date = .now

    /// IDs of accounts selected for export. Empty means all accounts.
    var selectedAccountIDs: Set<String> = []

    // MARK: - Data

    /// All available accounts loaded from the repository.
    private(set) var availableAccounts: [AccountItem] = []

    /// Whether accounts have been loaded at least once.
    private(set) var hasLoadedAccounts: Bool = false

    // MARK: - Export Progress

    /// Whether an export is currently in flight.
    private(set) var isExporting: Bool = false

    /// Current step of the export pipeline.
    private(set) var progressStep: ExportProgressStep = .idle

    /// Fractional progress (0.0–1.0) for the progress bar.
    var progressFraction: Double { progressStep.progressFraction }

    /// User-facing description of the current progress step.
    var progressDescription: String { progressStep.displayName }

    // MARK: - Result State

    /// File URL produced by a successful export, used to drive the share sheet.
    var exportedFileURL: URL?

    /// Whether the share sheet should be presented.
    var showingShareSheet: Bool = false

    /// Error message from a failed export.
    var exportErrorMessage: String?

    /// Whether the export error alert should be shown.
    var showingExportError: Bool = false

    // MARK: - Computed Helpers

    /// Human-readable summary of the current filter configuration.
    var filterSummary: String {
        ExportFilter.filterSummary(
            dateFilterEnabled: dateFilterEnabled,
            startDate: startDate,
            endDate: endDate,
            selectedAccountCount: selectedAccountIDs.count,
            totalAccountCount: availableAccounts.count,
            format: selectedFormat
        )
    }

    /// Whether the current filter configuration is valid for export.
    var canExport: Bool {
        if dateFilterEnabled && startDate > endDate { return false }
        return true
    }

    /// `true` when all accounts are selected (or none explicitly selected).
    var allAccountsSelected: Bool {
        selectedAccountIDs.isEmpty
            || selectedAccountIDs.count == availableAccounts.count
    }

    // MARK: - Private Dependencies

    private let accountRepository: AccountRepository
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let goalRepository: GoalRepository
    private let exportService: DataExportService

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DataExportViewModel"
    )

    // MARK: - Initialisation

    /// Creates a new export view model.
    ///
    /// - Parameters:
    ///   - accountRepository: Data source for accounts.
    ///   - transactionRepository: Data source for transactions.
    ///   - budgetRepository: Data source for budgets.
    ///   - goalRepository: Data source for goals.
    ///   - exportService: Service used to serialise data for export.
    init(
        accountRepository: AccountRepository = MockAccountRepository(),
        transactionRepository: TransactionRepository = MockTransactionRepository(),
        budgetRepository: BudgetRepository = MockBudgetRepository(),
        goalRepository: GoalRepository = MockGoalRepository(),
        exportService: DataExportService = DataExportService()
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.goalRepository = goalRepository
        self.exportService = exportService
    }

    // MARK: - Data Loading

    /// Fetches accounts from the repository to populate the account picker.
    func loadAccounts() async {
        do {
            availableAccounts = try await accountRepository.getAccounts()
            hasLoadedAccounts = true
            Self.logger.info(
                "Loaded \(self.availableAccounts.count, privacy: .public) accounts for export picker"
            )
        } catch {
            Self.logger.error(
                "Failed to load accounts: \(error.localizedDescription, privacy: .public)"
            )
            availableAccounts = []
            hasLoadedAccounts = true
        }
    }

    // MARK: - Account Selection

    /// Toggles selection of a single account.
    func toggleAccount(_ account: AccountItem) {
        if selectedAccountIDs.contains(account.id) {
            selectedAccountIDs.remove(account.id)
        } else {
            selectedAccountIDs.insert(account.id)
        }
    }

    /// Selects all available accounts.
    func selectAllAccounts() {
        selectedAccountIDs = Set(availableAccounts.map(\.id))
    }

    /// Deselects all accounts (which means "export all" — no filter).
    func deselectAllAccounts() {
        selectedAccountIDs = []
    }

    /// Toggles between "all selected" and "none selected".
    func toggleAllAccounts() {
        if allAccountsSelected {
            deselectAllAccounts()
        } else {
            selectAllAccounts()
        }
    }

    // MARK: - Export

    /// Runs the full export pipeline: fetch → filter → encode → share.
    ///
    /// Progress is reported through ``progressStep`` so the view can
    /// display an animated progress bar and VoiceOver announcements.
    func exportData() async {
        guard canExport else { return }
        guard !isExporting else { return }

        isExporting = true
        exportedFileURL = nil
        exportErrorMessage = nil

        defer {
            isExporting = false
        }

        do {
            // Step 1: Fetch accounts
            updateProgress(.fetchingAccounts)
            let accounts = try await accountRepository.getAccounts()

            // Step 2: Fetch transactions
            updateProgress(.fetchingTransactions)
            let allTransactions = try await transactionRepository.getTransactions()

            // Step 3: Apply filters
            updateProgress(.filtering)
            let filteredTransactions = ExportFilter.filterTransactions(
                allTransactions,
                accounts: accounts,
                startDate: dateFilterEnabled ? startDate : nil,
                endDate: dateFilterEnabled ? endDate : nil,
                selectedAccountIDs: selectedAccountIDs
            )

            let filteredAccounts = ExportFilter.filterAccounts(
                accounts,
                selectedIDs: selectedAccountIDs
            )

            // Step 4: Encode and write
            let fileURL: URL

            switch selectedFormat {
            case .csv:
                updateProgress(.encoding)
                guard !filteredTransactions.isEmpty else {
                    throw ExportError.noDataToExport
                }
                updateProgress(.writingFile)
                fileURL = try await exportService.exportCSV(
                    transactions: filteredTransactions
                )

            case .json:
                updateProgress(.fetchingBudgets)
                let budgets = try await budgetRepository.getBudgets()
                updateProgress(.fetchingGoals)
                let goals = try await goalRepository.getGoals()
                updateProgress(.encoding)
                updateProgress(.writingFile)
                fileURL = try await exportService.exportJSON(
                    accounts: filteredAccounts,
                    transactions: filteredTransactions,
                    budgets: budgets,
                    goals: goals
                )
            }

            // Step 5: Complete
            updateProgress(.complete)
            exportedFileURL = fileURL
            showingShareSheet = true

            Self.logger.info(
                "Export completed: \(self.selectedFormat.rawValue, privacy: .public), "
                + "\(filteredTransactions.count, privacy: .public) transactions, "
                + "\(filteredAccounts.count, privacy: .public) accounts"
            )
        } catch {
            Self.logger.error(
                "Export failed: \(error.localizedDescription, privacy: .public)"
            )
            exportErrorMessage = error.localizedDescription
            showingExportError = true
            updateProgress(.idle)
        }
    }

    // MARK: - Private Helpers

    /// Updates the progress step and logs the transition.
    private func updateProgress(_ step: ExportProgressStep) {
        progressStep = step
    }
}
