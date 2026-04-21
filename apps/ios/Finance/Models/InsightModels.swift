// SPDX-License-Identifier: BUSL-1.1

// InsightModels.swift
// Finance
//
// Data models for the Financial Insights feature — spending analysis,
// trend identification, and actionable recommendations.
//
// References: #241

import SwiftUI

// MARK: - Insight Type

/// Classification of financial insights.
enum InsightType: String, CaseIterable, Sendable {
    case spendingTrend
    case savingsOpportunity
    case budgetPerformance
    case incomeAnalysis
    case categorySpike
    case monthOverMonth

    var displayName: String {
        switch self {
        case .spendingTrend: String(localized: "Spending Trend")
        case .savingsOpportunity: String(localized: "Savings Opportunity")
        case .budgetPerformance: String(localized: "Budget Performance")
        case .incomeAnalysis: String(localized: "Income Analysis")
        case .categorySpike: String(localized: "Category Spike")
        case .monthOverMonth: String(localized: "Month-over-Month")
        }
    }

    var systemImage: String {
        switch self {
        case .spendingTrend: "chart.line.downtrend.xyaxis"
        case .savingsOpportunity: "leaf.arrow.circlepath"
        case .budgetPerformance: "gauge.with.dots.needle.67percent"
        case .incomeAnalysis: "arrow.down.left.circle"
        case .categorySpike: "exclamationmark.arrow.triangle.2.circlepath"
        case .monthOverMonth: "calendar.badge.clock"
        }
    }

    var color: Color {
        switch self {
        case .spendingTrend: FinanceColors.statusWarning
        case .savingsOpportunity: FinanceColors.statusPositive
        case .budgetPerformance: FinanceColors.interactive
        case .incomeAnalysis: FinanceColors.amountPositive
        case .categorySpike: FinanceColors.statusNegative
        case .monthOverMonth: Color(hex: "#805AD5") ?? .purple
        }
    }
}

// MARK: - Insight Severity

/// How urgent or important an insight is.
enum InsightSeverity: String, CaseIterable, Sendable {
    case info
    case suggestion
    case warning
    case critical

    var displayName: String {
        switch self {
        case .info: String(localized: "Info")
        case .suggestion: String(localized: "Suggestion")
        case .warning: String(localized: "Warning")
        case .critical: String(localized: "Critical")
        }
    }
}

// MARK: - Financial Insight

/// A single actionable financial insight.
struct FinancialInsight: Identifiable, Sendable {
    let id: String
    let type: InsightType
    let severity: InsightSeverity
    let title: String
    let description: String
    let detail: String?
    let amountMinorUnits: Int64?
    let percentChange: Double?
    let relatedCategory: String?
    let generatedAt: Date

    init(
        id: String = UUID().uuidString,
        type: InsightType,
        severity: InsightSeverity,
        title: String,
        description: String,
        detail: String? = nil,
        amountMinorUnits: Int64? = nil,
        percentChange: Double? = nil,
        relatedCategory: String? = nil,
        generatedAt: Date = Date()
    ) {
        self.id = id
        self.type = type
        self.severity = severity
        self.title = title
        self.description = description
        self.detail = detail
        self.amountMinorUnits = amountMinorUnits
        self.percentChange = percentChange
        self.relatedCategory = relatedCategory
        self.generatedAt = generatedAt
    }
}

// MARK: - Spending Breakdown

/// Spending aggregated by category for a given period.
struct SpendingBreakdown: Identifiable, Sendable {
    let id = UUID()
    let categoryName: String
    let categoryIcon: String
    let amountMinorUnits: Int64
    let percentOfTotal: Double
    let color: Color
}

// MARK: - Insights Summary

/// Aggregate result from the insights engine.
struct InsightsSummary: Sendable {
    let totalSpendingMinorUnits: Int64
    let totalIncomeMinorUnits: Int64
    let netCashFlowMinorUnits: Int64
    let savingsRatePercent: Double
    let spendingBreakdown: [SpendingBreakdown]
    let insights: [FinancialInsight]
    let monthlySpendingTrend: [MonthlyAmount]
    let currencyCode: String
}
