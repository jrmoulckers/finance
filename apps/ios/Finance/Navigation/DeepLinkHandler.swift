// SPDX-License-Identifier: BUSL-1.1

// DeepLinkHandler.swift
// Finance
//
// Centralized deep-link router that handles Universal Links and custom-scheme
// URLs. Parses incoming URLs into strongly-typed ``AppDeepLink`` values and
// drives programmatic navigation across the tab bar.
// Refs #470

import Foundation
import os

// MARK: - AppDeepLink

/// Represents a parsed deep link handled by the Finance app.
///
/// Extends the routing table beyond ``DeepLink`` (auth/invite) to include
/// entity-level navigation such as individual accounts and transactions.
///
/// ## Supported Routes
/// | Path Pattern             | Maps To                                  |
/// |--------------------------|------------------------------------------|
/// | `/auth/callback`         | ``AppDeepLink/authCallback(url:)``       |
/// | `/invite/{code}`         | ``AppDeepLink/invite(code:)``            |
/// | `/account/{id}`          | ``AppDeepLink/account(id:)``             |
/// | `/transaction/{id}`      | ``AppDeepLink/transaction(id:)``         |
enum AppDeepLink: Sendable, Equatable {
    /// OAuth redirect callback — received after an external identity provider
    /// (Apple, Google, etc.) completes authorization.
    case authCallback(url: URL)

    /// Household invitation — the user tapped a link to join a household.
    case invite(code: String)

    /// Navigate to a specific account detail screen.
    case account(id: String)

    /// Navigate to a specific transaction detail screen.
    case transaction(id: String)

    /// App Clip expense entry. Refs #648
    case clipExpense(amount: Int64?, category: String?)

    /// An unrecognized link that doesn't match any known route.
    case unknown(url: URL)
}

// MARK: - DeepLinkHandler

/// Parses incoming Universal Links and custom-scheme URLs, then drives
/// programmatic navigation by updating ``selectedTab`` and entity-level
/// state that views observe.
///
/// Wire this into the SwiftUI scene via `.onOpenURL`:
/// ```swift
/// .onOpenURL { url in
///     deepLinkHandler.handle(url)
/// }
/// ```
@Observable
final class DeepLinkHandler {

    // MARK: - Constants

    /// The expected host for Finance Universal Links.
    private static let expectedHosts: Set<String> = [
        "finance.app",
        "www.finance.app",
    ]

    /// Custom URL scheme for the Finance app.
    private static let customScheme = "finance"

    // MARK: - Path Constants

    private static let authCallbackPath = "/auth/callback"
    private static let invitePrefix = "/invite/"
    private static let accountPrefix = "/account/"
    private static let transactionPrefix = "/transaction/"
    private static let clipExpensePath = "/clip/expense"

