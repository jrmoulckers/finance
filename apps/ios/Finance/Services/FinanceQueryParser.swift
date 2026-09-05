// SPDX-License-Identifier: BUSL-1.1

// FinanceQueryParser.swift
// Finance
//
// Deterministic, on-device natural-language parser for finance queries (#2386).
//
// The parser converts a raw question string into a ``FinanceQueryParse`` —
// either an executable ``FinanceQueryPlan``, a ``FinanceQueryClarification``
// request, or `.unrecognized`. It has **no dependency on Speech or App
// Intents**, so it can be exhaustively unit-tested with fixtures and produces
// identical output for identical input (a fixed `referenceDate` is injected for
// reproducible date windows).

import Foundation

/// Interprets natural-language finance questions entirely on-device.
struct FinanceQueryParser: Sendable {

    let vocabulary: FinanceQueryVocabulary
    let calendar: Calendar
    let referenceDate: Date

    /// - Parameters:
    ///   - vocabulary:    Known categories, accounts, and merchants.
    ///   - calendar:      Calendar used to resolve date windows (default: current).
    ///   - referenceDate: "Now" anchor for relative dates. Injected for testing.
    init(
        vocabulary: FinanceQueryVocabulary,
        calendar: Calendar = .current,
        referenceDate: Date = .now
    ) {
        self.vocabulary = vocabulary
        self.calendar = calendar
        self.referenceDate = referenceDate
    }

    // MARK: - Keyword Sets

    private static let spendKeywords = ["spend", "spent", "spending"]
    private static let balanceKeywords = ["balance", "how much do i have", "how much money do i have"]
    private static let ambiguousDatePhrases = ["recently", "lately", "a while ago", "these days"]

    /// Vague category words that map to more than one concrete category.
    private static let categorySynonyms: [String: [String]] = [
        "food": ["Groceries", "Dining Out"],
        "eating": ["Groceries", "Dining Out"],
        "going out": ["Dining Out", "Entertainment"],
        "fun": ["Entertainment", "Dining Out"],
    ]

    // MARK: - Public API

    /// Parses `input` into a deterministic outcome.
    ///
    /// - Parameters:
    ///   - input:           The raw question text.
    ///   - dateOverride:    When set, forces the date window (used after the
    ///                      user resolves an ambiguous date).
    ///   - categoryOverride: When set, forces the category (used after the user
    ///                      resolves an ambiguous category).
    func parse(
        _ input: String,
        dateOverride: FinanceQueryDatePreset? = nil,
        categoryOverride: String? = nil
    ) -> FinanceQueryParse {
        let normalized = input
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()

        guard !normalized.isEmpty else {
            return .unrecognized(rawInput: input)
        }

        // Balance questions take priority and are flagged sensitive.
        if Self.balanceKeywords.contains(where: { normalized.contains($0) }) {
            let account = matchedAccount(in: normalized)
            let plan = FinanceQueryPlan(
                kind: .balance(account: account),
                dateRange: nil,
                rawInput: input
            )
            return .plan(plan)
        }

        // Everything else must be a spend question.
        guard Self.spendKeywords.contains(where: { normalized.contains($0) }) else {
            return .unrecognized(rawInput: input)
        }

        // 1. Resolve the date window (may request clarification).
        let dateRange: FinanceQueryDateRange?
        if let dateOverride {
            dateRange = resolveDateRange(for: dateOverride)
        } else {
            switch resolveDate(in: normalized) {
            case .resolved(let range):
                dateRange = range
            case .ambiguous(let phrase):
                return .clarification(
                    .ambiguousDate(phrase: phrase, options: [.thisWeek, .thisMonth, .thisYear])
                )
            case .none:
                dateRange = nil
            }
        }

        // 2. Resolve the spend dimension (may request clarification).
        let dimension: FinanceQueryDimension
        switch resolveDimension(in: normalized, categoryOverride: categoryOverride) {
        case .resolved(let value):
            dimension = value
        case .ambiguousCategory(let phrase, let options):
            return .clarification(.ambiguousCategory(phrase: phrase, options: options))
        case .none:
            // A bare date-range question ("how much did I spend last month")
            // is valid; otherwise we have nothing to compute.
            if dateRange != nil {
                dimension = .all
            } else {
                return .clarification(.missingSubject)
            }
        }

        let plan = FinanceQueryPlan(
            kind: .spend(dimension),
            dateRange: dateRange,
            rawInput: input
        )
        return .plan(plan)
    }

    // MARK: - Date Resolution

    private enum DateOutcome {
        case resolved(FinanceQueryDateRange)
        case ambiguous(phrase: String)
        case none
    }

    /// Phrases checked in priority order (longest / most specific first).
    private static let datePhrases: [(phrase: String, preset: FinanceQueryDatePreset)] = [
        ("last week", .lastWeek),
        ("this week", .thisWeek),
        ("last month", .lastMonth),
        ("this month", .thisMonth),
        ("last year", .lastYear),
        ("this year", .thisYear),
        ("yesterday", .yesterday),
        ("today", .today),
    ]

