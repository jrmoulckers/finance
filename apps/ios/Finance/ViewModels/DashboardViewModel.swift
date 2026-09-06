// SPDX-License-Identifier: BUSL-1.1

// DashboardViewModel.swift
// Finance
//
// ViewModel for the main dashboard screen. Aggregates data from account,
// transaction, and budget repositories to present net worth, monthly
// spending, budget health, and recent transactions.
//
// Business logic (aggregation, formatting) is sourced from the Swift Export
// bridge modules. ViewModels never import KMP types directly — they use
// the bridge's Swift-native protocols.
//
// References: #414, #289

import FinanceShared
import Observation
import os
import SwiftUI

@Observable
final class DashboardViewModel {
    private let accountRepository: AccountRepository
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let aggregator: any SwiftExportAggregatorModule
    private let formatter: any SwiftExportFormatterModule

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DashboardViewModel"
    )

    var accounts: [AccountItem] = []
    var budgets: [BudgetItem] = []
    var recentTransactions: [TransactionItem] = []
    var isLoading = false
    var errorMessage: String?

    /// Active display (home) currency that drives every total and formatted
    /// value on the dashboard. Sourced from ``CurrencyPreferences`` so the
    /// Settings choice actually flows through here (#2203).
    var currencyCode: String = CurrencyPreferences.displayCurrencyCode()

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    /// Net worth computed via the Swift Export aggregator module.
    var netWorth: Int64 { aggregator.netWorth(accounts: accounts) }

    // MARK: - Net Worth Trend (#2116)
    //
    // A minimalist net-worth growth line reconstructed from the current net
    // worth and historical flows, plus a straight-line forward projection at
    // the recent savings pace. All heavy math lives in the pure, unit-tested
    // `NetWorthTrendCalculator`; these are thin, cached-input accessors.

    /// Selected look-back window for the net-worth trend chart.
    var netWorthTrendRange: NetWorthTrendRange = .sixMonths

    /// Months of history shown when the "All" range is selected.
    private static let netWorthAllMonths = 24

    /// Months projected forward past today.
    private static let netWorthProjectionMonths = 12

    /// Reconstructed monthly net-worth history for the selected range.
    var netWorthTrendPoints: [NetWorthTrendPoint] {
        NetWorthTrendCalculator.history(
            currentNetWorthMinorUnits: netWorth,
            transactions: savingsRateTransactions,
            months: netWorthTrendRange.months ?? Self.netWorthAllMonths
        )
    }

    /// Average monthly net savings over the trailing six months, used to set
    /// the projection pace.
    var averageMonthlySavingsMinorUnits: Int64 {
        NetWorthTrendCalculator.averageMonthlySavings(
            transactions: savingsRateTransactions,
            months: 6
        )
    }

    /// Forward net-worth projection continuing from the latest history point.
    var netWorthProjectionPoints: [NetWorthTrendPoint] {
        guard let anchor = netWorthTrendPoints.last else { return [] }
        return NetWorthTrendCalculator.projection(
            from: anchor,
            monthlySavingsMinorUnits: averageMonthlySavingsMinorUnits,
            months: Self.netWorthProjectionMonths
        )
    }

    /// Projected net worth a year out, in minor units.
    var projectedNetWorthMinorUnits: Int64 {
        netWorthProjectionPoints.last?.valueMinorUnits ?? netWorth
    }

    /// Whether there is enough data to show the trend chart.
    var hasNetWorthTrend: Bool { !accounts.isEmpty }

    // MARK: - Cached Aggregations
    //
    // These values are pre-computed when data loads rather than being
    // recalculated as computed properties on every SwiftUI body evaluation.
    // `monthlyIncome` / `monthlyExpenses` iterate the full transaction list,
    // and `savingsRate` / `spendingByCategory` cross the bridge and
    // map the entire list — doing this on every render caused redundant
    // O(n) + bridge-interop work during scrolling and animation frames.

    /// Sum of income transactions in the current dataset.
    private(set) var monthlyIncome: Int64 = 0

    /// Sum of expense transactions in the current dataset (as a positive value).
    private(set) var monthlyExpenses: Int64 = 0

    /// Savings rate for the current month, computed via the Swift Export aggregator.
    /// Returns a percentage (0–100). Available only when monthly transaction data is loaded.
    private(set) var savingsRate: Double = 0

    /// Spending grouped by category for the current month, via Swift Export aggregator.
    private(set) var spendingByCategory: [String: Int64] = [:]

    // MARK: - Savings Rate (#2162)
    //
    // FIRE savers optimise around savings rate, so it is a first-class
    // dashboard metric. These values are computed from `savingsRateTransactions`
    // — a broader, multi-month window — because a month-over-month trend needs
    // more history than the five most-recent transactions shown elsewhere.

    /// Broader transaction window used only for savings-rate math. The recent
    /// transactions list is intentionally capped at five for the activity feed.
    private var savingsRateTransactions: [TransactionItem] = []

    /// Savings rate for the current (possibly partial) month.
    private(set) var currentSavingsRate: SavingsRateResult = .undefined

    /// Savings rate for the previous full month, used for the trend indicator.
    private(set) var previousMonthSavingsRate: SavingsRateResult = .undefined

    /// Income-weighted trailing three-month savings rate for context.
    private(set) var trailingThreeMonthSavingsRate: SavingsRateResult = .undefined

    /// Direction of the savings rate this month versus last month.
    private(set) var savingsRateTrend: SavingsRateTrend = .notEnoughData

    // MARK: - Savings Rate Presentation

    /// Current savings rate as a compact string (e.g. "65%"), or an em dash
    /// when there is no income to compute a rate.
    var savingsRateDisplay: String {
        guard currentSavingsRate.isDefined else { return "—" }
        return String(format: "%.0f%%", currentSavingsRate.percent)
    }

    /// SF Symbol describing the trend direction. Always paired with text so the
    /// indicator never relies on colour alone (accessibility requirement).
    var savingsRateTrendSymbol: String {
        switch savingsRateTrend {
        case .improving: return "arrow.up.right"
        case .declining: return "arrow.down.right"
        case .flat: return "arrow.right"
        case .notEnoughData: return "minus"
        }
    }

    /// Short, localized description of the month-over-month trend.
    var savingsRateTrendText: String {
        switch savingsRateTrend {
        case let .improving(delta):
            return String(localized: "Up \(Self.formatPoints(delta)) pts vs last month")
        case let .declining(delta):
            return String(localized: "Down \(Self.formatPoints(delta)) pts vs last month")
        case .flat:
            return String(localized: "Steady vs last month")
        case .notEnoughData:
            return String(localized: "Not enough history yet")
        }
    }

    /// Combined VoiceOver description of the savings-rate card.
    var savingsRateAccessibilityLabel: String {
        guard currentSavingsRate.isDefined else {
            return String(localized: "Savings rate unavailable. Add income to see your rate.")
        }
        let rate = String(format: "%.0f", currentSavingsRate.percent)
        switch savingsRateTrend {
        case let .improving(delta):
            return String(localized: "Savings rate \(rate) percent, up \(Self.formatPoints(delta)) points versus last month")
        case let .declining(delta):
            return String(localized: "Savings rate \(rate) percent, down \(Self.formatPoints(delta)) points versus last month")
        case .flat:
            return String(localized: "Savings rate \(rate) percent, steady versus last month")
        case .notEnoughData:
            return String(localized: "Savings rate \(rate) percent. Not enough history for a trend yet")
        }
    }

    private static func formatPoints(_ value: Double) -> String {
        String(format: "%.1f", value)
    }

    /// Computes the savings rate over a date range from the broad window.
    private func savingsRateResult(from start: Date, to end: Date) -> SavingsRateResult {
        let income = aggregator.totalIncome(transactions: savingsRateTransactions, from: start, to: end)
        let spending = aggregator.totalSpending(transactions: savingsRateTransactions, from: start, to: end)
        return SavingsRateCalculator.savingsRate(incomeMinorUnits: income, spendingMinorUnits: spending)
    }

    /// Recomputes cached aggregation values from the complete transaction set.
    ///
    /// Called once after data loads instead of on every view body evaluation.
    /// Uses Swift-native Date types — the bridge handles KMP type mapping internally.
    private func recomputeAggregations() {
        let cal = Calendar.current
        let now = Date.now
        let startOfMonth = cal.date(from: cal.dateComponents([.year, .month], from: now)) ?? now
        let endOfMonth = cal.date(byAdding: DateComponents(month: 1, day: -1), to: startOfMonth) ?? now

        monthlyIncome = aggregator.totalIncome(
            transactions: savingsRateTransactions,
            from: startOfMonth,
            to: endOfMonth
        )

        monthlyExpenses = aggregator.totalSpending(
            transactions: savingsRateTransactions,
            from: startOfMonth,
            to: endOfMonth
        )

        savingsRate = aggregator.savingsRate(
            transactions: savingsRateTransactions,
            from: startOfMonth,
            to: endOfMonth
        )

        spendingByCategory = aggregator.spendingByCategory(
            transactions: savingsRateTransactions,
            from: startOfMonth,
            to: endOfMonth
        )

        recomputeSavingsRate(calendar: cal, startOfMonth: startOfMonth, endOfMonth: endOfMonth)
    }

    /// Recomputes the current/previous/trailing savings rates and the trend
    /// indicator from the broad transaction window. Pure aside from the
    /// injected aggregator, so behaviour is deterministic for a fixed dataset.
    private func recomputeSavingsRate(calendar cal: Calendar, startOfMonth: Date, endOfMonth: Date) {
        let startOfPrevMonth = cal.date(byAdding: .month, value: -1, to: startOfMonth) ?? startOfMonth
        let endOfPrevMonth = cal.date(byAdding: DateComponents(day: -1), to: startOfMonth) ?? startOfMonth
        let startOfTwoMonthsAgo = cal.date(byAdding: .month, value: -2, to: startOfMonth) ?? startOfMonth
        let endOfTwoMonthsAgo = cal.date(byAdding: DateComponents(day: -1), to: startOfPrevMonth) ?? startOfPrevMonth

        currentSavingsRate = savingsRateResult(from: startOfMonth, to: endOfMonth)
        previousMonthSavingsRate = savingsRateResult(from: startOfPrevMonth, to: endOfPrevMonth)
        let twoMonthsAgo = savingsRateResult(from: startOfTwoMonthsAgo, to: endOfTwoMonthsAgo)

        trailingThreeMonthSavingsRate = SavingsRateCalculator.trailingAverage(
            of: [currentSavingsRate, previousMonthSavingsRate, twoMonthsAgo]
        )
        savingsRateTrend = SavingsRateCalculator.trend(
            current: currentSavingsRate,
            previous: previousMonthSavingsRate
        )
    }

    /// Formats a monetary amount using the Swift Export formatter module.
    func formatCurrency(_ amountMinorUnits: Int64, showSign: Bool = false) -> String {
        formatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode,
            showSign: showSign
        )
    }

    // MARK: - Multi-currency roll-up disclosure (#2203)

    /// Currency codes present in the loaded transactions that differ from the
    /// active display currency — i.e. amounts that were converted for roll-ups.
    var foreignCurrencyCodes: [String] {
        let display = currencyCode.uppercased()
        let codes = Set(
            recentTransactions.map { $0.currencyCode.uppercased() }
                + savingsRateTransactions.map { $0.currencyCode.uppercased() }
        )
        return codes.subtracting([display]).sorted()
    }

    /// Whether the dashboard is combining spend from more than one currency.
    var hasMultiCurrencySpend: Bool { !foreignCurrencyCodes.isEmpty }

    /// Short disclosure shown near totals when they combine multiple
    /// currencies, so the user understands the home-currency figure is a
    /// converted roll-up rather than a native sum.
    var rollupDisclosure: String? {
        guard hasMultiCurrencySpend else { return nil }
        return String(
            localized: "Totals are rolled up into \(currencyCode) from \(foreignCurrencyCodes.count) other currencies at the latest available rates."
        )
    }

    init(
        accountRepository: AccountRepository,
        transactionRepository: TransactionRepository,
        budgetRepository: BudgetRepository,
        aggregator: any SwiftExportAggregatorModule = SwiftExportBridgeProvider.shared.aggregator,
        formatter: any SwiftExportFormatterModule = SwiftExportBridgeProvider.shared.formatter
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.aggregator = aggregator
        self.formatter = formatter
    }

    func loadDashboard() async {
        isLoading = true
        defer { isLoading = false }

        // Pick up any change to the display-currency preference so totals and
        // formatting always reflect the user's current home-currency choice.
        currencyCode = CurrencyPreferences.displayCurrencyCode()

        do {
            // Instrumented with os_signpost for Instruments profiling (#903)
            (accounts, recentTransactions, budgets, savingsRateTransactions) = try await PerformanceMonitor.shared.measure("Dashboard Load") {
                async let a = self.accountRepository.getAccounts()
                async let t = self.transactionRepository.getRecentTransactions(limit: 5)
                async let b = self.budgetRepository.getBudgets()
                // Broad window powers the savings-rate trend (#2162).
                async let all = self.transactionRepository.getTransactions()
                return try await (a, t, b, all)
            }

            recomputeAggregations()
        } catch {
            errorMessage = String(localized: "Failed to load dashboard. Please try again.")
            Self.logger.error("Dashboard load failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
