// SPDX-License-Identifier: BUSL-1.1

// SubscriptionModels.swift
// Finance
//
// Display models for subscription offers plus the server-authoritative
// entitlement projection.
//
// References: #338

import SwiftUI

// MARK: - Subscription Tier

/// Billing periods presented by the existing iOS paywall.
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

// MARK: - Premium Feature

/// Features gated behind a premium subscription.
enum PremiumFeature: String, CaseIterable, Sendable {
    case unlimitedBudgets
    case advancedInsights
    case customCategories
    case dataExport
    case prioritySupport
    case familySharing

    var displayName: String {
        switch self {
        case .unlimitedBudgets: String(localized: "Unlimited Budgets")
        case .advancedInsights: String(localized: "Advanced Insights")
        case .customCategories: String(localized: "Custom Categories")
        case .dataExport: String(localized: "Data Export")
        case .prioritySupport: String(localized: "Priority Support")
        case .familySharing: String(localized: "Family Sharing")
        }
    }

    var description: String {
        switch self {
        case .unlimitedBudgets: String(localized: "Create unlimited budget categories to track every spending area")
        case .advancedInsights: String(localized: "Spending predictions, anomaly detection, and trend analysis")
        case .customCategories: String(localized: "Create and customize unlimited transaction categories")
        case .dataExport: String(localized: "Export your data as CSV, PDF, or JSON for tax and accounting")
        case .prioritySupport: String(localized: "Get faster responses from our support team")
        case .familySharing: String(localized: "Share your subscription with up to 5 family members")
        }
    }

    var systemImage: String {
        switch self {
        case .unlimitedBudgets: "chart.pie.fill"
        case .advancedInsights: "chart.line.uptrend.xyaxis"
        case .customCategories: "tag.fill"
        case .dataExport: "square.and.arrow.up"
        case .prioritySupport: "headphones"
        case .familySharing: "person.3.fill"
        }
    }

    /// Whether this feature is available in the free tier.
    var isFreeTier: Bool {
        switch self {
        case .unlimitedBudgets, .advancedInsights, .dataExport,
             .prioritySupport, .familySharing:
            false
        case .customCategories:
            false
        }
    }
}

// MARK: - Entitlement Projection

/// Finance tiers returned by the server-authoritative entitlement projection.
enum FinanceEntitlementTier: String, Sendable, Equatable {
    case free
    case plus
    case premium
    case family

    var displayName: String {
        switch self {
        case .free: String(localized: "Free Plan")
        case .plus: String(localized: "Plus")
        case .premium: String(localized: "Premium")
        case .family: String(localized: "Family")
        }
    }
}

/// Freshness is decided by Finance, never by the device clock.
enum FinanceProjectionStatus: String, Sendable, Equatable {
    case current
    case stale
    case expired
}

/// Minimized projection returned by Finance after authenticated confirmation.
struct FinanceEntitlementProjection: Sendable, Equatable {
    let tier: FinanceEntitlementTier
    let status: FinanceProjectionStatus
    let validUntil: Date?
    let isHouseholdBound: Bool

    static let free = FinanceEntitlementProjection(
        tier: .free,
        status: .current,
        validUntil: nil,
        isHouseholdBound: false
    )

    /// Stale and expired projections cannot authorize new cost-incurring work.
    var authorizesNewCostIncurringActions: Bool {
        guard status == .current, tier != .free else { return false }
        return tier != .family || isHouseholdBound
    }
}

/// Current access state, derived only from a Finance projection.
struct EntitlementState: Sendable, Equatable {
    let projection: FinanceEntitlementProjection

    static let free = EntitlementState(projection: .free)

    var isPremium: Bool {
        projection.authorizesNewCostIncurringActions
    }

    var displayName: String {
        switch projection.status {
        case .current:
            projection.tier.displayName
        case .stale:
            String(localized: "Confirmation Needed")
        case .expired:
            String(localized: "Expired")
        }
    }
}

/// Shared logical confirmation states used by both native clients.
enum PurchaseConfirmationPhase: String, Sendable, Equatable {
    case idle
    case pending
    case confirmed
    case retry
    case error
    case cancelled
}

struct PurchaseConfirmationState: Sendable, Equatable {
    let phase: PurchaseConfirmationPhase
    let projection: FinanceEntitlementProjection

    static let idle = PurchaseConfirmationState(phase: .idle, projection: .free)

    var authorizesNewCostIncurringActions: Bool {
        phase == .confirmed && projection.authorizesNewCostIncurringActions
    }
}

// MARK: - Subscription Product Info

/// Displayable product information for the paywall.
struct SubscriptionProductInfo: Identifiable, Sendable {
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
