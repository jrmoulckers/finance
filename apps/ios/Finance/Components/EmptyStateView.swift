// EmptyStateView.swift
// Finance
//
// Reusable empty state placeholder shown when lists have no data.

import SwiftUI

struct EmptyStateView: View {
    let systemImage: String
    let title: String
    let message: String
    let actionLabel: String?
    let action: (() -> Void)?

    init(
        systemImage: String,
        title: String,
        message: String,
        actionLabel: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.systemImage = systemImage
        self.title = title
        self.message = message
        self.actionLabel = actionLabel
        self.action = action
    }

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text(message)
        } actions: {
            if let actionLabel, let action {
                Button(action: action) {
                    Text(actionLabel)
                }
                .accessibilityLabel(actionLabel)
                .accessibilityHint(String(localized: "Creates a new item"))
            }
        }
    }
}

#Preview("No Accounts") {
    EmptyStateView(
        systemImage: "building.columns",
        title: "No Accounts",
        message: "Add your first account to start tracking.",
        actionLabel: "Add Account",
        action: {}
    )
}

#Preview("No Transactions") {
    EmptyStateView(
        systemImage: "arrow.left.arrow.right",
        title: "No Transactions",
        message: "Your transactions will appear here."
    )
}
