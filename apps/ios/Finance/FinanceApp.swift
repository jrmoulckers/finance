// SPDX-License-Identifier: BUSL-1.1

import os
import SwiftUI
import WatchConnectivity

/// Finance — a cross-platform financial tracking application.
///
/// This is the SwiftUI entry point for iOS, iPadOS, and macOS (Catalyst).
/// The app consumes shared business logic from the KMP `core` module and
/// renders a native Apple experience using SwiftUI exclusively.
///
/// When biometric app lock is enabled in settings, the app shows a
/// full-screen lock overlay on launch and when returning from background.
///
/// On launch the app checks for an existing auth session via
/// `AuthenticationService`. When the scene returns to active, Apple
/// credential state is re-verified to handle server-side revocations.
@main
struct FinanceApp: App {
    @State private var biometricManager = BiometricAuthManager()
    @State private var authService = AuthenticationService()
    @State private var deepLinkHandler = DeepLinkHandler()
    @State private var networkMonitor = NetworkMonitor()
    @State private var watchDataSender = WatchDataSender()
    @State private var isLocked = true
    @State private var showOnboarding = !UserDefaults.standard.bool(
        forKey: OnboardingView.hasCompletedOnboardingKey
    )
    @Environment(\.scenePhase) private var scenePhase

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "FinanceApp"
    )

    /// Whether the user has enabled biometric app lock in settings.
    private var biometricLockEnabled: Bool {
        UserDefaults.standard.bool(forKey: BiometricAuthManager.appLockEnabledKey)
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                if showOnboarding {
                    OnboardingView(onComplete: {
                        showOnboarding = false
                    })
                    .transition(.opacity)
                } else {
                    ContentView(
                        deepLinkHandler: deepLinkHandler,
                        networkMonitor: networkMonitor
                    )
                    .environment(biometricManager)
                    .environment(authService)
                    .accessibilityHidden(biometricLockEnabled && isLocked)

                    if biometricLockEnabled && isLocked {
                        LockScreenView(
                            biometricManager: biometricManager,
                            onUnlock: { isLocked = false }
                        )
                        .transition(.opacity)
                    }
                }
            }
            .onOpenURL { url in
                Self.logger.info(
                    "Received URL: \(url.absoluteString, privacy: .public)"
                )
                deepLinkHandler.handle(url)
            }
            .onChange(of: scenePhase) { _, newPhase in
                handleScenePhaseChange(newPhase)
            }
            .task {
                if !biometricLockEnabled {
                    isLocked = false
                }
                await authService.checkExistingSession()
            }
        }
    }

    /// Handles scene phase transitions for biometric lock management
    /// and Apple credential state verification.
    /// - `.background`: re-locks the app when biometric lock is enabled so
    ///   the next foreground activation requires authentication.
    private func handleScenePhaseChange(_ phase: ScenePhase) {
        switch phase {
        case .active:
            Self.logger.debug("Scene became active")
            biometricManager.refreshAvailability()
            if let user = authService.currentUser {
                Task {
                    let valid = await authService.checkCredentialState(userID: user.id)
                    if !valid { await authService.signOut() }
                }
            }
        case .background:
            Self.logger.debug("Scene entered background")
            if biometricLockEnabled {
                isLocked = true
            }
            Task {
                await watchDataSender.sendLatestData()
            }
        case .inactive:
            Self.logger.debug("Scene became inactive")
        @unknown default:
            break
        }
    }
}
