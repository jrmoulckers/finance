// SPDX-License-Identifier: BUSL-1.1

// DebtPayoffViewModel.swift
// Finance
//
// ViewModel for the debt payoff surface (#2175). Loads debts from an
// injectable provider and exposes a multi-debt rollup for the combined ring.

import Observation
import Foundation
import FinanceShared
import os

// MARK: - Provider

/// Supplies debt payoff progress data to the view model.
///
/// Abstracted so the screen can be driven by sample data today and wired to
/// real loan accounts once the shared model tracks original principal and
/// payment terms (see `## Needs Human Action`).
protocol DebtPayoffProviding: Sendable {
    func loadDebts() async throws -> [DebtPayoffProgress]
}

// MARK: - Sample Provider

/// Deterministic sample debts for previews and as a placeholder data source.
struct SampleDebtPayoffProvider: DebtPayoffProviding {
    func loadDebts() async throws -> [DebtPayoffProgress] {
        [
            DebtPayoffProgress(
                id: "loan-gradplus", name: "Grad PLUS Loan",
                originalPrincipalMinorUnits: 40_000_00,
                currentBalanceMinorUnits: 18_000_00,
                monthlyPaymentMinorUnits: 600_00,
                annualInterestRateBasisPoints: 650
            ),
            DebtPayoffProgress(
                id: "loan-stafford", name: "Stafford Loan",
                originalPrincipalMinorUnits: 22_500_00,
                currentBalanceMinorUnits: 6_300_00,
                monthlyPaymentMinorUnits: 350_00,
                annualInterestRateBasisPoints: 480
            ),
            DebtPayoffProgress(
                id: "loan-private", name: "Private Refi",
                originalPrincipalMinorUnits: 15_000_00,
                currentBalanceMinorUnits: 0,
                monthlyPaymentMinorUnits: 250_00,
                annualInterestRateBasisPoints: 540
            ),
        ]
    }
}

// MARK: - ViewModel

@Observable
final class DebtPayoffViewModel {
    private let provider: DebtPayoffProviding

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DebtPayoffViewModel"
    )

    var debts: [DebtPayoffProgress] = []
    var isLoading = false
    var errorMessage: String?

    /// Reference "today" for projecting payoff dates. Injectable for tests.
    let referenceDate: Date

    /// Combined progress across all debts for the headline ring.
    var portfolio: DebtPortfolioProgress { DebtPortfolioProgress(debts: debts) }

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    init(
        provider: DebtPayoffProviding = SampleDebtPayoffProvider(),
        referenceDate: Date = .now
    ) {
        self.provider = provider
        self.referenceDate = referenceDate
    }

    func loadDebts() async {
        isLoading = true
        defer { isLoading = false }

        do {
            debts = try await provider.loadDebts()
        } catch {
            errorMessage = String(localized: "Failed to load debt payoff progress. Please try again.")
            Self.logger.error("Debt payoff load failed: \(error.localizedDescription, privacy: .public)")
            debts = []
        }
    }
}
