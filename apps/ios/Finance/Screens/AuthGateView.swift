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
// Prevents authenticated users from ever seeing login/signup screens (#1489).
// Deep links targeting auth screens while authenticated are redirected to main.
//
// References: #650, #1489

import os
import SwiftUI

// MARK: - AuthGateView

/// Root authentication gate that shows login or main content based on auth state.
///
/// On launch, checks for an existing Keychain session. If found, refreshes
/// the token and proceeds to the main app. If not, shows ``LoginView``.
///
/// The view uses a splash/loading state to prevent any flash of the login
/// screen during session restoration. Only transitions to auth or main
/// content AFTER the auth state is definitively known.
///
/// Auth tokens are always stored in the Keychain — never in UserDefaults.
struct AuthGateView: View {

    @State private var authService: AuthenticationService
    @Bindable var deepLinkHandler: DeepLinkHandler
    @State var networkMonitor: NetworkMonitor

    /// Tracks whether the initial session check has completed to prevent
    /// showing login UI before we know the definitive auth state.
    @State private var hasCompletedInitialCheck = false

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
        ZStack {
            switch resolvedState {
            case .splash:
                splashView
                    .transition(.opacity)
            case .authenticated:
                ContentView(
                    deepLinkHandler: deepLinkHandler,
                    networkMonitor: networkMonitor
                )
                .environment(authService)
                .transition(.opacity)
            case .unauthenticated:
                LoginView()
                    .environment(authService)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: resolvedState)
        .task {
            await authService.checkExistingSession()
            hasCompletedInitialCheck = true
            Self.logger.info("Initial session check complete, state: \(String(describing: authService.state))")
        }
        .onChange(of: authService.isAuthenticated) { _, isAuthenticated in
            if isAuthenticated {
                redirectAuthDeepLinks()
            }
        }
    }

    // MARK: - Resolved State

    /// The definitive view state, ensuring we never show login UI before
    /// the auth session check completes.
    private var resolvedState: ResolvedAuthState {
        // Always show splash until initial check completes — prevents flash of login
        guard hasCompletedInitialCheck else {
            return .splash
        }

        switch authService.state {
        case .loading:
            return .splash
        case .authenticated:
            return .authenticated
        case .unauthenticated, .error:
            return .unauthenticated
        }
    }

    // MARK: - Deep Link Auth Redirect

    /// Redirects auth-related deep links to the main app when authenticated.
    ///
    /// If the user is authenticated and a deep link targets an auth screen
    /// (e.g. `/auth/callback`), we consume it and redirect to dashboard.
    private func redirectAuthDeepLinks() {
        if case .authCallback = deepLinkHandler.currentDeepLink {
            Self.logger.info("Redirecting auth deep link — user already authenticated")
            deepLinkHandler.completeAuthCallback()
            deepLinkHandler.selectedTab = .dashboard
        }
    }

    // MARK: - Splash View

    @ViewBuilder
    private var splashView: some View {
        VStack(spacing: 20) {
            Image(systemName: "banknote")
                .font(.system(size: 60))
                .foregroundStyle(.tint)
                .accessibilityHidden(true)

            ProgressView()
                .controlSize(.regular)

            Text(String(localized: "Loading..."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Finance is loading, please wait"))
    }
}

// MARK: - ResolvedAuthState

/// Internal state enum for the auth gate view transitions.
///
/// Separates the concept of "still determining auth" (splash) from
/// the service's `.loading` state to prevent flash of login screen.
private enum ResolvedAuthState: Equatable {
    case splash
    case authenticated
    case unauthenticated
}

#Preview("Authenticated") {
    AuthGateView()
        .environment(BiometricAuthManager())
}
