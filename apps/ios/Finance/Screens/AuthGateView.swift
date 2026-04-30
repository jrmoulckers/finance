// SPDX-License-Identifier: BUSL-1.1
// AuthGateView.swift — Gates the app behind authentication state.
//
// Observes the ``AuthenticationService`` state and shows either the
// ``LoginView`` or the main app content. Checks for an existing session
// on launch and refreshes tokens if needed.
//
// This view sits between the app entry point and ContentView, ensuring
// all data views have a valid auth context.
//
// References: #650

import os
import SwiftUI

// MARK: - AuthGateView

/// Root authentication gate that shows login or main content based on auth state.
///
/// On launch, checks for an existing Keychain session. If found, refreshes
/// the token and proceeds to the main app. If not, shows ``LoginView``.
///
/// Auth tokens are always stored in the Keychain — never in UserDefaults.
struct AuthGateView: View {

    @State private var authService: AuthenticationService
    @Bindable var deepLinkHandler: DeepLinkHandler
    @State var networkMonitor: NetworkMonitor

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AuthGateView"
    )

    init(
        authService: AuthenticationService = AuthenticationService(),
        deepLinkHandler: DeepLinkHandler = DeepLinkHandler(),
        networkMonitor: NetworkMonitor = NetworkMonitor()
    ) {
        _authService = State(initialValue: authService)
        self.deepLinkHandler = deepLinkHandler
        self.networkMonitor = networkMonitor
    }

    var body: some View {
        Group {
            switch authService.state {
            case .loading:
                loadingView
            case .authenticated:
                ContentView(
                    deepLinkHandler: deepLinkHandler,
                    networkMonitor: networkMonitor
                )
                .environment(authService)
            case .unauthenticated, .error:
                LoginView()
                    .environment(authService)
            }
        }
        .task {
            await authService.checkExistingSession()
        }
    }

    // MARK: - Loading View

    @ViewBuilder
    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text(String(localized: "Checking session..."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Checking your authentication session"))
    }
}

#Preview("Authenticated") {
    AuthGateView()
        .environment(BiometricAuthManager())
}
