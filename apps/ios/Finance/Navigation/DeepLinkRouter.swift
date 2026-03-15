// SPDX-License-Identifier: BUSL-1.1

// DeepLinkRouter.swift
// Finance
//
// Routes deep link URLs to navigation destinations within the app.
// Coordinates tab selection and NavigationStack paths for programmatic
// navigation when the app is opened via a Universal Link or custom URL scheme.
// Works alongside UniversalLinkHandler for auth/invite parsing.
// Refs #470

import os
import SwiftUI

// MARK: - Route Types

/// Navigation route for deep linking to an account detail screen by ID.
///
/// Pushed onto ``DeepLinkRouter/accountsPath`` when the app opens a
/// `/account/{id}` Universal Link.
struct AccountRoute: Hashable, Sendable {
    let id: String
}

/// Navigation route for deep linking to a transaction detail screen by ID.
///
/// Pushed onto ``DeepLinkRouter/transactionsPath`` when the app opens a
/// `/transaction/{id}` Universal Link.
struct TransactionRoute: Hashable, Sendable {
    let id: String
}

// MARK: - DeepLinkRouter

/// Routes deep link URLs to navigation destinations within the app.
///
/// Works alongside ``UniversalLinkHandler`` — the handler parses raw URLs
/// into ``DeepLink`` values for auth/invite flows, while the router also
/// handles navigation-specific routes (`/account/{id}`, `/transaction/{id}`)
/// by switching tabs and pushing onto ``NavigationPath`` instances.
///
/// ## Supported Routes
/// | Path Pattern             | Action                                      |
/// |--------------------------|---------------------------------------------|
/// | `/auth/callback`         | Delegates to ``UniversalLinkHandler``       |
/// | `/invite/{code}`         | Delegates to ``UniversalLinkHandler``       |
/// | `/account/{id}`          | Switches to Accounts tab, pushes detail     |
/// | `/transaction/{id}`      | Switches to Transactions tab, pushes detail |
/// | (anything else)          | Shows an unknown-link alert                 |
@Observable
@MainActor
final class DeepLinkRouter {

    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DeepLinkRouter"
    )

    /// Handler that parses auth and invite URLs into ``DeepLink`` values.
    ///
    /// Exposed as `internal` so other parts of the app (e.g. auth flow)
    /// can observe ``UniversalLinkHandler/isProcessingAuthCallback`` and
    /// ``UniversalLinkHandler/hasPendingInvite``.
    let linkHandler = UniversalLinkHandler()

    // MARK: - Navigation State

    /// The currently selected tab.
    var selectedTab: AppTab = .dashboard

    /// Navigation path for programmatic navigation within the Accounts tab.
    var accountsPath = NavigationPath()

    /// Navigation path for programmatic navigation within the Transactions tab.
    var transactionsPath = NavigationPath()

    // MARK: - Alert State

    /// Whether to show an alert for an unrecognized deep link URL.
    var showUnknownLinkAlert = false

    /// The URL string that triggered the unknown-link alert.
    var unknownLinkURL: String?

    // MARK: - Tab Definition

    /// Top-level tabs in the Finance app.
    ///
    /// Raw values match route path prefixes for consistency.
    /// Display properties (``title``, ``systemImage``) are used by
    /// ``MainTabView`` to render tab items.
    enum AppTab: String, CaseIterable, Sendable {
        case dashboard, accounts, transactions, budgets, goals

        /// Localized display name for the tab item label.
        var title: String {
            switch self {
            case .dashboard: String(localized: "Dashboard")
            case .accounts: String(localized: "Accounts")
            case .transactions: String(localized: "Transactions")
            case .budgets: String(localized: "Budgets")
            case .goals: String(localized: "Goals")
            }
        }

        /// SF Symbol name for the tab item icon.
        var systemImage: String {
            switch self {
            case .dashboard: "house"
            case .accounts: "building.columns"
            case .transactions: "arrow.left.arrow.right"
            case .budgets: "chart.pie"
            case .goals: "target"
            }
        }
    }

    // MARK: - Deep Link Handling

    /// Handles an incoming deep link URL by parsing the path and navigating
    /// to the appropriate destination.
    ///
    /// Auth and invite routes are delegated to ``UniversalLinkHandler`` so
    /// their state is available to the rest of the app. Navigation routes
    /// (`/account`, `/transaction`) update tab selection and push onto the
    /// corresponding ``NavigationPath``.
    ///
    /// - Parameter url: The incoming URL (Universal Link or custom scheme).
    func handle(_ url: URL) {
        logger.info("Handling deep link: \(url.absoluteString, privacy: .public)")

        let pathComponents = url.pathComponents.filter { $0 != "/" }

        switch pathComponents.first {
        case "auth":
            handleAuthCallback(url: url)
        case "invite":
            handleInvite(url: url)
        case "account":
            handleAccountLink(id: pathComponents.dropFirst().first)
        case "transaction":
            handleTransactionLink(id: pathComponents.dropFirst().first)
        default:
            handleUnknown(url: url)
        }
    }

    // MARK: - Route Handlers

    /// Delegates an OAuth callback URL to ``UniversalLinkHandler`` for
    /// processing by the auth flow.
    private func handleAuthCallback(url: URL) {
        logger.info("Processing auth callback")
        linkHandler.handle(url)
    }

    /// Delegates a household invite URL to ``UniversalLinkHandler`` so
    /// the invite UI can react to ``UniversalLinkHandler/hasPendingInvite``.
    private func handleInvite(url: URL) {
        let deepLink = linkHandler.handle(url)
        if case .householdInvite(let code) = deepLink {
            logger.info("Processing household invite: \(code, privacy: .private)")
        } else {
            logger.warning("Invite deep link could not be parsed")
        }
    }

    /// Navigates to the Accounts tab and pushes the account detail screen
    /// for the given identifier.
    ///
    /// Resets the existing accounts navigation path before pushing to
    /// ensure the user lands directly on the detail screen.
    private func handleAccountLink(id: String?) {
        guard let id, !id.isEmpty else {
            logger.warning("Account deep link missing ID")
            return
        }
        logger.info("Navigating to account: \(id, privacy: .private)")
        accountsPath = NavigationPath()
        accountsPath.append(AccountRoute(id: id))
        selectedTab = .accounts
    }

    /// Navigates to the Transactions tab and pushes the transaction detail
    /// screen for the given identifier.
    ///
    /// Resets the existing transactions navigation path before pushing to
    /// ensure the user lands directly on the detail screen.
    private func handleTransactionLink(id: String?) {
        guard let id, !id.isEmpty else {
            logger.warning("Transaction deep link missing ID")
            return
        }
        logger.info("Navigating to transaction: \(id, privacy: .private)")
        transactionsPath = NavigationPath()
        transactionsPath.append(TransactionRoute(id: id))
        selectedTab = .transactions
    }

    /// Surfaces an alert for an unrecognized deep link URL.
    private func handleUnknown(url: URL) {
        logger.warning("Unknown deep link path: \(url.path, privacy: .public)")
        unknownLinkURL = url.absoluteString
        showUnknownLinkAlert = true
    }
}
