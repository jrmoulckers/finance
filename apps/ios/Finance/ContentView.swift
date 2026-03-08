// SPDX-License-Identifier: BUSL-1.1

import SwiftUI

/// Root view of the Finance application.
///
/// This placeholder will be replaced with a `TabView` containing
/// Accounts, Transactions, Budgets, Goals, and Settings tabs once
/// the KMP shared models are integrated via Swift Export.
struct ContentView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: FinanceSpacing.lg) {
                Image(systemName: "banknote")
                    .font(.system(size: 64))
                    .foregroundStyle(FinanceColors.interactive)
                    .accessibilityHidden(true)

                Text(String(localized: "Finance"))
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundStyle(FinanceColors.textPrimary)
                    .accessibilityAddTraits(.isHeader)

                Text(String(localized: "Your financial life, unified."))
                    .font(.body)
                    .foregroundStyle(FinanceColors.textSecondary)

                Text(String(localized: "SwiftUI + KMP — coming soon"))
                    .font(.caption)
                    .foregroundStyle(FinanceColors.textDisabled)
            }
            .padding(FinanceSpacing.xl)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(FinanceColors.backgroundPrimary)
            .navigationTitle(String(localized: "Finance"))
        }
    }
}

#Preview {
    ContentView()
}
