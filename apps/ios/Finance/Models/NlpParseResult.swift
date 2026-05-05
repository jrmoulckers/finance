// SPDX-License-Identifier: BUSL-1.1

// NlpParseResult.swift
// Finance
//
// Data models for natural language transaction parsing results.
// Mirrors the KMP NaturalLanguageParser output types, adapted for
// Swift-native consumption with per-field confidence tracking.

import Foundation

// MARK: - Parse Confidence

/// Overall confidence level for a parsed NLP transaction.
///
/// Maps to KMP `ParseConfidence` enum values.
enum NlpConfidence: String, Sendable, CaseIterable {
    case high, medium, low, veryLow

    /// Human-readable display name.
    var displayName: String {
        switch self {
        case .high: String(localized: "High confidence")
        case .medium: String(localized: "Medium confidence")
        case .low: String(localized: "Low confidence")
        case .veryLow: String(localized: "Low confidence")
        }
    }

    /// Numeric score for progress display (0.0–1.0).
    var score: Double {
        switch self {
        case .high: 0.95
        case .medium: 0.7
        case .low: 0.4
        case .veryLow: 0.15
        }
    }

    /// SF Symbol name for the confidence level.
    var systemImage: String {
        switch self {
        case .high: "checkmark.seal.fill"
        case .medium: "checkmark.seal"
        case .low: "exclamationmark.triangle"
        case .veryLow: "exclamationmark.triangle.fill"
        }
    }
}

// MARK: - Parsed Field

/// A single parsed field with its value, display label, and editability.
struct NlpParsedField: Identifiable, Sendable {
    let id: FieldType
    let value: String
    let isUncertain: Bool

    /// The kind of parsed field.
    enum FieldType: String, Sendable {
        case amount, payee, category, date, type

        var displayLabel: String {
            switch self {
            case .amount: String(localized: "Amount")
            case .payee: String(localized: "Payee")
            case .category: String(localized: "Category")
            case .date: String(localized: "Date")
            case .type: String(localized: "Type")
            }
        }

        var systemImage: String {
            switch self {
            case .amount: "dollarsign.circle"
            case .payee: "person"
            case .category: "tag"
            case .date: "calendar"
            case .type: "arrow.left.arrow.right"
            }
        }
    }
}

// MARK: - NLP Parse Result

/// Complete result of parsing a natural language transaction input.
struct NlpParseResult: Sendable {
    let amount: String?
    let amountMinorUnits: Int64?
    let payee: String?
    let category: String?
    let date: Date?
    let transactionType: TransactionTypeUI
    let confidence: NlpConfidence
    let rawInput: String

    /// All successfully parsed fields for display in the inline preview.
    var parsedFields: [NlpParsedField] {
        var fields: [NlpParsedField] = []

        if let amount {
            fields.append(NlpParsedField(
                id: .amount,
                value: amount,
                isUncertain: false
            ))
        }
        if let payee {
            fields.append(NlpParsedField(
                id: .payee,
                value: payee,
                isUncertain: confidence == .low || confidence == .veryLow
            ))
        }
        if let category {
            fields.append(NlpParsedField(
                id: .category,
                value: category,
                isUncertain: confidence == .veryLow
            ))
        }
        if let date {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
            fields.append(NlpParsedField(
                id: .date,
                value: formatter.string(from: date),
                isUncertain: false
            ))
        }

        fields.append(NlpParsedField(
            id: .type,
            value: transactionType.displayName,
            isUncertain: false
        ))

        return fields
    }

    /// Whether the result has enough data for a valid transaction.
    var isValid: Bool {
        amountMinorUnits != nil && (amountMinorUnits ?? 0) > 0
    }
}

// MARK: - Recent NLP Entry

/// A previously used NLP input string for quick re-entry.
struct RecentNlpEntry: Identifiable, Sendable, Codable {
    let id: String
    let text: String
    let timestamp: Date

    init(text: String) {
        self.id = UUID().uuidString
        self.text = text
        self.timestamp = Date()
    }
}
