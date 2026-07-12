// SPDX-License-Identifier: BUSL-1.1

// WalletCaptureModels.swift
// Finance
//
// Models for Wallet-aware transaction capture (#2171). Apple Pay-heavy users
// expect tapped purchases to flow in with minimal typing rather than full
// manual re-entry. Because Apple does not expose Wallet/Apple Pay transaction
// history to third-party apps via a public API, this feature models an
// "import recent card activity" review inbox: candidates are surfaced with
// merchant recognition, a confidence state, and duplicate detection, and the
// user confirms with one tap. See the entitlement note in the PR under
// "Needs Human Action".

import SwiftUI

/// How confident we are in a recognized candidate's merchant/category.
enum CaptureConfidence: String, Sendable, Equatable, CaseIterable {
    case high
    case medium
    case low

    var displayName: String {
        switch self {
        case .high: String(localized: "High confidence")
        case .medium: String(localized: "Needs a look")
        case .low: String(localized: "Low confidence")
        }
    }

    var systemImage: String {
        switch self {
        case .high: "checkmark.seal.fill"
        case .medium: "questionmark.circle"
        case .low: "exclamationmark.circle"
        }
    }

    var tint: Color {
        switch self {
        case .high: .green
        case .medium: .blue
        case .low: .orange
        }
    }
}

/// A single piece of recent card activity proposed for import.
struct WalletTransactionCandidate: Identifiable, Sendable, Equatable {
    let id: String

    /// The raw descriptor as it would appear on a card statement,
    /// e.g. "TST* THE COFFEE CLUB 4471".
    let rawDescriptor: String

    /// Cleaned, human-friendly merchant name, e.g. "The Coffee Club".
    let merchant: String

    /// Purchase magnitude in minor units (always positive; sign applied on import).
    let amountMinorUnits: Int64

    let currencyCode: String
    let date: Date

    /// Last four of the card/device account number, when available.
    let cardLast4: String?

    /// Suggested category name from merchant recognition, if any.
    let suggestedCategory: String?

    /// Confidence in the recognition result.
    let confidence: CaptureConfidence

    /// Id of an existing transaction this candidate likely duplicates, if any.
    var duplicateOfId: String?

    /// Whether this candidate looks like a duplicate of an existing entry.
    var isLikelyDuplicate: Bool { duplicateOfId != nil }
}
