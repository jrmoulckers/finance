// SPDX-License-Identifier: BUSL-1.1

// SettingsViewModel.swift
// Finance
//
// ViewModel for the settings screen. Manages user preferences for
// currency, notifications, biometric auth, and data management.

import Foundation
import Observation
import os

@Observable
@MainActor
final class SettingsViewModel {
    var selectedCurrency = "USD"
    var notificationsEnabled = true
    var budgetAlerts = true
    var goalMilestones = true
    var biometricEnabled: Bool = UserDefaults.standard.bool(
        forKey: BiometricAuthManager.appLockEnabledKey
    )
    var appVersion = "1.0.0"
    var buildNumber = "1"
    var showingExportConfirmation = false
    var isExporting = false
    var showingDeleteConfirmation = false
    var biometricError: BiometricError?
    var showingBiometricError = false
    var errorMessage: String?

    /// Whether a general error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SettingsViewModel"
    )

    let supportedCurrencies = [
        ("USD", "US Dollar"), ("EUR", "Euro"), ("GBP", "British Pound"),
        ("CAD", "Canadian Dollar"), ("JPY", "Japanese Yen"),
        ("AUD", "Australian Dollar"), ("CHF", "Swiss Franc"),
    ]

    func loadSettings() async {
        biometricEnabled = UserDefaults.standard.bool(
            forKey: BiometricAuthManager.appLockEnabledKey
        )
        // TODO: Load settings from KMP shared preferences and Keychain
    }

    /// Toggles biometric app lock, requiring authentication to confirm
    /// the change in both directions (enable and disable).
    func toggleBiometric(using manager: BiometricAuthManager) async {
        let newValue = !biometricEnabled
        let reason = newValue
            ? String(localized: "Verify your identity to enable biometric lock")
            : String(localized: "Verify your identity to disable biometric lock")

        do {
            try await manager.authenticate(reason: reason)
            biometricEnabled = newValue
            UserDefaults.standard.set(
                newValue,
                forKey: BiometricAuthManager.appLockEnabledKey
            )
            Self.logger.info(
                "Biometric app lock \(newValue ? "enabled" : "disabled", privacy: .public)"
            )
        } catch let error as BiometricError {
            Self.logger.warning(
                "Biometric toggle failed: \(error.localizedDescription, privacy: .public)"
            )
            if case .cancelled = error { return }
            biometricError = error
            showingBiometricError = true
        } catch {
            Self.logger.error(
                "Biometric toggle unexpected error: \(error.localizedDescription, privacy: .public)"
            )
            biometricError = .unknown(underlying: error)
            showingBiometricError = true
        }
    }

    /// Authenticates the user before allowing data export.
    ///
    /// Export contains sensitive financial data and is gated behind
    /// biometric / passcode authentication regardless of whether
    /// biometric app lock is enabled.
    ///
    /// - Returns: `true` if the user was successfully authenticated.
    func authenticateForExport(using manager: BiometricAuthManager) async -> Bool {
        do {
            try await manager.authenticate(
                reason: String(localized: "Verify your identity to export financial data")
            )
            Self.logger.info("Export data authentication succeeded")
            return true
        } catch let error as BiometricError {
            Self.logger.warning(
                "Export auth failed: \(error.localizedDescription, privacy: .public)"
            )
            if case .cancelled = error { return false }
            biometricError = error
            showingBiometricError = true
            return false
        } catch {
            Self.logger.error(
                "Export auth unexpected error: \(error.localizedDescription, privacy: .public)"
            )
            biometricError = .unknown(underlying: error)
            showingBiometricError = true
            return false
        }
    }

    func exportData() async {
        isExporting = true
        defer { isExporting = false }
        // TODO: Implement data export via KMP shared logic
        try? await Task.sleep(for: .seconds(1))
    }
}