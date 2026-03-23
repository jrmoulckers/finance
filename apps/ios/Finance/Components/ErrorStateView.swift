// SPDX-License-Identifier: BUSL-1.1

// ErrorStateView.swift
// Finance
//
// Reusable error display component with retry support. Shown when
// data loading fails across any screen.
// References: #475

import SwiftUI

// MARK: - View

/// A full-width error state placeholder with an SF Symbol, localized
/// message, and an optional retry button.
///
/// Use this component wherever a data load can fail — it provides a
/// consistent error experience across the app and meets all
/// accessibility requirements (Dynamic Type, VoiceOver labels,
/// minimum tap targets).
///
/// ```swift
/// if let errorMessage = viewModel.errorMessage {
///     ErrorStateView(
///         message: errorMessage,
///         retryAction: { await viewModel.reload() }
///     )
/// }
/// ```
struct ErrorStateView: View {
    let systemImage: String
    let title: String
    let message: String
    let retryLabel: String?
    let retryAction: (() async -> Void)?

    init(
        systemImage: String = "exclamationmark.triangle",
        title: String = String(localized: "Something Went Wrong"),
        message: String,
        retryLabel: String? = String(localized: "Try Again"),
        retryAction: (() async -> Void)? = nil
    ) {
        self.systemImage = systemImage
        self.title = title
        self.message = message
        self.retryLabel = retryLabel
        self.retryAction = retryAction
    }

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text(message)
        } actions: {
            if let retryLabel, let retryAction {
                Button {
                    Task { await retryAction() }
                } label: {
                    Text(retryLabel)
                }
                .accessibilityLabel(retryLabel)
                .accessibilityHint(String(localized: "Retries the failed operation"))
            }
        }
    }
}

// MARK: - Convenience Initializer

extension ErrorStateView {
    /// Creates an error state from a localized error description.
    init(
        error: Error,
        retryAction: (() async -> Void)? = nil
    ) {
        self.init(
            message: error.localizedDescription,
            retryAction: retryAction
        )
    }
}

// MARK: - Alert Modifier

/// A `ViewModifier` that presents an error `.alert` and optionally
/// retries the failed operation when the user taps "Try Again".
///
/// Attach to any screen that manages an `errorMessage` binding:
/// ```swift
/// .modifier(ErrorAlertModifier(
///     errorMessage: $viewModel.errorMessage,
///     retryAction: { await viewModel.reload() }
/// ))
/// ```
struct ErrorAlertModifier: ViewModifier {
    @Binding var errorMessage: String?
    let retryAction: (() async -> Void)?

    private var isPresented: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )
    }

    func body(content: Content) -> some View {
        content
            .alert(
                String(localized: "Error"),
                isPresented: isPresented
            ) {
                if let retryAction {
                    Button(String(localized: "Try Again")) {
                        Task { await retryAction() }
                    }
                    .accessibilityLabel(String(localized: "Try Again"))
                }
                Button(String(localized: "OK"), role: .cancel) {}
                    .accessibilityLabel(String(localized: "Dismiss error"))
            } message: {
                if let errorMessage {
                    Text(errorMessage)
                }
            }
    }
}

// MARK: - View Extension

extension View {
    /// Attaches a reusable error alert to the view.
    ///
    /// When `errorMessage` becomes non-nil, the alert is presented.
    /// If `retryAction` is provided, a "Try Again" button is included.
    func errorAlert(
        errorMessage: Binding<String?>,
        retryAction: (() async -> Void)? = nil
    ) -> some View {
        modifier(ErrorAlertModifier(
            errorMessage: errorMessage,
            retryAction: retryAction
        ))
    }
}

// MARK: - Previews

#Preview("Error with Retry") {
    ErrorStateView(
        message: "Unable to load your accounts. Please check your connection.",
        retryAction: {}
    )
}

#Preview("Error without Retry") {
    ErrorStateView(
        systemImage: "wifi.slash",
        title: "No Connection",
        message: "You appear to be offline.",
        retryLabel: nil
    )
}

#Preview("Network Error") {
    ErrorStateView(
        error: URLError(.notConnectedToInternet)
    )
}
