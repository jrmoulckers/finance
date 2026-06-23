// SPDX-License-Identifier: BUSL-1.1

// CategorizationModels.swift
// FinanceShared
//
// Value types for on-device transaction categorization. These types are
// deliberately content-light at the boundary: nothing here is ever logged or
// emitted to telemetry. They describe the *inputs* to the categorizer, the
// deterministic *features* derived from those inputs, and the *suggestion*
// returned to the review surface.
//
// All processing that consumes these types runs entirely on-device. Merchant
// names, memos, and amounts never leave the device.
//
// References: #2382

import Foundation

// MARK: - Categorization Input

/// The raw, on-device signal used to suggest a category for a transaction.
///
/// Construct one of these from an imported or manually-entered transaction.
/// The categorizer derives deterministic ``CategorizationFeatures`` from it and
/// never persists or transmits the raw merchant/memo/amount content.
public struct CategorizationInput: Sendable, Equatable {
    /// Merchant or payee text (e.g. "Whole Foods Market #123").
    public let merchant: String
    /// Free-form memo or note attached to the transaction.
    public let memo: String
    /// Signed amount in minor units (cents). Sign is normalised away in features.
    public let amountMinorUnits: Int64
    /// ISO currency code (e.g. "USD").
    public let currencyCode: String
    /// Transaction date used for day-of-week / time features.
    public let date: Date
    /// Optional originating account identifier (opaque, never logged).
    public let accountId: String?

    public init(
        merchant: String,
        memo: String = "",
        amountMinorUnits: Int64,
        currencyCode: String = "USD",
        date: Date = Date(),
        accountId: String? = nil
    ) {
        self.merchant = merchant
        self.memo = memo
        self.amountMinorUnits = amountMinorUnits
        self.currencyCode = currencyCode
        self.date = date
        self.accountId = accountId
    }
}

// MARK: - Categorization Features

/// Deterministic, privacy-reduced features derived from a ``CategorizationInput``.
///
/// Text is reduced to normalised tokens; the amount is reduced to a coarse
/// magnitude bucket; the date is reduced to day-of-week / hour. The original
/// content cannot be reconstructed from these features.
public struct CategorizationFeatures: Sendable, Equatable {
    /// Normalised, de-duplicated tokens from merchant + memo.
    public let tokens: [String]
    /// Stable key for personalization lookups (order-independent token digest).
    public let signature: String
    /// Absolute amount in minor units (sign removed).
    public let absoluteAmountMinorUnits: Int64
    /// Coarse magnitude bucket (0 = smallest, 7 = largest). See feature extractor.
    public let amountMagnitudeBucket: Int
    /// Day of week, 1 (Sunday) ... 7 (Saturday).
    public let dayOfWeek: Int
    /// Hour of day, 0 ... 23.
    public let hour: Int
    /// Whether the transaction falls on a weekend.
    public let isWeekend: Bool

    public init(
        tokens: [String],
        signature: String,
        absoluteAmountMinorUnits: Int64,
        amountMagnitudeBucket: Int,
        dayOfWeek: Int,
        hour: Int,
        isWeekend: Bool
    ) {
        self.tokens = tokens
        self.signature = signature
        self.absoluteAmountMinorUnits = absoluteAmountMinorUnits
        self.amountMagnitudeBucket = amountMagnitudeBucket
        self.dayOfWeek = dayOfWeek
        self.hour = hour
        self.isWeekend = isWeekend
    }
}

// MARK: - Suggestion Source

/// Where a suggestion came from, in priority order.
///
/// Recorded in aggregate telemetry to monitor feature health. It carries no
/// transaction content.
public enum CategorizationSource: String, Sendable, Codable, CaseIterable {
    /// A user correction previously learned on-device for this signature.
    case personalization
    /// The on-device Core ML classifier.
    case coreML
    /// The deterministic rule/keyword engine.
    case rules
    /// No signal — the safe default category.
    case fallback
}

// MARK: - Confidence Band

/// Coarse confidence band for display and telemetry.
public enum CategorizationConfidenceBand: String, Sendable, Codable, CaseIterable {
    case high
    case medium
    case low
    case none

    /// Maps a 0.0–1.0 score to a band.
    public init(score: Double) {
        switch score {
        case 0.8...:
            self = .high
        case 0.5..<0.8:
            self = .medium
        case 0.2..<0.5:
            self = .low
        default:
            self = .none
        }
    }
}

// MARK: - Suggestion

/// A suggested category with a confidence score and provenance.
public struct CategorizationSuggestion: Sendable, Equatable {
    /// Identifier of the suggested category (matches the app's category ids).
    public let categoryId: String
    /// Confidence score in the closed range 0.0 ... 1.0.
    public let score: Double
    /// Where this suggestion originated.
    public let source: CategorizationSource

    public init(categoryId: String, score: Double, source: CategorizationSource) {
        self.categoryId = categoryId
        self.score = max(0.0, min(1.0, score))
        self.source = source
    }

    /// Coarse confidence band derived from ``score``.
    public var band: CategorizationConfidenceBand {
        CategorizationConfidenceBand(score: score)
    }

    /// Whether this is the no-signal fallback suggestion.
    public var isFallback: Bool {
        source == .fallback
    }
}

// MARK: - Category Suggesting

/// Contract for any component that can suggest a category from features.
///
/// Both the rule engine and the Core ML adapter conform to this so the
/// orchestrating ``TransactionCategorizer`` can treat them uniformly.
public protocol CategorySuggesting: Sendable {
    /// Returns a suggestion, or `nil` when this suggester has no opinion.
    func suggest(
        features: CategorizationFeatures,
        input: CategorizationInput
    ) -> CategorizationSuggestion?
}
