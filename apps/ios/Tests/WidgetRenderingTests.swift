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

    func testTodaySpendViewsInstantiateForHomeScreenSizes() {
        let entry = TodaySpendEntry(
            date: .now,
            summary: .placeholder,
            maskingMode: .bucketed,
            isStale: false
        )

        _ = TodaySpendWidgetView(entry: entry).environment(\.widgetFamily, .systemSmall)
        _ = TodaySpendWidgetView(entry: entry).environment(\.widgetFamily, .systemMedium)
    }

    func testTodaySpendViewHandlesStaleAndOverBudgetState() {
        let summary = TodaySpendSummary(
            todaySpentMinorUnits: 9_900,
            periodDiscretionarySpentMinorUnits: 30_000,
            discretionaryBudgetMinorUnits: 25_000,
            currencyCode: "USD",
            updatedAt: .distantPast
        )
        let entry = TodaySpendEntry(
            date: .now,
            summary: summary,
            maskingMode: .visible,
            isStale: true
        )

        _ = TodaySpendWidgetView(entry: entry).environment(\.widgetFamily, .systemSmall)
        _ = TodaySpendWidgetView(entry: entry).environment(\.widgetFamily, .systemMedium)
    }
}
