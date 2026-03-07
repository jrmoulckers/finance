// UniversalLinkHandler.swift
// Finance
//
// Handles Universal Links for OAuth callbacks and household invitations.
// Designed for integration with SwiftUI's `.onOpenURL` modifier.
// Refs #20, #24

import Foundation

// MARK: - DeepLink

/// Represents a parsed Universal Link / deep link handled by the Finance app.
enum DeepLink: Sendable, Equatable {
    /// OAuth redirect callback — received after external identity provider
    /// (Apple, Google, etc.) completes authorization.
    case authCallback(url: URL)

    /// Household invitation — the user tapped a link to join a household.
    case householdInvite(code: String)

    /// An unrecognized link that doesn't match any known route.
    case unknown(url: URL)
}

// MARK: - UniversalLinkHandler

/// Parses incoming Universal Links and maps them to ``DeepLink`` values.
///
/// ## Supported Routes
/// | Path Pattern           | Maps To                          |
/// |------------------------|----------------------------------|
/// | `/auth/callback`       | ``DeepLink/authCallback(url:)``  |
/// | `/invite/{code}`       | ``DeepLink/householdInvite(code:)``|
@Observable
@MainActor
final class UniversalLinkHandler {

    // MARK: - Constants

    /// The expected host for Finance Universal Links.
    static let expectedHost = "finance.app"

    /// Path prefix for OAuth callbacks.
    private static let authCallbackPath = "/auth/callback"

    /// Path prefix for household invitations.
    private static let invitePathPrefix = "/invite/"

    // MARK: - State

    /// The most recently parsed deep link, if any.
    private(set) var currentDeepLink: DeepLink?

    /// Whether the handler is currently processing an auth callback.
    private(set) var isProcessingAuthCallback: Bool = false

    /// Whether a household invite is pending user action.
    private(set) var hasPendingInvite: Bool = false

    /// The pending household invitation code, if any.
    private(set) var pendingInviteCode: String?

    // MARK: - Public API

    /// Parses and handles an incoming Universal Link URL.
    ///
    /// - Parameter url: The incoming URL to parse.
    /// - Returns: The parsed ``DeepLink`` for further handling.
    @discardableResult
    func handle(_ url: URL) -> DeepLink {
        let deepLink = parse(url)
        currentDeepLink = deepLink

        switch deepLink {
        case .authCallback:
            isProcessingAuthCallback = true
            hasPendingInvite = false
            pendingInviteCode = nil

        case .householdInvite(let code):
            isProcessingAuthCallback = false
            hasPendingInvite = true
            pendingInviteCode = code

        case .unknown:
            isProcessingAuthCallback = false
            hasPendingInvite = false
            pendingInviteCode = nil
        }

        return deepLink
    }

    /// Marks the current auth callback as fully processed.
    func completeAuthCallback() {
        isProcessingAuthCallback = false
        if case .authCallback = currentDeepLink {
            currentDeepLink = nil
        }
    }

    /// Marks the current household invite as handled (accepted or dismissed).
    func completeInvite() {
        hasPendingInvite = false
        pendingInviteCode = nil
        if case .householdInvite = currentDeepLink {
            currentDeepLink = nil
        }
    }

    /// Clears all pending state.
    func reset() {
        currentDeepLink = nil
        isProcessingAuthCallback = false
        hasPendingInvite = false
        pendingInviteCode = nil
    }

    // MARK: - Parsing

    /// Parses a URL into a ``DeepLink``.
    ///
    /// Supports both Universal Links and custom scheme URLs.
    ///
    /// - Parameter url: The URL to parse.
    /// - Returns: The corresponding ``DeepLink`` case.
    func parse(_ url: URL) -> DeepLink {
        let path: String
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: true) {
            path = components.path
        } else {
            path = url.path
        }

        // Route: /auth/callback
        if path.hasPrefix(Self.authCallbackPath) {
            return .authCallback(url: url)
        }

        // Route: /invite/{code}
        if path.hasPrefix(Self.invitePathPrefix) {
            let code = String(path.dropFirst(Self.invitePathPrefix.count))
            let trimmedCode = code.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

            if !trimmedCode.isEmpty {
                return .householdInvite(code: trimmedCode)
            }
        }

        return .unknown(url: url)
    }
}
