// SPDX-License-Identifier: BUSL-1.1
// WidgetPrivacyPrompt.swift — Refs #1608

import FinanceShared
import SwiftUI
import WidgetKit

private struct WidgetPrivacyPromptModifier: ViewModifier {
    @State private var showPrompt = false

    func body(content: Content) -> some View {
        content
            .task {
                if WidgetPrivacySettings.consumeFirstAddPrompt() {
                    showPrompt = true
                }
            }
            .alert(
                String(localized: "Show exact amounts on widgets?"),
                isPresented: $showPrompt
            ) {
                Button(String(localized: "Keep Bucketed"), role: .cancel) {
                    WidgetPrivacySettings.setDefaultMaskingMode(.bucketed)
                    WidgetPrivacySettings.markFirstAddPromptHandled()
                    WidgetCenter.shared.reloadTimelines(ofKind: "BudgetProgressWidget")
                }
                Button(String(localized: "Show Exact Amounts")) {
                    WidgetPrivacySettings.setDefaultMaskingMode(.visible)
                    WidgetPrivacySettings.markFirstAddPromptHandled()
                    WidgetCenter.shared.reloadTimelines(ofKind: "BudgetProgressWidget")
                }
            } message: {
                Text(String(localized: "Widgets can be visible when your device is locked. New budget widgets use bucketed amounts unless you opt in to exact values."))
            }
    }
}

extension View {
    /// Shows the first-add widget privacy prompt requested by the widget cache.
    func widgetPrivacyPrompt() -> some View {
        modifier(WidgetPrivacyPromptModifier())
    }
}
