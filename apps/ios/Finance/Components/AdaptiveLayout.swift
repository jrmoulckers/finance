// SPDX-License-Identifier: BUSL-1.1

// AdaptiveLayout.swift
// Finance
//
// Bridges the SwiftUI environment (horizontal size class + Dynamic Type) to the
// pure `SizeClassInput` used by `CompactLayoutMetrics`, so compact-width devices
// (iPhone SE) and accessibility text sizes get readable, non-crowded layouts.
//
// References: #2190

import FinanceShared
import SwiftUI

extension SizeClassInput {
    /// Maps the current SwiftUI environment into the pure layout input.
    init(horizontalSizeClass: UserInterfaceSizeClass?, dynamicTypeSize: DynamicTypeSize) {
        self.init(
            isCompactWidth: horizontalSizeClass == .compact,
            isAccessibilityTextSize: dynamicTypeSize.isAccessibilitySize
        )
    }
}

extension CompactLayoutMetrics {
    /// Builds flexible `GridItem`s for the given column count.
    static func gridItems(count: Int, spacing: CGFloat) -> [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: spacing), count: max(count, 1))
    }
}
