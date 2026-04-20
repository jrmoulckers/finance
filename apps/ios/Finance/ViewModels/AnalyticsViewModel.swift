// SPDX-License-Identifier: BUSL-1.1

// AnalyticsViewModel.swift
// Finance
//
// ViewModel for the advanced analytics screen. Loads transaction and
// account data, runs the on-device analytics engine, and exposes
// computed insights for the view layer.
//
// Uses @Observable (Observation framework) and @MainActor for
// SwiftUI-compatible state management.
//
// References: #269

import Observation
import os
import SwiftUI

@Observable
final class AnalyticsViewModel {
    private let transactionRepository: TransactionRepository
    private let accountRepository: AccountRepository
    private let engine: AnalyticsEngineProtocol
    private let formatter: any SwiftExportFormatterModule

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AnalyticsViewModel"
    )

    // MARK: - Published State

    var summary: AnalyticsSummary?
    var selectedPeriod: AnalyticsPeriod = .sixMonths
    var isLoading = false
    var errorMessage: String?

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message.
    func dismissError() { errorMessage = nil }

    // MARK: - Init

    init(
        transactionRepository: TransactionRepository,
        accountRepository: AccountRepository,
        engine: AnalyticsEngineProtocol = AnalyticsEngine.shared,
        formatter: any SwiftExportFormatterModule = SwiftExportBridgeProvider.shared.formatter
    ) {
        self.transactionRepository = transactionRepository
        self.accountRepository = accountRepository
        self.engine = engine
        self.formatter = formatter
    }

    // MARK: - Data Loading

    func loadAnalytics() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let transactions = transactionRepository.getTransactions()
            async let accounts = accountRepository.getAccounts()

            let (txns, accts) = try await (transactions, accounts)
            let currencyCode = accts.first?.currencyCode ?? "USD"

            let result = await engine.computeSummary(
                transactions: txns,
                accounts: accts,
                period: selectedPeriod,
                currencyCode: currencyCode
            )

            summary = result

            Self.logger.debug(
                "Analytics loaded: \(result.topCategories.count, privacy: .public) categories"
            )
        } catch {
            errorMessage = String(localized: "Failed to load analytics. Please try again.")
            Self.logger.error("Analytics load failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Formatting

    func formatCurrency(_ amountMinorUnits: Int64) -> String {
        let code = summary?.currencyCode ?? "USD"
        return formatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: code,
            showSign: false
        )
    }

    func formatSignedCurrency(_ amountMinorUnits: Int64) -> String {
        let code = summary?.currencyCode ?? "USD"
        return formatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: code,
            showSign: true
        )
    }
}
