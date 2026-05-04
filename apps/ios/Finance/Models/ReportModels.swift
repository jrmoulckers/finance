// SPDX-License-Identifier: BUSL-1.1

// ReportModels.swift
// Finance
//
// Data models for the custom report builder. Maps KMP shared analytics types
// (ReportGenerator, MonthlyComparison, NetWorthSnapshot, SpendingInsight)
// to Swift-native structs for SwiftUI consumption.
//
// References: #1111

import SwiftUI

// MARK: - Report Type

/// Available report types the user can generate.
enum ReportType: String, CaseIterable, Hashable, Sendable {
    case spendingByCategory
    case incomeVsExpense
    case netWorth
    case categoryTrends

    var displayName: String {
        switch self {
        case .spendingByCategory: String(localized: "Spending by Category")
        case .incomeVsExpense: String(localized: "Income vs. Expense")
        case .netWorth: String(localized: "Net Worth")
        case .categoryTrends: String(localized: "Category Trends")
        }
    }

    var systemImage: String {
        switch self {
        case .spendingByCategory: "chart.pie"
        case .incomeVsExpense: "chart.bar"
        case .netWorth: "chart.line.uptrend.xyaxis"
        case .categoryTrends: "chart.xyaxis.line"
        }
    }

    var description: String {
        switch self {
        case .spendingByCategory:
            String(localized: "See where your money goes across all categories.")
        case .incomeVsExpense:
            String(localized: "Compare your income and expenses month by month.")
        case .netWorth:
            String(localized: "Track how your net worth changes over time.")
        case .categoryTrends:
            String(localized: "Analyze spending trends for specific categories.")
        }
    }
}

// MARK: - Report Date Range

/// Predefined date ranges for report generation.
enum ReportDateRange: String, CaseIterable, Hashable, Sendable {
    case oneMonth
    case threeMonths
    case sixMonths
    case oneYear

    var displayName: String {
        switch self {
        case .oneMonth: String(localized: "1 Month")
        case .threeMonths: String(localized: "3 Months")
        case .sixMonths: String(localized: "6 Months")
        case .oneYear: String(localized: "1 Year")
        }
    }

    var monthCount: Int {
        switch self {
        case .oneMonth: 1
        case .threeMonths: 3
        case .sixMonths: 6
        case .oneYear: 12
        }
    }
}

// MARK: - Report Configuration

/// User-configured parameters for generating a report.
struct ReportConfiguration: Sendable {
    let reportType: ReportType
    let dateRange: ReportDateRange
    let selectedAccounts: Set<String>
    let selectedCategories: Set<String>
}

// MARK: - Report Result

/// The generated report data ready for chart and table rendering.
struct ReportResult: Sendable {
    let configuration: ReportConfiguration
    let generatedAt: Date

    /// Spending by category entries.
    var categorySpending: [ReportCategoryEntry] = []

    /// Monthly income vs expense comparison.
    var monthlyComparisons: [ReportMonthlyEntry] = []

    /// Net worth snapshots over time.
    var netWorthSnapshots: [ReportNetWorthEntry] = []

    /// Whether the report has any data.
    var isEmpty: Bool {
        categorySpending.isEmpty && monthlyComparisons.isEmpty && netWorthSnapshots.isEmpty
    }
}

// MARK: - Report Data Entries

/// A single category's spending for a report.
struct ReportCategoryEntry: Identifiable, Sendable {
    let id = UUID()
    let categoryName: String
    let amountMinorUnits: Int64
    let percentage: Double
    let colorIndex: Int
}

/// A single month's income vs expense for a report.
struct ReportMonthlyEntry: Identifiable, Sendable {
    let id = UUID()
    let monthLabel: String
    let incomeMinorUnits: Int64
    let expenseMinorUnits: Int64
    let netMinorUnits: Int64
}

/// A single net worth snapshot for a report.
struct ReportNetWorthEntry: Identifiable, Sendable {
    let id = UUID()
    let date: Date
    let assetsMinorUnits: Int64
    let liabilitiesMinorUnits: Int64
    let netWorthMinorUnits: Int64
}