    // MARK: - Logger

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DeepLinkHandler"
    )

    // MARK: - Observable State

    /// The most recently parsed deep link, if any.
    private(set) var currentDeepLink: AppDeepLink?

    /// The tab that should be selected in response to the deep link.
    /// Views bind to this to switch tabs programmatically.
    var selectedTab: MainTabView.Tab?

    /// The account ID to navigate to after switching to the Accounts tab.
    private(set) var pendingAccountId: String?

    /// The transaction ID to navigate to after switching to the Transactions tab.
    private(set) var pendingTransactionId: String?

    /// Whether an auth callback is currently being processed.
    private(set) var isProcessingAuthCallback = false

    /// The pending household invitation code, if any.
    private(set) var pendingInviteCode: String?

    private(set) var hasPendingClipExpense = false
    private(set) var pendingClipAmount: Int64?
    private(set) var pendingClipCategory: String?

    // MARK: - Init

    init() {}

    // MARK: - Public API

    /// Parses and handles an incoming URL, updating navigation state.
    ///
    /// - Parameter url: The incoming Universal Link or custom-scheme URL.
    /// - Returns: The parsed ``AppDeepLink`` for further handling.
    @discardableResult
    func handle(_ url: URL) -> AppDeepLink {
        let deepLink = parse(url)
        currentDeepLink = deepLink

        Self.logger.info(
            "Handling deep link: \(url.absoluteString, privacy: .public)"
        )

        switch deepLink {
        case .authCallback:
            isProcessingAuthCallback = true
            clearEntityState()
            Self.logger.debug("Routing to auth callback")

        case .invite(let code):
            isProcessingAuthCallback = false
            pendingInviteCode = code
            clearEntityState()
            Self.logger.debug(
                "Routing to invite with code: \(code, privacy: .private)"
            )

        case .account(let id):
            clearAuthInviteState()
            pendingAccountId = id
            pendingTransactionId = nil
            hasPendingClipExpense = false
            pendingClipAmount = nil
            pendingClipCategory = nil
            selectedTab = .accounts
            Self.logger.debug(
                "Routing to account: \(id, privacy: .private)"
            )

        case .transaction(let id):
            clearAuthInviteState()
            pendingTransactionId = id
            pendingAccountId = nil
            hasPendingClipExpense = false
            pendingClipAmount = nil
            pendingClipCategory = nil
            selectedTab = .transactions
            Self.logger.debug(
                "Routing to transaction: \(id, privacy: .private)"
            )

        case .clipExpense(let amount, let category):
            clearAuthInviteState()
            clearEntityState()
            hasPendingClipExpense = true
            pendingClipAmount = amount
            pendingClipCategory = category
            selectedTab = .transactions
            Self.logger.debug("Routing to clip expense entry")

        case .unknown:
            clearAllState()
            Self.logger.warning(
                "Unknown deep link: \(url.absoluteString, privacy: .public)"
            )
        }

        return deepLink
    }

    /// Marks the auth callback as fully processed.
    func completeAuthCallback() {
        isProcessingAuthCallback = false
        if case .authCallback = currentDeepLink {
            currentDeepLink = nil
        }
    }

    /// Marks the household invite as handled (accepted or dismissed).
    func completeInvite() {
        pendingInviteCode = nil
        if case .invite = currentDeepLink {
            currentDeepLink = nil
        }
    }

    /// Clears the pending account navigation after the view has consumed it.
    func consumeAccountNavigation() {
        pendingAccountId = nil
        if case .account = currentDeepLink {
            currentDeepLink = nil
        }
    }

    /// Clears the pending transaction navigation after the view has consumed it.
    func consumeTransactionNavigation() {
        pendingTransactionId = nil
        if case .transaction = currentDeepLink {
            currentDeepLink = nil
        }
    }

    /// Clears the pending clip expense.
    func consumeClipExpense() {
        hasPendingClipExpense = false
        pendingClipAmount = nil
        pendingClipCategory = nil
        if case .clipExpense = currentDeepLink { currentDeepLink = nil }
    }

    /// Resets all pending state.
    func reset() {
        clearAllState()
        currentDeepLink = nil
    }

    // MARK: - Parsing

    /// Parses a URL into an ``AppDeepLink``.
    ///
    /// Supports both Universal Links (`https://finance.app/...`) and
    /// custom-scheme URLs (`finance://...`).
    ///
    /// - Parameter url: The URL to parse.
    /// - Returns: The corresponding ``AppDeepLink`` case.
    func parse(_ url: URL) -> AppDeepLink {
        let path: String
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: true) {
            path = components.path
        } else {
            path = url.path
        }

        // For custom scheme URLs, the host is part of the path
        let effectivePath: String
        if url.scheme == Self.customScheme {
            // finance://account/123 → host="account", path="/123"
            // Reconstruct as /account/123
            if let host = url.host {
                effectivePath = "/\(host)\(path)"
            } else {
                effectivePath = path
            }
        } else {
            effectivePath = path
        }

        // Route: /auth/callback
        if effectivePath.hasPrefix(Self.authCallbackPath) {
            return .authCallback(url: url)
        }

        // Route: /invite/{code}
        if effectivePath.hasPrefix(Self.invitePrefix) {
            let code = extractPathSegment(
                from: effectivePath,
                after: Self.invitePrefix
            )
            if let code {
                return .invite(code: code)
            }
        }

        // Route: /account/{id}
        if effectivePath.hasPrefix(Self.accountPrefix) {
            let id = extractPathSegment(
                from: effectivePath,
                after: Self.accountPrefix
            )
            if let id {
                return .account(id: id)
            }
        }

        // Route: /transaction/{id}
        if effectivePath.hasPrefix(Self.transactionPrefix) {
            let id = extractPathSegment(
                from: effectivePath,
                after: Self.transactionPrefix
            )
            if let id {
                return .transaction(id: id)
            }
        }

        // Route: /clip/expense (#648)
        if effectivePath.hasPrefix(Self.clipExpensePath) {
            let queryItems = URLComponents(url: url, resolvingAgainstBaseURL: true)?.queryItems
            var amountMinorUnits: Int64?
            if let amountString = queryItems?.first(where: { $0.name == "amount" })?.value, let amountDecimal = Decimal(string: amountString) {
                amountMinorUnits = NSDecimalNumber(decimal: amountDecimal * 100).int64Value
            }
            let category = queryItems?.first(where: { $0.name == "category" })?.value
            return .clipExpense(amount: amountMinorUnits, category: category?.isEmpty == true ? nil : category)
        }

        return .unknown(url: url)
    }

    // MARK: - Private Helpers

    /// Extracts and validates a non-empty path segment after a prefix.
    private func extractPathSegment(from path: String, after prefix: String) -> String? {
        let raw = String(path.dropFirst(prefix.count))
        let trimmed = raw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return trimmed.isEmpty ? nil : trimmed
    }

    private func clearEntityState() {
        pendingAccountId = nil
        pendingTransactionId = nil
        hasPendingClipExpense = false
        pendingClipAmount = nil
        pendingClipCategory = nil
    }

    private func clearAuthInviteState() {
        isProcessingAuthCallback = false
        pendingInviteCode = nil
    }

    private func clearAllState() {
        isProcessingAuthCallback = false
        pendingInviteCode = nil
        pendingAccountId = nil
        pendingTransactionId = nil
        hasPendingClipExpense = false
        pendingClipAmount = nil
        pendingClipCategory = nil
    }
}
