// SPDX-License-Identifier: BUSL-1.1

// FinancialTip.swift
// Finance
//
// Model for contextual financial tips displayed throughout the app.
// Tips are context-aware — they adapt to the user's current view,
// spending patterns, budget status, and goal progress.
//
// References: #320

import SwiftUI

// MARK: - Tip Context

/// The screen or user action that triggers a contextual tip.
enum TipContext: String, CaseIterable, Sendable {
    case dashboard
    case transactions
    case budgets
    case goals
    case accounts
    case overspending
    case savingsGoalProgress
    case newUser

    var displayName: String {
        switch self {
        case .dashboard: String(localized: "Dashboard")
        case .transactions: String(localized: "Transactions")
        case .budgets: String(localized: "Budgets")
        case .goals: String(localized: "Goals")
        case .accounts: String(localized: "Accounts")
        case .overspending: String(localized: "Overspending Alert")
        case .savingsGoalProgress: String(localized: "Savings Progress")
        case .newUser: String(localized: "Getting Started")
        }
    }
}

// MARK: - Tip Category

/// Broad classification of financial advice.
enum TipCategory: String, CaseIterable, Sendable {
    case saving
    case budgeting
    case spending
    case investing
    case general

    var displayName: String {
        switch self {
        case .saving: String(localized: "Saving")
        case .budgeting: String(localized: "Budgeting")
        case .spending: String(localized: "Spending")
        case .investing: String(localized: "Investing")
        case .general: String(localized: "General")
        }
    }

    var systemImage: String {
        switch self {
        case .saving: "leaf"
        case .budgeting: "chart.pie"
        case .spending: "creditcard"
        case .investing: "chart.line.uptrend.xyaxis"
        case .general: "lightbulb"
        }
    }

    var color: Color {
        switch self {
        case .saving: FinanceColors.statusPositive
        case .budgeting: FinanceColors.interactive
        case .spending: FinanceColors.statusWarning
        case .investing: Color(hex: "#805AD5") ?? .purple
        case .general: FinanceColors.statusInfo
        }
    }
}

// MARK: - Financial Tip

/// A single contextual financial tip.
///
/// Tips are matched to contexts via ``applicableContexts`` and can be
/// conditionally displayed based on the user's financial state (e.g.,
/// only show budget tips when a budget exists).
struct FinancialTip: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let body: String
    let category: TipCategory
    let applicableContexts: Set<TipContext>
    let systemImage: String
    let actionLabel: String?
    let priority: Int

    /// Whether this tip has been dismissed by the user.
    /// Managed externally by ``FinancialTipService``.
    var isDismissed: Bool = false

    init(
        id: String,
        title: String,
        body: String,
        category: TipCategory,
        applicableContexts: Set<TipContext>,
        systemImage: String? = nil,
        actionLabel: String? = nil,
        priority: Int = 0
    ) {
        self.id = id
        self.title = title
        self.body = body
        self.category = category
        self.applicableContexts = applicableContexts
        self.systemImage = systemImage ?? category.systemImage
        self.actionLabel = actionLabel
        self.priority = priority
    }

    // Hashable — identity is the tip ID.
    static func == (lhs: FinancialTip, rhs: FinancialTip) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}
