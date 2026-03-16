// SPDX-License-Identifier: BUSL-1.1

// LockScreenView.swift
// Finance
//
// Full-screen biometric authentication gate displayed when the app
// is locked and the user has enabled biometric app lock in settings.
// References: #442

import os
import SwiftUI

// MARK: - Lock Screen View

/// A full-screen overlay that gates access to the app behind biometric
/// authentication (Face ID / Touch ID / Optic ID with passcode fallback).
///
/// Shown when:
/// - The app launches with biometric lock enabled
/// - The app returns from background with biometric lock enabled
///
/// The view automatically triggers authentication on appear and provides
/// a manual retry button if the initial attempt fails or is cancelled.
struct LockScreenView: View {
    let biometricManager: BiometricAuthManager
    let onUnlock: () -> Void

    @State private var authError: BiometricError?
    @State private var showingError = false
    @State private var isAuthenticating = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "LockScreenView"
    )

    var body: some View {
        ZStack {
            FinanceColors.backgroundPrimary
                .ignoresSafeArea()

            VStack(spacing: FinanceSpacing.lg) {
                Spacer()

                Image(systemName: biometricManager.biometricType.systemImage)
                    .font(.system(size: 64))
                    .foregroundStyle(FinanceColors.interactive)
                    .symbolEffect(
                        .pulse,
                        isActive: isAuthenticating && !reduceMotion
                    )
                    .accessibilityHidden(true)

                Text(String(localized: "Finance is Locked"))
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundStyle(FinanceColors.textPrimary)
                    .accessibilityAddTraits(.isHeader)

                Text(String(localized: "Authenticate to access your financial data."))
                    .font(.body)
                    .foregroundStyle(FinanceColors.textSecondary)
                    .multilineTextAlignment(.center)

                Spacer()

                Button {
                    Task { await authenticate() }
                } label: {
                    Label(
                        unlockButtonTitle,
                        systemImage: biometricManager.biometricType.systemImage
                    )
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: FinanceSpacing.minTapTarget)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isAuthenticating)
                .accessibilityLabel(unlockButtonTitle)
                .accessibilityHint(String(localized: "Authenticates to unlock the app"))
                .padding(.bottom, FinanceSpacing.xl)
            }
            .padding(.horizontal, FinanceSpacing.xl)
        }
        .alert(
            String(localized: "Authentication Failed"),
            isPresented: $showingError,
            presenting: authError
        ) { _ in
            Button(String(localized: "Try Again")) {
                Task { await authenticate() }
            }
            .accessibilityLabel(String(localized: "Try again"))
            Button(String(localized: "Cancel"), role: .cancel) {}
        } message: { error in
            Text(error.localizedDescription)
        }
        .task {
            await authenticate()
        }
        .accessibilityLabel(String(localized: "App lock screen"))
    }

    // MARK: - Private Helpers

    /// Localized button title matching the current biometric type.
    private var unlockButtonTitle: String {
        switch biometricManager.biometricType {
        case .faceID: String(localized: "Unlock with Face ID")
        case .touchID: String(localized: "Unlock with Touch ID")
        case .opticID: String(localized: "Unlock with Optic ID")
        case .none: String(localized: "Unlock")
        }
    }

    /// Triggers biometric (or passcode-fallback) authentication.
    ///
    /// On success the `onUnlock` closure is called — optionally wrapped
    /// in an animation when Reduce Motion is off.  On cancellation the
    /// user stays on the lock screen and can retry manually.
    private func authenticate() async {
        guard !isAuthenticating else { return }
        isAuthenticating = true
        defer { isAuthenticating = false }

        do {
            try await biometricManager.authenticate(
                reason: String(localized: "Authenticate to unlock Finance")
            )
            Self.logger.info("App unlock authentication succeeded")
            if reduceMotion {
                onUnlock()
            } else {
                withAnimation(.easeOut(duration: 0.25)) {
                    onUnlock()
                }
            }
        } catch let error as BiometricError {
            Self.logger.warning(
                "App unlock failed: \(error.localizedDescription, privacy: .public)"
            )
            if case .cancelled = error {
                // User cancelled — stay on lock screen, let them retry
                return
            }
            authError = error
            showingError = true
        } catch {
            Self.logger.error(
                "App unlock unexpected error: \(error.localizedDescription, privacy: .public)"
            )
            authError = .unknown(underlying: error)
            showingError = true
        }
    }
}

#Preview {
    LockScreenView(
        biometricManager: BiometricAuthManager(),
        onUnlock: {}
    )
}
