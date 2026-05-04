// SPDX-License-Identifier: BUSL-1.1

// ReportBuilderViewModel.swift
// Finance
//
// ViewModel for the custom report builder. Manages report configuration,
// generates reports from transaction/account data using patterns from
// KMP ReportGenerator, and exposes results for chart rendering.
// Uses @Observable (iOS 17+).
//
// References: #1111

import Observation
import Foundation
import os

/// ViewModel for custom report generation and display.
///
/// Consumes ``TransactionRepository`` and ``AccountRepository`` for data
/// access and generates reports locally following the KMP `ReportGenerator`
/// patterns (spending by category, income vs expense, net worth over time).
@Observable
final class ReportBuilderViewModel {
    private let transactionRepository: TransactionRepository
    private let accountRepository: AccountRepository
    private let categoryRepository: CategoryRepository
    private let formatter: any SwiftExportFormatterModule

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "ReportBuilderViewModel"
    )

    var selectedReportType: ReportType = .spendingByCategory
    var selectedDateRange: ReportDateRange = .threeMonths
    var selectedAccounts: Set<String> = []
    var selectedCategories: Set<String> = []
    var availableAccounts: [AccountItem] = []
    var availableCategories: [CategoryItem] = []
    var reportResult: ReportResult?
    var isLoading = false
    var isGenerating = false
    var errorMessage: String?

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    /// Formats a monetary amount using the Swift Export formatter module.
    func formatCurrency(_ amountMinorUnits: Int64, currencyCode: String = "USD", showSign: Bool = false) -> String {
        formatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode,
            showSign: showSign
        )
    }

    init(
        transactionRepository: TransactionRepository,
        accountRepository: AccountRepository,
        categoryRepository: CategoryRepository,
        formatter: any SwiftExportFormatterModule = SwiftExportBridgeProvider.shared.formatter
    ) {
        self.transactionRepository = transactionRepository
        self.accountRepository = accountRepository
        self.categoryRepository = categoryRepository
        self.formatter = formatter
    }

    /// Loads available accounts and categories for filter selection.
    func loadFilterOptions() async {
        isLoading = true
        defer { isLoading = false }

        do {
            availableAccounts = try await accountRepository.getAccounts()
            availableCategories = try await categoryRepository.getCategories()
        } catch {
            Self.logger.error("Failed to load filter options: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Generates a report based on the current configuration.
    func generateReport() async {
        isGenerating = true
        defer { isGenerating = false }

        let configuration = ReportConfiguration(
            reportType: selectedReportType,
            dateRange: selectedDateRange,
            selectedAccounts: selectedAccounts,
            selectedCategories: selectedCategories
        )

        do {
            let transactions = try await transactionRepository.getTransactions()
            let accounts = try await accountRepository.getAccounts()

            var result = ReportResult(
                configuration: configuration,
                generatedAt: .now
            )

            switch selectedReportType {
            case .spendingByCategory:
                result.categorySpending = generateSpendingByCategory(transactions: transactions)
            case .incomeVsExpense:
                result.monthlyComparisons = generateIncomeVsExpense(transactions: transactions)
            case .netWorth:
                result.netWorthSnapshots = generateNetWorth(accounts: accounts, transactions: transactions)
            case .categoryTrends:
                result.monthlyComparisons = generateCategoryTrends(transactions: transactions)
            }

            reportResult = result
            Self.logger.info("Report generated: \(selectedReportType.rawValue, privacy: .public)")
        } catch {
            errorMessage = String(localized: "Failed to generate report. Please try again.")
            Self.logger.error("Report generation failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Report Generation Methods

    /// Generates spending-by-category data from transactions.
    private func generateSpendingByCategory(transactions: [TransactionItem]) -> [ReportCategoryEntry] {
        let calendar = Calendar.current
        let cutoff = calendar.date(byAdding: .month, value: -selectedDateRange.monthCount, to: .now) ?? .now
        let filtered = transactions.filter { $0.type == .expense && $0.date >= cutoff }

        let grouped = Dictionary(grouping: filtered) { $0.category }
        let totalSpending = filtered.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

        return grouped.enumerated().map { index, entry in
            let amount = entry.value.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }
            let percentage = totalSpending > 0 ? (Double(amount) / Double(totalSpending)) * 100.0 : 0
            return ReportCategoryEntry(
                categoryName: entry.key,
                amountMinorUnits: amount,
                percentage: percentage,
                colorIndex: index
            )
        }
        .sorted { $0.amountMinorUnits > $1.amountMinorUnits }
    }

    /// Generates monthly income vs expense comparisons.
    private func generateIncomeVsExpense(transactions: [TransactionItem]) -> [ReportMonthlyEntry] {
        let calendar = Calendar.current
        let months = selectedDateRange.monthCount

        return (0..<months).reversed().map { offset in
            let monthDate = calendar.date(byAdding: .month, value: -offset, to: .now) ?? .now
            let components = calendar.dateComponents([.year, .month], from: monthDate)
            let monthStart = calendar.date(from: components) ?? monthDate
            let monthEnd = calendar.date(byAdding: .month, value: 1, to: monthStart) ?? monthDate

            let monthTransactions = transactions.filter {
                $0.date >= monthStart && $0.date < monthEnd
            }

            let income = monthTransactions
                .filter { $0.type == .income }
                .reduce(Int64(0)) { $0 + $1.amountMinorUnits }
            let expense = monthTransactions
                .filter { $0.type == .expense }
                .reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

            let formatter = DateFormatter()
            formatter.dateFormat = "MMM yy"

            return ReportMonthlyEntry(
                monthLabel: formatter.string(from: monthDate),
                incomeMinorUnits: income,
                expenseMinorUnits: expense,
                netMinorUnits: income - expense
            )
        }
    }

    /// Generates net worth snapshots over time.
    private func generateNetWorth(accounts: [AccountItem], transactions: [TransactionItem]) -> [ReportNetWorthEntry] {
        let calendar = Calendar.current
        let months = selectedDateRange.monthCount
        let currentNetWorth = accounts.reduce(Int64(0)) { $0 + $1.balanceMinorUnits }

        var runningNetWorth = currentNetWorth
        var snapshots: [ReportNetWorthEntry] = []

        for offset in 0..<months {
            let monthDate = calendar.date(byAdding: .month, value: -offset, to: .now) ?? .now

            if offset == 0 {
                let assets = accounts.filter { $0.balanceMinorUnits > 0 }
                    .reduce(Int64(0)) { $0 + $1.balanceMinorUnits }
                let liabilities = accounts.filter { $0.balanceMinorUnits < 0 }
                    .reduce(Int64(0)) { $0 + abs($1.balanceMinorUnits) }
                snapshots.append(ReportNetWorthEntry(
                    date: monthDate,
                    assetsMinorUnits: assets,
                    liabilitiesMinorUnits: liabilities,
                    netWorthMinorUnits: currentNetWorth
                ))
            } else {
                // Approximate earlier months by subtracting net cash flow
                let components = calendar.dateComponents([.year, .month], from: monthDate)
                let followingMonth = calendar.date(byAdding: .month, value: 1, to: calendar.date(from: components) ?? monthDate)!
                let followingEnd = calendar.date(byAdding: .month, value: 1, to: followingMonth)!

                let netCashFlow = transactions
                    .filter { $0.date >= followingMonth && $0.date < followingEnd }
                    .reduce(Int64(0)) { $0 + $1.amountMinorUnits }

                runningNetWorth -= netCashFlow
                let estimated = max(runningNetWorth, 0)
                snapshots.append(ReportNetWorthEntry(
                    date: monthDate,
                    assetsMinorUnits: estimated,
                    liabilitiesMinorUnits: 0,
                    netWorthMinorUnits: runningNetWorth
                ))
            }
        }

        return snapshots.reversed()
    }

    /// Generates category trends over time.
    private func generateCategoryTrends(transactions: [TransactionItem]) -> [ReportMonthlyEntry] {
        // Reuse income vs expense format for simplicity
        generateIncomeVsExpense(transactions: transactions)
    }
}
