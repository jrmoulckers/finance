// SPDX-License-Identifier: BUSL-1.1
// FinanceClipApp.swift - FinanceClip - Refs #648
import FinanceShared
import os
import SwiftUI
@main
struct FinanceClipApp: App {
    @State private var initialAmountMinorUnits: Int64?
    @State private var initialCategoryId: String?
    private static let logger = Logger(subsystem: "com.finance.clip", category: "FinanceClipApp")
    var body: some Scene {
        WindowGroup {
            QuickTransactionView(initialAmountMinorUnits: initialAmountMinorUnits, initialCategoryId: initialCategoryId)
            .onOpenURL { url in handleInvocationURL(url) }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                if let url = activity.webpageURL { handleInvocationURL(url) }
            }
        }
    }
    private func handleInvocationURL(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else { return }
        if let amountString = components.queryItems?.first(where: { $0.name == "amount" })?.value,
           let amountDecimal = Decimal(string: amountString) {
            initialAmountMinorUnits = NSDecimalNumber(decimal: amountDecimal * 100).int64Value
        }
        if let categoryId = components.queryItems?.first(where: { $0.name == "category" })?.value, !categoryId.isEmpty {
            if TransactionCategory.quickCategories.contains(where: { $0.id == categoryId }) { initialCategoryId = categoryId }
        }
    }
}
