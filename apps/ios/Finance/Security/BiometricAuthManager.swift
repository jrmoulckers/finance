// SPDX-License-Identifier: BUSL-1.1

// BiometricAuthManager.swift
// Finance
//
// Face ID / Touch ID wrapper using LocalAuthentication framework.
// Refs #21

import Foundation
import LocalAuthentication

// MARK: - BiometricError

/// Errors surfaced by ``BiometricAuthManager``.
enum BiometricError: LocalizedError, Sendable {
    case biometryNotAvailable
    case biometryNotEnrolled
    case biometryLockout
    case authenticationFailed(underlying: Error)
    case cancelled
    case unknown(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .biometryNotAvailable:
            String(localized: "Biometric authentication is not available on this device.")
        case .biometryNotEnrolled:
            String(localized: "No biometric credentials are enrolled. Please set up Face ID or Touch ID in Settings.")
        case .biometryLockout:
            String(localized: "Biometric authentication is locked out. Please use your device passcode to re-enable it.")
        case .authenticationFailed(let underlying):
            String(localized: "Authentication failed: \(underlying.localizedDescription)")
        case .cancelled:
            String(localized: "Authentication was cancelled.")
        case .unknown(let underlying):
            String(localized: "An unexpected error occurred: \(underlying.localizedDescription)")
        }
    }
}

// MARK: - BiometricType

/// The type of biometric hardware available on the current device.
enum BiometricType: Sendable {
    case none
    case faceID
    case touchID
    case opticID
}

// MARK: - BiometricType Display Properties

extension BiometricType {
    /// Localized display name for use in UI labels and settings.
    var displayName: String {
        switch self {
        case .faceID: String(localized: "Face ID")
        case .touchID: String(localized: "Touch ID")
        case .opticID: String(localized: "Optic ID")
        case .none: String(localized: "Biometric Authentication")
        }
    }

    /// SF Symbol name matching the biometric type.
    var systemImage: String {
        switch self {
        case .faceID: "faceid"
        case .touchID: "touchid"
        case .opticID: "opticid"
        case .none: "lock"
        }
    }
}

// MARK: - BiometricAuthManaging Protocol

/// Abstraction over biometric authentication for testability.
protocol BiometricAuthManaging: Sendable {
    func canAuthenticate() -> Bool
    func authenticate(reason: String) async throws
}

// MARK: - BiometricAuthManager

/// Manages Face ID, Touch ID, and Optic ID authentication via the
/// `LocalAuthentication` framework.
///
/// Uses `.deviceOwnerAuthentication` policy which permits biometric
/// authentication with automatic fallback to the device passcode when
/// biometry is unavailable or locked out.
///
/// > Important: Never cache biometric results beyond the current session.
@Observable
final class BiometricAuthManager: BiometricAuthManaging {

    // MARK: - Published State

    /// Whether biometric authentication is available on this device.
    private(set) var isAvailable: Bool = false

    /// The type of biometric hardware detected.
    private(set) var biometricType: BiometricType = .none

    /// Default localized reason shown in the system biometric prompt.
    static let defaultReason = String(localized: "Verify your identity to access Finance")

    /// UserDefaults key for the biometric app lock preference.
    ///
    /// Used by `SettingsViewModel` and `FinanceApp` to persist/read the
    /// user's choice to enable biometric app lock. This is a non-sensitive
    /// boolean preference — not a secret.
    static let appLockEnabledKey = "biometricAuthEnabled"

    // MARK: - Initialization

    init() {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            error: &error
        )
        isAvailable = available

        switch context.biometryType {
        case .faceID:
            biometricType = .faceID
        case .touchID:
            biometricType = .touchID
        case .opticID:
            biometricType = .opticID
        default:
            biometricType = .none
        }
    }

    // MARK: - Public API

    /// Checks whether biometric or passcode authentication can be performed.
    ///
    /// - Returns: `true` if the device can evaluate the authentication policy.
    @discardableResult
    nonisolated func canAuthenticate() -> Bool {
        let context = LAContext()
        var error: NSError?
        let canEvaluate = context.canEvaluatePolicy(
            .deviceOwnerAuthentication,
            error: &error
        )
        return canEvaluate
    }

    /// Prompts the user for biometric authentication (Face ID / Touch ID)
    /// with an automatic fallback to the device passcode.
    ///
    /// - Parameter reason: A localized string explaining why authentication
    ///   is required. Defaults to ``defaultReason``.
    /// - Throws: A ``BiometricError`` describing why authentication failed.
    func authenticate(
        reason: String = BiometricAuthManager.defaultReason
    ) async throws {
        let context = LAContext()
        context.localizedCancelTitle = String(localized: "Cancel")

        var policyError: NSError?
        guard context.canEvaluatePolicy(
            .deviceOwnerAuthentication,
            error: &policyError
        ) else {
            throw mapLAError(policyError)
        }

        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: reason
            )

            guard success else {
                throw BiometricError.authenticationFailed(
                    underlying: NSError(
                        domain: "BiometricAuthManager",
                        code: -1,
                        userInfo: [
                            NSLocalizedDescriptionKey: String(localized: "Authentication did not succeed.")
                        ]
                    )
                )
            }
        } catch let error as LAError {
            throw mapLAError(error)
        } catch {
            throw BiometricError.unknown(underlying: error)
        }
    }

    // MARK: - Availability

    /// Refreshes cached availability and biometric type state.
    func refreshAvailability() {
        let context = LAContext()
        var error: NSError?
        isAvailable = context.canEvaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            error: &error
        )

        switch context.biometryType {
        case .faceID:
            biometricType = .faceID
        case .touchID:
            biometricType = .touchID
        case .opticID:
            biometricType = .opticID
        default:
            biometricType = .none
        }
    }

    // MARK: - Error Mapping

    /// Maps `LAError` codes to ``BiometricError`` cases.
    private func mapLAError(_ error: Error?) -> BiometricError {
        guard let nsError = error as NSError? else {
            return .biometryNotAvailable
        }

        let code = LAError.Code(rawValue: nsError.code) ?? .appCancel

        switch code {
        case .biometryNotAvailable:
            return .biometryNotAvailable
        case .biometryNotEnrolled:
            return .biometryNotEnrolled
        case .biometryLockout:
            return .biometryLockout
        case .userCancel, .appCancel, .systemCancel:
            return .cancelled
        case .authenticationFailed:
            return .authenticationFailed(underlying: nsError)
        default:
            return .unknown(underlying: nsError)
        }
    }
}
