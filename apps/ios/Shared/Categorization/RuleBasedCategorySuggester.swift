// SPDX-License-Identifier: BUSL-1.1

// RuleBasedCategorySuggester.swift
// FinanceShared
//
// Deterministic keyword/rule engine. This is both a standalone suggester and
// the always-available fallback when the Core ML model is missing. It maps
// normalised tokens to one of the app's stable category ids.
//
// The rule table is data, not behaviour: it is exposed for tests and can be
// extended without touching the matching logic.
//
// References: #2382

import Foundation

/// Deterministic keyword-based category suggester.
public struct RuleBasedCategorySuggester: CategorySuggesting {

    /// A single category rule: a target category id and its trigger tokens.
    public struct Rule: Sendable, Equatable {
        public let categoryId: String
        public let keywords: Set<String>

        public init(categoryId: String, keywords: Set<String>) {
            self.categoryId = categoryId
            self.keywords = keywords
        }
    }

    /// Ordered rules. Order is the tie-breaker when two categories match equally.
    public let rules: [Rule]

    /// Creates a suggester with the given rules (defaults to ``standardRules``).
    public init(rules: [Rule] = RuleBasedCategorySuggester.standardRules) {
        self.rules = rules
    }

    public func suggest(
        features: CategorizationFeatures,
        input: CategorizationInput
    ) -> CategorizationSuggestion? {
        let tokenSet = Set(features.tokens)
        guard !tokenSet.isEmpty else { return nil }

        var bestCategory: String?
        var bestMatches = 0

        for rule in rules {
            let matches = rule.keywords.intersection(tokenSet).count
            if matches > bestMatches {
                bestMatches = matches
                bestCategory = rule.categoryId
            }
        }

        guard let category = bestCategory, bestMatches > 0 else { return nil }

        // More matched keywords -> higher confidence, capped to keep the rule
        // engine below a trained-model's ceiling.
        let score = min(0.85, 0.55 + 0.12 * Double(bestMatches - 1) + 0.12)
        return CategorizationSuggestion(categoryId: category, score: score, source: .rules)
    }

    /// The shipped rule table. Tokens are single, already-normalised words to
    /// match ``MerchantTokenizer`` output (e.g. "Whole Foods" -> whole, foods).
    public static let standardRules: [Rule] = [
        Rule(categoryId: "groceries", keywords: [
            "grocery", "groceries", "market", "supermarket", "whole", "foods",
            "trader", "safeway", "kroger", "walmart", "aldi", "costco", "wegmans",
            "publix", "heb",
        ]),
        Rule(categoryId: "food", keywords: [
            "restaurant", "cafe", "coffee", "starbucks", "mcdonald", "mcdonalds",
            "chipotle", "pizza", "grill", "diner", "bakery", "doordash", "ubereats",
            "grubhub", "kitchen", "bistro", "taco", "burger", "deli", "sushi",
        ]),
        Rule(categoryId: "transport", keywords: [
            "gas", "fuel", "shell", "chevron", "exxon", "bp", "uber", "lyft",
            "transit", "parking", "metro", "toll", "taxi", "amtrak", "airline",
        ]),
        Rule(categoryId: "shopping", keywords: [
            "amazon", "target", "best", "buy", "mall", "nike", "apparel",
            "clothing", "ikea", "etsy", "macys", "nordstrom",
        ]),
        Rule(categoryId: "health", keywords: [
            "pharmacy", "cvs", "walgreens", "medical", "doctor", "clinic",
            "dental", "gym", "fitness", "health", "hospital", "optometry",
        ]),
        Rule(categoryId: "entertainment", keywords: [
            "netflix", "spotify", "hulu", "cinema", "movie", "theater", "theatre",
            "steam", "playstation", "xbox", "disney", "concert", "twitch",
        ]),
        Rule(categoryId: "bills", keywords: [
            "electric", "electricity", "water", "internet", "comcast", "verizon",
            "insurance", "rent", "mortgage", "utility", "utilities", "cable",
            "wireless", "phone",
        ]),
    ]
}
