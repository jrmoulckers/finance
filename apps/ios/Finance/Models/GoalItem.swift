// SPDX-License-Identifier: BUSL-1.1

// GoalItem.swift
// Finance
//
// Goal data model used by the Goals screen.
// Extracted to enable repository-based sourcing and KMP integration.

import SwiftUI

// MARK: - Goal Status

/// Visual status of a financial goal.
enum GoalStatusUI: String, CaseIterable, Hashable, Sendable {
    case active, paused, completed, cancelled

    var displayName: String {
        switch self {
        case .active: String(localized: "Active")
        case .paused: String(localized: "Paused")
        case .completed: String(localized: "Completed")
        case .cancelled: String(localized: "Cancelled")
        }
    }

    var color: Color {
        switch self {
        case .active: .blue
        case .paused: .orange
        case .completed: .green
        case .cancelled: .gray
        }
    }

    var systemImage: String {
        switch self {
        case .active: "flame"
        case .paused: "pause.circle"
        case .completed: "checkmark.circle.fill"
        case .cancelled: "xmark.circle"
        }
    }
}

// MARK: - Goal Item

/// A single financial goal with progress tracking.
struct GoalItem: Identifiable, Sendable {
    let id: String
    let name: String
    let currentMinorUnits: Int64
    let targetMinorUnits: Int64
    let currencyCode: String
    let targetDate: Date?
    let notes: String
    let status: GoalStatusUI
    let icon: String
    let color: Color

    /// Fraction of goal achieved (0.0–1.0+).
    var progress: Double {
        guard targetMinorUnits > 0 else { return 0 }
        return Double(currentMinorUnits) / Double(targetMinorUnits)
    }

    /// Whether the saved amount meets or exceeds the target.
    var isComplete: Bool { currentMinorUnits >= targetMinorUnits }

    /// Amount still needed to reach the target.
    var remainingMinorUnits: Int64 { max(0, targetMinorUnits - currentMinorUnits) }

    init(
        id: String,
        name: String,
        currentMinorUnits: Int64,
        targetMinorUnits: Int64,
        currencyCode: String,
        targetDate: Date?,
        notes: String = "",
        status: GoalStatusUI,
        icon: String,
        color: Color
    ) {
        self.id = id
        self.name = name
        self.currentMinorUnits = currentMinorUnits
        self.targetMinorUnits = targetMinorUnits
        self.currencyCode = currencyCode
        self.targetDate = targetDate
        self.notes = notes
        self.status = status
        self.icon = icon
        self.color = color
    }
}
