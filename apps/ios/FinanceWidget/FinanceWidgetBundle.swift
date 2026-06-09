// SPDX-License-Identifier: BUSL-1.1
// FinanceWidgetBundle.swift — Refs #380

import SwiftUI
import WidgetKit

@main
struct FinanceWidgetBundle: WidgetBundle {
    // TODO(#2033): Wire Sentry SDK for iOS widgets here.
    // See docs/ops/monitoring-setup.md for DSN, consent, and scrubbing requirements.
    var body: some Widget {
        BalanceWidget()
        BudgetProgressWidget()
        RecentTransactionsWidget()
        QuickEntryWidget()
    }
}
