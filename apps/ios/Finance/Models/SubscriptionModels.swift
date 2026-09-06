// SPDX-License-Identifier: BUSL-1.1

// SubscriptionModels.swift
// Finance
//
// Display models for subscription offers plus the ratified commercial
// catalog. What a user is entitled to comes from the minimized entitlement
// projection (`entitlements-v1`) through ``EntitlementStore``; nothing in this
// file claims access.
//
// References: #338, #4403

import SwiftUI

// MARK: - Store offers

/// Billing periods presented by the paywall.
///
/// These values select a StoreKit offer only. They never determine access.
enum SubscriptionTier: String, CaseIterable, Sendable {
    case free
    case monthly
    case annual

    var displayName: String {
        switch self {
        case .free: String(localized: "Free")
        case .monthly: String(localized: "Monthly")
        case .annual: String(localized: "Annual")
        }
    }

    var description: String {
        switch self {
        case .free: String(localized: "Basic financial tracking")
        case .monthly: String(localized: "Billed monthly")
        case .annual: String(localized: "Billed annually — save 33%")
        }
    }

    /// StoreKit product identifier.
    var productId: String {
        switch self {
        case .free: ""
        case .monthly: "com.finance.premium.monthly"
        case .annual: "com.finance.premium.annual"
        }
    }

    var systemImage: String {
        switch self {
        case .free: "person"
        case .monthly: "star"
        case .annual: "crown"
        }
    }
}

// MARK: - Commercial catalog

/// A plan exactly as commercial catalog version 1 ratifies it.
///
/// See `docs/business/pricing/subscription-entitlement-catalog.md`. Catalog
/// version 1 allocates only bank-connection capacity and household scope to a
/// paid plan; privacy, encryption, accessibility, export, deletion, and access
/// to existing financial data are never paid entitlements, so no plan here may
/// be described as unlocking them.
struct CatalogPlan: Identifiable, Sendable, Equatable {
    let tier: EntitlementTier
    let monthlyPrice: String
    let yearlyPrice: String
    let bankConnections: String
    let notes: [String]

    var id: String { tier.rawValue }

    var displayName: String { EntitlementStatusMessages.planName(tier) }
}

enum PaywallCatalog {
    static let plans: [CatalogPlan] = [
        CatalogPlan(
            tier: .free,
            monthlyPrice: "$0",
            yearlyPrice: "$0",
            bankConnections: String(localized: "No bank connections"),
            notes: [
                String(
                    localized: """
                    Manual entry, import, export, full history, deletion, privacy and \
                    accessibility are always included
                    """
                ),
            ]
        ),
        CatalogPlan(
            tier: .plus,
            monthlyPrice: "$4.99/mo",
            yearlyPrice: "$39.99/yr",
            bankConnections: String(localized: "No bank connections"),
            notes: [String(localized: "Helps fund Finance without adding a bank connection")]
        ),
        CatalogPlan(
            tier: .premium,
            monthlyPrice: "$9.99/mo",
            yearlyPrice: "$79.99/yr",
            bankConnections: String(
                localized: """
                \(EntitlementCatalog.baseBankConnectionAllowance(.premium)) bank connections, \
                plus $0.99 per added connection each month
                """
            ),
            notes: [String(localized: "May sponsor one eligible household at a time")]
        ),
        CatalogPlan(
            tier: .family,
            monthlyPrice: "$14.99/mo",
            yearlyPrice: "$119.99/yr",
            bankConnections: String(
                localized: """
                \(EntitlementCatalog.baseBankConnectionAllowance(.family)) bank connections \
                shared by one household
                """
            ),
            notes: [String(localized: "Bound to the household that bought it")]
        ),
    ]
}

// MARK: - Confirmation phases

/// Shared logical confirmation states used by both native clients.
///
/// A phase describes a purchase or restore **operation**. It never describes
/// an entitlement: that comes only from the server projection.
enum PurchaseConfirmationPhase: String, Sendable, Equatable, CaseIterable {
    case idle
    case pending
    case confirmed
    case retry
    case error
    case cancelled
}

// MARK: - Subscription Product Info

/// Displayable product information for the paywall.
struct SubscriptionProductInfo: Identifiable, Sendable, Equatable {
    let id: String
    let tier: SubscriptionTier
    let displayPrice: String
    let pricePerMonth: String?
    let isBestValue: Bool

    init(
        id: String,
        tier: SubscriptionTier,
        displayPrice: String,
        pricePerMonth: String? = nil,
        isBestValue: Bool = false
    ) {
        self.id = id
        self.tier = tier
        self.displayPrice = displayPrice
        self.pricePerMonth = pricePerMonth
        self.isBestValue = isBestValue
    }
}
