// SPDX-License-Identifier: BUSL-1.1

// FinanceQuery.swift
// Finance
//
// Data models for on-device natural-language finance queries (#2386).
//
// A spoken or typed question like *"how much did I spend on groceries this
// week"* is interpreted entirely on-device into a deterministic
// ``FinanceQueryPlan``. The plan is then executed by ``FinanceQueryPlanner``
// over the local finance store to produce a ``FinanceQueryResult`` with both
// typed and spoken variants.
//
// These types are intentionally free of any Speech / App Intents dependency so
// the parser and planner remain fully unit-testable without speech hardware.

import Foundation

// MARK: - Date Preset

/// A bounded, well-known calendar window the parser can resolve a date phrase
/// to (e.g. *"this week"*, *"last month"*).
enum FinanceQueryDatePreset: String, Sendable, CaseIterable, Equatable {
    case today
    case yesterday
    case thisWeek
    case lastWeek
    case thisMonth
    case lastMonth
    case thisYear
    case lastYear

    /// Lower-cased phrase used inside a spoken/typed summary (e.g. "this week").
    var phrase: String {
        switch self {
        case .today: String(localized: "today")
        case .yesterday: String(localized: "yesterday")
        case .thisWeek: String(localized: "this week")
        case .lastWeek: String(localized: "last week")
        case .thisMonth: String(localized: "this month")
        case .lastMonth: String(localized: "last month")
        case .thisYear: String(localized: "this year")
        case .lastYear: String(localized: "last year")
        }
    }

    /// Capitalised label for clarification chips.
    var displayName: String {
        switch self {
        case .today: String(localized: "Today")
        case .yesterday: String(localized: "Yesterday")
        case .thisWeek: String(localized: "This Week")
        case .lastWeek: String(localized: "Last Week")
        case .thisMonth: String(localized: "This Month")
        case .lastMonth: String(localized: "Last Month")
        case .thisYear: String(localized: "This Year")
        case .lastYear: String(localized: "Last Year")
        }
    }
}

// MARK: - Date Range

/// A concrete half-open date interval (`start ..< end`) resolved from a phrase.
struct FinanceQueryDateRange: Sendable, Equatable {
    let start: Date
    let end: Date
    let label: String

    /// Returns `true` when `date` falls within the half-open interval.
    func contains(_ date: Date) -> Bool {
        date >= start && date < end
    }
}

// MARK: - Query Dimension

/// The subject a spend query is grouped by.
enum FinanceQueryDimension: Sendable, Equatable {
    /// Spend within a resolved category (e.g. "Groceries").
    case category(String)
    /// Spend at a resolved merchant / payee (e.g. "Netflix").
    case merchant(String)
    /// Spend on a resolved account (e.g. "Travel Card").
    case account(String)
    /// Total spend across everything, constrained only by the date range.
    case all
}

// MARK: - Query Kind

/// The high-level question being asked.
enum FinanceQueryKind: Sendable, Equatable {
    /// A spend question grouped by ``FinanceQueryDimension``.
    case spend(FinanceQueryDimension)
    /// A balance question. Treated as **sensitive**: the result must not be
    /// spoken aloud without explicit user confirmation.
    case balance(account: String?)
}

// MARK: - Query Plan

/// A fully-resolved, deterministic plan ready for execution by the planner.
struct FinanceQueryPlan: Sendable, Equatable {
    let kind: FinanceQueryKind
    let dateRange: FinanceQueryDateRange?
    let rawInput: String

    /// Sensitive plans (balances) require explicit confirmation before their
    /// result is spoken aloud, per privacy requirements.
    var isSensitive: Bool {
        if case .balance = kind { return true }
        return false
    }
}

// MARK: - Clarification

/// A request for more information when the parser cannot deterministically
/// resolve part of the query.
enum FinanceQueryClarification: Sendable, Equatable {
    /// A vague date phrase (e.g. "recently") that maps to multiple windows.
    case ambiguousDate(phrase: String, options: [FinanceQueryDatePreset])
    /// A vague category word (e.g. "food") that maps to multiple categories.
    case ambiguousCategory(phrase: String, options: [String])
    /// A spend question with no recognisable subject and no date window.
    case missingSubject
}

// MARK: - Parse Outcome

/// The result of interpreting a raw natural-language string.
enum FinanceQueryParse: Sendable, Equatable {
    /// A deterministic, executable plan.
    case plan(FinanceQueryPlan)
    /// The query is understood but needs user disambiguation.
    case clarification(FinanceQueryClarification)
    /// The query is not a supported finance question.
    case unrecognized(rawInput: String)
}

// MARK: - Query Result

/// The executed answer to a query, grounded in local finance data.
///
/// Provides both a concise ``typedSummary`` (shown on screen / returned typed)
/// and a fuller ``spokenSummary`` (used for VoiceOver and speech synthesis).
struct FinanceQueryResult: Sendable, Equatable {
    let plan: FinanceQueryPlan
    let amountMinorUnits: Int64
    let currencyCode: String
    let matchCount: Int
    let typedSummary: String
    let spokenSummary: String

    /// `true` when the spoken variant must be gated behind explicit user
    /// confirmation (sensitive balances).
    var requiresSpokenConfirmation: Bool { plan.isSensitive }
}

// MARK: - Vocabulary

/// The on-device vocabulary the parser resolves entities against.
///
/// Supplying the known categories, accounts, and merchants keeps
/// interpretation deterministic and fully testable.
struct FinanceQueryVocabulary: Sendable, Equatable {
    let categories: [String]
    let accounts: [String]
    let merchants: [String]

    init(categories: [String] = [], accounts: [String] = [], merchants: [String] = []) {
        self.categories = categories
        self.accounts = accounts
        self.merchants = merchants
    }
}
