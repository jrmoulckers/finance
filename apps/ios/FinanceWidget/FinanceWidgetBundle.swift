// SPDX-License-Identifier: BUSL-1.1
// FinanceWidgetBundle.swift — Refs #380

import SwiftUI
import WidgetKit

@main
struct FinanceWidgetBundle: WidgetBundle {
    var body: some Widget {
        BalanceWidget()
        BudgetProgressWidget()
        RecentTransactionsWidget()
        QuickEntryWidget()
    }
}