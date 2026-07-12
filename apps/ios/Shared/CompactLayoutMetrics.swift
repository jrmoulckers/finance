// SPDX-License-Identifier: BUSL-1.1
// CompactLayoutMetrics.swift - FinanceShared - Refs #2190
//
// Pure, dependency-free layout decisions for compact-width devices (iPhone SE)
// and large Dynamic Type. Kept free of SwiftUI so the column/stacking logic can
// be unit-tested in isolation; the view layer maps `SizeClassInput` from the
// SwiftUI environment and applies the result.
//
// The goal: keep the "one screen at a glance" feeling even on a small phone and
// at accessibility text sizes — never a hard-coded 3-up row that crushes labels.

import Foundation

/// Environment inputs the layout metrics react to, decoupled from SwiftUI.
public struct SizeClassInput: Sendable, Hashable {
    /// `true` when the horizontal size class is compact (portrait iPhone).
    public let isCompactWidth: Bool
    /// `true` when Dynamic Type is at an accessibility size (xxxL and above).
    public let isAccessibilityTextSize: Bool

    public init(isCompactWidth: Bool, isAccessibilityTextSize: Bool) {
        self.isCompactWidth = isCompactWidth
        self.isAccessibilityTextSize = isAccessibilityTextSize
    }
}

/// Pure layout heuristics for adaptive summary/quick-access rows.
public enum CompactLayoutMetrics {

    /// Columns for a 3-metric summary row (Income / Expenses / Net).
    ///
    /// - Accessibility text size → 1 column (fully stacked, always readable).
    /// - Compact width → 1 column so three currency values never crowd.
    /// - Otherwise → 3 columns (the roomy default).
    public static func summaryColumns(for input: SizeClassInput) -> Int {
        if input.isAccessibilityTextSize { return 1 }
        if input.isCompactWidth { return 1 }
        return 3
    }

    /// Columns for the quick-access / more grid.
    ///
    /// - Accessibility text size → 1 column.
    /// - Compact width → 2 columns (still glanceable, tap targets stay large).
    /// - Otherwise → 3 columns.
    public static func quickAccessColumns(for input: SizeClassInput) -> Int {
        if input.isAccessibilityTextSize { return 1 }
        if input.isCompactWidth { return 2 }
        return 3
    }

    /// Columns for the bills summary row (Due / Monthly / Count).
    public static func billsSummaryColumns(for input: SizeClassInput) -> Int {
        summaryColumns(for: input)
    }

    /// Whether the multi-step transaction stepper should use shortened labels
    /// (e.g. show only the current step's title) to avoid crowding.
    public static func stepperUsesShortLabels(for input: SizeClassInput) -> Bool {
        input.isCompactWidth || input.isAccessibilityTextSize
    }
}
