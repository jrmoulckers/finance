// SPDX-License-Identifier: BUSL-1.1

// SubscriptionModels.swift
// Finance
//
// Data models for the premium subscription system using StoreKit 2.
// Defines subscription tiers, entitlement states, and premium features.
//
// References: #338

import SwiftUI

// MARK: - Subscription Tier

/// Available subscription plans.
enum SubscriptionTier: String, CaseIterable, Sendable {
    case free
    case monthly
    case annual

    var displayName: String {
        switch self {
        case .free: String(localized: "Free")
        case .monthly: String(localized: "Premium Monthly")
        case .annual: String(localized: "Premium Annual")
        }
    }

    var description: String {
        switch self {
        case .free: String(localized: "Basic financial tracking")
        case .monthly: String(localized: "Full access, billed monthly")
        case .annual: String(localized: "Full access, billed annually — save 33%")
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

// MARK: - Entitlement State

/// Current subscription entitlement status.
enum EntitlementState: Sendable, Equatable {
    case free
    case premium(tier: SubscriptionTier, expiresAt: Date?)
    case expired
    case gracePeriod(expiresAt: Date)

    var isPremium: Bool {
        switch self {
        case .premium, .gracePeriod: true
        case .free, .expired: false
        }
    }

    var displayName: String {
        switch self {
        case .free: String(localized: "Free Plan")
        case .premium(let tier, _): tier.displayName
        case .expired: String(localized: "Expired")
        case .gracePeriod: String(localized: "Grace Period")
        }
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
