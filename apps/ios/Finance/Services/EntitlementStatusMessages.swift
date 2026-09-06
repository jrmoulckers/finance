// SPDX-License-Identifier: BUSL-1.1

// EntitlementStatusMessages.swift
// Finance
//
// User-facing copy for the entitlement presentation states (#4403).
//
// Each state is announced explicitly so VoiceOver users hear why a plan is
// shown the way it is instead of inferring it from a visual treatment. None
// of this copy promises capability: it describes what Finance could confirm.
//
// References: #4403

import Foundation

enum EntitlementStatusMessages {

    /// Display name for a logical catalog plan.
    static func planName(_ tier: EntitlementTier) -> String {
        switch tier {
        case .free: String(localized: "Free")
        case .plus: String(localized: "Plus")
        case .premium: String(localized: "Premium")
        case .family: String(localized: "Family")
        case .unknown: String(localized: "Free")
        }
    }

    /// Short headline shown next to the current plan.
    static func headline(_ state: EntitlementDisplayState) -> String {
        let plan = planName(state.tier)
        switch state.status {
        case .pending:
            return String(localized: "Checking your plan")
        case .current:
            return plan
        case .stale:
            return String(localized: "\(plan) — refresh needed")
        case .offlineValid:
            return String(localized: "\(plan) — offline")
        case .offlineRefreshNeeded:
            return String(localized: "\(plan) — offline, refresh needed")
        case .unavailable:
            return String(localized: "Plan unavailable")
        }
    }

    /// Full explanation, used verbatim as the accessible description.
    static func detail(_ state: EntitlementDisplayState) -> String {
        let plan = planName(state.tier)
        switch state.status {
        case .pending:
            return String(
                localized: """
                Finance is checking your plan. Your data, entry, import, export, and history \
                are available as usual.
                """
            )
        case .current:
            return String(localized: "Finance confirmed the \(plan) plan.")
        case .stale:
            return String(
                localized: """
                Finance is showing your last confirmed \(plan) plan and needs to check again. \
                Purchases are confirmed by Finance when you make them.
                """
            )
        case .offlineValid:
            return String(
                localized: "You are offline. Finance is showing your last confirmed \(plan) plan."
            )
        case .offlineRefreshNeeded:
            return String(
                localized: """
                You are offline and your last confirmation has expired. Finance will check your \
                plan again when you reconnect.
                """
            )
        case .unavailable:
            return unavailableDetail(state.unavailableReason)
        }
    }

    private static func unavailableDetail(
        _ reason: EntitlementUnavailableReason?
    ) -> String {
        switch reason ?? .projectionUnavailable {
        case .unauthenticated:
            String(localized: "Sign in to see your plan. Your existing data stays available.")
        case .forbidden:
            String(localized: "This household's plan is not available to your account.")
        case .rateLimited:
            String(localized: "Finance is checking your plan too often. Try again in a moment.")
        case .offline:
            String(
                localized: """
                You are offline, so Finance cannot check your plan. Your data, entry, import, \
                export, and history are available as usual.
                """
            )
        default:
            String(
                localized: """
                Finance cannot confirm your plan right now. Your data, entry, import, export, \
                and history are available as usual.
                """
            )
        }
    }

    /// Announcement for a purchase or restore operation, if any is active.
    static func confirmationMessage(_ phase: PurchaseConfirmationPhase) -> String? {
        switch phase {
        case .idle:
            nil
        case .pending:
            String(
                localized: """
                Finance is confirming this purchase. Your plan changes only after Finance \
                confirms it.
                """
            )
        case .confirmed:
            String(localized: "Finance confirmed this purchase.")
        case .retry:
            String(
                localized: """
                Finance could not confirm this purchase yet and will retry. You have not been \
                charged twice.
                """
            )
        case .error:
            String(localized: "Finance could not confirm this purchase.")
        case .cancelled:
            String(localized: "The purchase was cancelled.")
        }
    }
}
