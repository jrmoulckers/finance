// SPDX-License-Identifier: BUSL-1.1

// OnboardingViewModel.swift
// Finance
//
// ViewModel for the first-launch onboarding flow. Manages page
// navigation, biometric opt-in state, and onboarding completion.
// Refs #476

import Foundation
import Observation
import os
import SwiftUI

// MARK: - OnboardingViewModel

/// Drives the 4-page onboarding experience shown on first launch.
///
/// Uses `@Observable` (Observation framework) for automatic SwiftUI
/// updates. The completion flag is persisted via `UserDefaults` so the
/// onboarding is only shown once.
///
/// > Important: The biometric opt-in preference is stored in
/// > `UserDefaults` via the same key used by ``BiometricAuthManager``
/// > and ``SettingsViewModel``. This is a non-sensitive boolean
/// > preference — not a secret.
@Observable
@MainActor
final class OnboardingViewModel {

    // MARK: - Navigation State

    /// Zero-based index of the currently visible onboarding page.
    var currentPage = 0

    /// Total number of pages in the onboarding flow.
    let totalPages = 4

    // MARK: - Biometric Opt-In

    /// Whether the user has opted in to biometric app lock during onboarding.
    var biometricOptIn = false

    // MARK: - Completion

    /// Persisted flag indicating onboarding has been completed or skipped.
    ///
    /// Backed by `UserDefaults` directly so the view model does not
    /// depend on SwiftUI property wrappers (`@AppStorage`).
    private(set) var hasCompletedOnboarding: Bool = UserDefaults.standard.bool(
        forKey: "hasCompletedOnboarding"
    )

    // MARK: - Logger

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "OnboardingViewModel"
    )

    // MARK: - Public API

    /// Advances to the next page if not already on the last page.
    func nextPage() {
        guard currentPage < totalPages - 1 else {
            Self.logger.debug("nextPage called on final page — ignoring")
            return
        }
        currentPage += 1
        Self.logger.debug("Advanced to onboarding page \(self.currentPage)")
    }

    /// Completes the onboarding flow, persisting the biometric preference
    /// if the user opted in and marking onboarding as finished.
    func completeOnboarding() {
        if biometricOptIn {
            UserDefaults.standard.set(
                true,
                forKey: BiometricAuthManager.appLockEnabledKey
            )
            Self.logger.info("Biometric app lock enabled during onboarding")
        }
        markComplete()
        Self.logger.info("Onboarding completed")
    }

    /// Skips the onboarding flow without enabling any optional features.
    func skip() {
        markComplete()
        Self.logger.info("Onboarding skipped")
    }

    // MARK: - Private Helpers

    /// Writes the completion flag to `UserDefaults`.
    private func markComplete() {
        hasCompletedOnboarding = true
        UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")
    }
}
