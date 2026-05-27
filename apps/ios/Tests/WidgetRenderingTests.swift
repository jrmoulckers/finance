// SPDX-License-Identifier: BUSL-1.1

import FinanceShared
import SwiftUI
import WidgetKit
import XCTest
@testable import FinanceWidgets

final class WidgetRenderingTests: XCTestCase {
    func testBudgetWidgetViewsInstantiateForAllHomeScreenSizes() {
        let budgets = WidgetBudget.placeholders
        let rollup = WidgetBudgetRollup(
            budgets: budgets,
            totalSpentMinorUnits: budgets.reduce(0) { $0 + $1.spentMinorUnits },
            totalLimitMinorUnits: budgets.reduce(0) { $0 + $1.limitMinorUnits },
            currencyCode: "USD"
        )
        let entry = BudgetWidgetEntry(
            date: .now,
            budgets: budgets,
            rollup: rollup,
            maskingMode: .bucketed
        )

        _ = BudgetProgressWidgetView(entry: entry).environment(\.widgetFamily, .systemSmall)
        _ = BudgetProgressWidgetView(entry: entry).environment(\.widgetFamily, .systemMedium)
        _ = BudgetProgressWidgetView(entry: entry).environment(\.widgetFamily, .systemLarge)
    }

    func testLockScreenQuickEntryViewsInstantiateForAccessorySizes() {
        let entry = QuickEntryWidgetEntry(date: .now, shortcut: .lunch)

        _ = QuickEntryWidgetView(entry: entry).environment(\.widgetFamily, .accessoryCircular)
        _ = QuickEntryWidgetView(entry: entry).environment(\.widgetFamily, .accessoryRectangular)
    }
}
