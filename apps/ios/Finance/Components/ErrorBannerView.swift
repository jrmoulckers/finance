// SPDX-License-Identifier: BUSL-1.1

// ErrorBannerView.swift
// Finance
//
// Reusable error banner with optional retry action. Displayed as an
// overlay when a data refresh fails but existing content is still
// visible. Refs #475

import SwiftUI

// MARK: - ErrorBannerView

/// A non-intrusive error banner shown when a data operation fails.
///
/// Displays a warning icon, error message, and an optional retry
/// button. Uses `.ultraThinMaterial` for visual consistency with
/// ``OfflineBannerView``. The entire banner is combined into a single
/// accessibility element for a concise VoiceOver experience.
///
/// Usage:
/// ```swift
/// .overlay(alignment: .top) {
///     if let error = viewModel.errorMessage, !viewModel.items.isEmpty {
///         ErrorBannerView(message: error) {
///             await viewModel.loadData()
///         }
///     }
/// }
/// ```
struct ErrorBannerView: View {
    let message: String
    let retryAction: (() async -> Void)?

    init(message: String, retryAction: (() async -> Void)? = nil) {
        self.message = message
        self.retryAction = retryAction
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                Text(message)
                    .font(.subheadline)
            }
            if let retryAction {
                Button(String(localized: "Try Again")) {
                    Task { await retryAction() }
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Error: \(message)"))
    }
}

// MARK: - Previews

#Preview("Error Banner with Retry") {
    VStack {
        ErrorBannerView(message: "Could not refresh accounts.") {
            // Simulate retry
        }
        Spacer()
    }
}

#Preview("Error Banner without Retry") {
    VStack {
        ErrorBannerView(message: "Network request failed.")
        Spacer()
    }
}
