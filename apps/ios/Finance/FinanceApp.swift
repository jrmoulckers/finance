// SPDX-License-Identifier: BUSL-1.1

import os
import SwiftUI

/// Finance — a cross-platform financial tracking application.
///
/// This is the SwiftUI entry point for iOS, iPadOS, and macOS (Catalyst).
/// The app consumes shared business logic from the KMP `core` module and
/// renders a native Apple experience using SwiftUI exclusively.
///
/// When biometric app lock is enabled in settings, the app shows a
/// full-screen lock overlay on launch and when returning from background.
@main
struct FinanceApp: App {
    @State private var biometricManager = BiometricAuthManager()
    @State private var deepLinkHandler = DeepLinkHandler()
    @State private var networkMonitor = NetworkMonitor()
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
            }
        }
    }

    /// Handles scene phase transitions for biometric lock management.
    ///
    /// - `.active`: refreshes biometric availability (e.g. user enrolled
    ///   Face ID while the app was backgrounded).
    /// - `.background`: re-locks the app when biometric lock is enabled so
    ///   the next foreground activation requires authentication.
    private func handleScenePhaseChange(_ phase: ScenePhase) {
        switch phase {
        case .active:
            Self.logger.debug("Scene became active")
            biometricManager.refreshAvailability()
        case .background:
            Self.logger.debug("Scene entered background")
            if biometricLockEnabled {
                isLocked = true
            }
        case .inactive:
            Self.logger.debug("Scene became inactive")
        @unknown default:
            break
        }
    }
}
