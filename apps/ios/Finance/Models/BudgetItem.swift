// SPDX-License-Identifier: BUSL-1.1

// BudgetItem.swift
// Finance
//
// Budget data model used by Dashboard and Budgets screens.
// Extracted to enable repository-based sourcing and KMP integration.

import SwiftUI

// MARK: - Budget Item

/// A single budget category with spending progress.
///
/// Used by both the Budgets screen (full detail) and the Dashboard
/// (summary cards). All monetary values are in minor units (cents).
struct BudgetItem: Identifiable, Sendable {
    let id: String
    let name: String
    let categoryName: String
    let spentMinorUnits: Int64
    let limitMinorUnits: Int64
    let currencyCode: String
    let period: String
    let icon: String

    /// Fraction of budget consumed (0.0–1.0+).
    var progress: Double {
        guard limitMinorUnits > 0 else { return 0 }
        return Double(spentMinorUnits) / Double(limitMinorUnits)
    }

    /// Amount remaining before hitting the limit.
    var remainingMinorUnits: Int64 { limitMinorUnits - spentMinorUnits }

    /// Color indicating budget health: green → orange → red.
    var progressColor: Color {
        if progress >= 1.0 { return .red }
        if progress >= 0.75 { return .orange }
        return .green
    }

    /// Human-readable status text.
    var statusText: String {
        progress >= 1.0 ? String(localized: "Over budget") : String(localized: "On track")
    }
}