    private func resolveDate(in normalized: String) -> DateOutcome {
        for entry in Self.datePhrases where normalized.contains(entry.phrase) {
            if let range = resolveDateRange(for: entry.preset) {
                return .resolved(range)
            }
        }
        if let vague = Self.ambiguousDatePhrases.first(where: { normalized.contains($0) }) {
            return .ambiguous(phrase: vague)
        }
        return .none
    }

    /// Builds a concrete half-open interval for a preset relative to
    /// `referenceDate` using `calendar`.
    func resolveDateRange(for preset: FinanceQueryDatePreset) -> FinanceQueryDateRange? {
        let label = preset.phrase

        func interval(_ component: Calendar.Component, offset: Int) -> FinanceQueryDateRange? {
            guard
                let anchor = calendar.date(byAdding: shiftComponent(component), value: offset, to: referenceDate),
                let dateInterval = calendar.dateInterval(of: component, for: anchor)
            else { return nil }
            return FinanceQueryDateRange(start: dateInterval.start, end: dateInterval.end, label: label)
        }

        switch preset {
        case .today: return interval(.day, offset: 0)
        case .yesterday: return interval(.day, offset: -1)
        case .thisWeek: return interval(.weekOfYear, offset: 0)
        case .lastWeek: return interval(.weekOfYear, offset: -1)
        case .thisMonth: return interval(.month, offset: 0)
        case .lastMonth: return interval(.month, offset: -1)
        case .thisYear: return interval(.year, offset: 0)
        case .lastYear: return interval(.year, offset: -1)
        }
    }

    /// Maps an interval component to the unit used when offsetting the anchor.
    private func shiftComponent(_ component: Calendar.Component) -> Calendar.Component {
        switch component {
        case .weekOfYear: .weekOfYear
        case .month: .month
        case .year: .year
        default: .day
        }
    }

    // MARK: - Dimension Resolution

    private enum DimensionOutcome {
        case resolved(FinanceQueryDimension)
        case ambiguousCategory(phrase: String, options: [String])
        case none
    }

    private func resolveDimension(
        in normalized: String,
        categoryOverride: String?
    ) -> DimensionOutcome {
        if let categoryOverride {
            return .resolved(.category(categoryOverride))
        }

        // 1. Merchant via an explicit "at <merchant>" preposition.
        if let merchant = merchantAfterPreposition(in: normalized) {
            return .resolved(.merchant(merchant))
        }

        // 2. A known account name appearing anywhere.
        if let account = matchedAccount(in: normalized) {
            return .resolved(.account(account))
        }

        // 3. An exact known category name appearing anywhere.
        if let category = matchedCategory(in: normalized) {
            return .resolved(.category(category))
        }

        // 4. A vague category synonym.
        switch synonymCategory(in: normalized) {
        case .resolved(let value):
            return .resolved(value)
        case .ambiguousCategory(let phrase, let options):
            return .ambiguousCategory(phrase: phrase, options: options)
        case .none:
            break
        }

        // 5. A known merchant name appearing anywhere (no preposition).
        if let merchant = matchedMerchant(in: normalized) {
            return .resolved(.merchant(merchant))
        }

        return .none
    }

    // MARK: - Entity Matching Helpers

    private func matchedAccount(in normalized: String) -> String? {
        vocabulary.accounts.first { normalized.contains($0.lowercased()) }
    }

    private func matchedCategory(in normalized: String) -> String? {
        vocabulary.categories.first { normalized.contains($0.lowercased()) }
    }

    private func matchedMerchant(in normalized: String) -> String? {
        vocabulary.merchants.first { normalized.contains($0.lowercased()) }
    }

    private func synonymCategory(in normalized: String) -> DimensionOutcome {
        let known = Set(vocabulary.categories.map { $0.lowercased() })
        for (word, candidates) in Self.categorySynonyms where normalized.contains(word) {
            let present = candidates.filter { known.contains($0.lowercased()) }
            if present.count >= 2 {
                return .ambiguousCategory(phrase: word, options: present)
            } else if let only = present.first {
                return .resolved(.category(only))
            }
        }
        return .none
    }

    /// Extracts and cleans the merchant token following an " at " preposition.
    private func merchantAfterPreposition(in normalized: String) -> String? {
        guard let atRange = normalized.range(of: " at ") else { return nil }
        var candidate = String(normalized[atRange.upperBound...])

        // Trim any trailing date phrase from the candidate.
        for entry in Self.datePhrases where candidate.contains(entry.phrase) {
            if let phraseRange = candidate.range(of: entry.phrase) {
                candidate = String(candidate[..<phraseRange.lowerBound])
            }
        }
        for vague in Self.ambiguousDatePhrases where candidate.contains(vague) {
            if let phraseRange = candidate.range(of: vague) {
                candidate = String(candidate[..<phraseRange.lowerBound])
            }
        }

        candidate = candidate
            .trimmingCharacters(in: CharacterSet(charactersIn: " ?.!,"))
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !candidate.isEmpty else { return nil }

        // Canonicalise to a known merchant when one matches.
        if let known = vocabulary.merchants.first(where: {
            candidate.contains($0.lowercased()) || $0.lowercased().contains(candidate)
        }) {
            return known
        }
        return candidate.capitalizedWords
    }
}

// MARK: - String Capitalisation Helper

extension String {
    /// Capitalises the first letter of each whitespace-separated word.
    var capitalizedWords: String {
        split(separator: " ")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }
}
