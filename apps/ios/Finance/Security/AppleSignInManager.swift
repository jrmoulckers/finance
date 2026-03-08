// SPDX-License-Identifier: BUSL-1.1

// AppleSignInManager.swift
// Finance
//
// Sign in with Apple integration via ASAuthorizationController.
// Converts Apple credentials to a Supabase auth session.
// Refs #24

import AuthenticationServices
import CryptoKit
import Foundation

// MARK: - AppleSignInError

/// Errors surfaced by ``AppleSignInManager``.
enum AppleSignInError: LocalizedError, Sendable {
    case missingIdentityToken
    case invalidIdentityToken
    case authorizationFailed(underlying: Error)
    case cancelled
    case supabaseSessionFailed(underlying: Error)
    case unknown(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .missingIdentityToken:
            String(localized: "Apple Sign-In did not return an identity token.")
        case .invalidIdentityToken:
            String(localized: "The identity token from Apple could not be decoded.")
        case .authorizationFailed(let underlying):
            String(localized: "Apple Sign-In failed: \(underlying.localizedDescription)")
        case .cancelled:
            String(localized: "Apple Sign-In was cancelled.")
        case .supabaseSessionFailed(let underlying):
            String(localized: "Failed to create a session: \(underlying.localizedDescription)")
        case .unknown(let underlying):
            String(localized: "An unexpected error occurred: \(underlying.localizedDescription)")
        }
    }
}

// MARK: - AppleSignInCredential

/// Lightweight value type holding the relevant fields from an Apple
/// authorization response.
struct AppleSignInCredential: Sendable {
    /// The stable, team-scoped user identifier from Apple.
    let userID: String

    /// The user's full name, if provided (first sign-in only).
    let fullName: PersonNameComponents?

    /// The user's email address, if provided (first sign-in only).
    let email: String?

    /// The JWT identity token issued by Apple (used for Supabase auth).
    let identityToken: String

    /// The short-lived authorization code (for server-side validation).
    let authorizationCode: String?

    /// A nonce that was sent with the request, used for replay protection.
    let nonce: String
}

// MARK: - AppleSignInManaging Protocol

/// Abstraction over Apple Sign-In for testability.
@MainActor
protocol AppleSignInManaging: Sendable {
    func signIn() async throws -> AppleSignInCredential
}

// MARK: - AppleSignInManager

/// Manages the Sign in with Apple flow via `ASAuthorizationController`.
///
/// ## Flow
/// 1. Generate a cryptographic nonce for replay protection.
/// 2. Present the system Apple Sign-In sheet.
/// 3. Receive the `ASAuthorizationAppleIDCredential`.
/// 4. Extract the identity token and map to ``AppleSignInCredential``.
/// 5. Forward the credential to the Supabase auth layer for session creation.
///
/// > Important: Apple only provides the user's full name and email on the
/// > **first** authorization. Persist these values via the KMP data layer
/// > immediately upon receipt.
@Observable
@MainActor
final class AppleSignInManager: NSObject, AppleSignInManaging {

    // MARK: - State

    /// Whether a sign-in flow is currently in progress.
    private(set) var isSigningIn: Bool = false

    /// The current nonce used for the active sign-in request.
    private var currentNonce: String?

    /// Continuation used to bridge the delegate callback to async/await.
    private var signInContinuation: CheckedContinuation<AppleSignInCredential, Error>?

    // MARK: - Public API

    /// Initiates the Sign in with Apple authorization flow.
    func signIn() async throws -> AppleSignInCredential {
        guard !isSigningIn else {
            throw AppleSignInError.unknown(
                underlying: NSError(
                    domain: "AppleSignInManager",
                    code: -1,
                    userInfo: [
                        NSLocalizedDescriptionKey: String(localized: "A sign-in is already in progress.")
                    ]
                )
            )
        }

        isSigningIn = true

        defer {
            isSigningIn = false
            currentNonce = nil
        }

        let nonce = Self.generateNonce()
        currentNonce = nonce

        return try await withCheckedThrowingContinuation { continuation in
            self.signInContinuation = continuation

            let provider = ASAuthorizationAppleIDProvider()
            let request = provider.createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = Self.sha256(nonce)

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.performRequests()
        }
    }

    // MARK: - Credential State

    /// Checks the current authorization state for a previously signed-in user.
    func credentialState(for userID: String) async throws -> ASAuthorizationAppleIDProvider.CredentialState {
        try await withCheckedThrowingContinuation { continuation in
            ASAuthorizationAppleIDProvider().getCredentialState(forUserID: userID) { state, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: state)
                }
            }
        }
    }

    // MARK: - Nonce Generation

    /// Generates a cryptographically secure random nonce string.
    static func generateNonce(length: Int = 32) -> String {
        precondition(length > 0, "Nonce length must be positive.")

        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var randomBytes = [UInt8](repeating: 0, count: length)
        let result = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)

        guard result == errSecSuccess else {
            let key = SymmetricKey(size: .bits256)
            return key.withUnsafeBytes { bytes in
                String(bytes.prefix(length).map { charset[Int($0) % charset.count] })
            }
        }

        return String(randomBytes.map { charset[Int($0) % charset.count] })
    }

    /// Returns the SHA-256 hash of the input string, hex-encoded.
    static func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - ASAuthorizationControllerDelegate

extension AppleSignInManager: ASAuthorizationControllerDelegate {

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        Task { @MainActor in
            handleAuthorization(authorization)
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        Task { @MainActor in
            handleAuthorizationError(error)
        }
    }

    // MARK: - Delegate Helpers

    private func handleAuthorization(_ authorization: ASAuthorization) {
        guard let appleCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            signInContinuation?.resume(
                throwing: AppleSignInError.unknown(
                    underlying: NSError(
                        domain: "AppleSignInManager",
                        code: -2,
                        userInfo: [
                            NSLocalizedDescriptionKey: String(localized: "Unexpected credential type received.")
                        ]
                    )
                )
            )
            signInContinuation = nil
            return
        }

        guard let identityTokenData = appleCredential.identityToken else {
            signInContinuation?.resume(throwing: AppleSignInError.missingIdentityToken)
            signInContinuation = nil
            return
        }

        guard let identityToken = String(data: identityTokenData, encoding: .utf8) else {
            signInContinuation?.resume(throwing: AppleSignInError.invalidIdentityToken)
            signInContinuation = nil
            return
        }

        let authorizationCode: String? = appleCredential.authorizationCode
            .flatMap { String(data: $0, encoding: .utf8) }

        let credential = AppleSignInCredential(
            userID: appleCredential.user,
            fullName: appleCredential.fullName,
            email: appleCredential.email,
            identityToken: identityToken,
            authorizationCode: authorizationCode,
            nonce: currentNonce ?? ""
        )

        signInContinuation?.resume(returning: credential)
        signInContinuation = nil
    }

    private func handleAuthorizationError(_ error: Error) {
        let mappedError: AppleSignInError

        if let asError = error as? ASAuthorizationError {
            switch asError.code {
            case .canceled:
                mappedError = .cancelled
            case .failed, .invalidResponse, .notHandled, .notInteractive:
                mappedError = .authorizationFailed(underlying: asError)
            case .unknown:
                mappedError = .unknown(underlying: asError)
            @unknown default:
                mappedError = .unknown(underlying: asError)
            }
        } else {
            mappedError = .unknown(underlying: error)
        }

        signInContinuation?.resume(throwing: mappedError)
        signInContinuation = nil
    }
}
