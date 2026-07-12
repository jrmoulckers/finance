// SPDX-License-Identifier: BUSL-1.1
// SmartNotificationTiming.swift - FinanceShared - Refs #2391
//
// A pure, on-device notification-timing policy. Finance reminders sent at fixed
// times are easy to ignore; this learns — from local behavioural signals only —
// the hours a user is most likely to act, and recommends delivery times that
// respect quiet hours and Focus. No notification-interaction history ever leaves
// the device: this type takes already-aggregated, content-free counts and never
// touches finance data. Fully unit-testable, no UI/KMP dependencies.

import Foundation

/// A content-free, per-hour aggregate of how a user has responded to reminders.
///
/// We deliberately store only counts keyed by hour-of-day — never the reminder
/// content, the amount, the payee, or a timestamped history. This is the entire
/// feature set the timing model is allowed to see.
public struct HourEngagement: Sendable, Hashable, Codable {
    /// Hour of day, 0...23.
    public let hour: Int
    /// How many reminders were delivered in this hour bucket.
    public let deliveredCount: Int
    /// How many of those were acted upon (opened / tapped through).
    public let actedCount: Int

    public init(hour: Int, deliveredCount: Int, actedCount: Int) {
        self.hour = hour
        self.deliveredCount = deliveredCount
        self.actedCount = actedCount
    }

    /// Action rate for the hour (0...1). Zero when nothing was delivered.
    public var actionRate: Double {
        guard deliveredCount > 0 else { return 0 }
        return Double(actedCount) / Double(deliveredCount)
    }
}

/// A quiet-hours window during which reminders should never be delivered.
///
/// Windows may wrap past midnight (e.g. 22:00–07:00).
public struct QuietHours: Sendable, Hashable, Codable {
    public let startHour: Int
    public let endHour: Int

    public init(startHour: Int, endHour: Int) {
        self.startHour = startHour
        self.endHour = endHour
    }

    /// A sensible default overnight quiet window (10pm–7am).
    public static let overnightDefault = QuietHours(startHour: 22, endHour: 7)

    /// Whether the given hour is inside the quiet window.
    public func contains(_ hour: Int) -> Bool {
        let h = ((hour % 24) + 24) % 24
        if startHour == endHour { return false }
        if startHour < endHour {
            return h >= startHour && h < endHour
        }
        // Wraps past midnight.
        return h >= startHour || h < endHour
    }
}

/// Aggregate, privacy-preserving health of smart-timing delivery. Contains no
/// finance content — only counts — so it is safe to surface or log in aggregate.
public struct SmartTimingHealth: Sendable, Hashable, Codable {
    public let totalDelivered: Int
    public let totalActed: Int

    public init(totalDelivered: Int, totalActed: Int) {
        self.totalDelivered = totalDelivered
        self.totalActed = totalActed
    }

    /// Overall open/act rate (0...1).
    public var openRate: Double {
        guard totalDelivered > 0 else { return 0 }
        return Double(totalActed) / Double(totalDelivered)
    }
}

/// Pure, deterministic smart-timing policy.
public enum SmartNotificationTiming {

    /// Minimum deliveries required before the model trusts learned data over the
    /// fallback time. Below this we schedule at the fallback hour.
    public static let minSignalsToPersonalize = 5

    /// Recommends a delivery hour (0...23) for the next reminder.
    ///
    /// The chosen hour maximises historical action rate, breaking ties toward
    /// more total engagement, and is nudged out of any quiet-hours window. When
    /// there is not enough on-device data yet, the caller's `fallbackHour` is
    /// used (also quiet-hours-adjusted). When smart timing is disabled the
    /// fallback is returned unchanged so behaviour is fully predictable.
    ///
    /// - Parameters:
    ///   - engagement: Per-hour, content-free engagement aggregates.
    ///   - quietHours: The window to avoid, if any.
    ///   - fallbackHour: The user's configured fixed time (default 9am).
    ///   - smartTimingEnabled: Master switch; `false` returns `fallbackHour`.
    public static func recommendedHour(
        engagement: [HourEngagement],
        quietHours: QuietHours? = QuietHours.overnightDefault,
        fallbackHour: Int = 9,
        smartTimingEnabled: Bool = true
    ) -> Int {
        guard smartTimingEnabled else {
            return adjustOutOfQuietHours(fallbackHour, quietHours: quietHours)
        }

        let totalDelivered = engagement.reduce(0) { $0 + $1.deliveredCount }
        guard totalDelivered >= minSignalsToPersonalize else {
            return adjustOutOfQuietHours(fallbackHour, quietHours: quietHours)
        }

        // Consider only hours outside quiet hours with at least one delivery.
        let candidates = engagement.filter { entry in
            entry.deliveredCount > 0 && !(quietHours?.contains(entry.hour) ?? false)
        }
        guard let best = candidates.max(by: { lhs, rhs in
            if lhs.actionRate == rhs.actionRate {
                return lhs.actedCount < rhs.actedCount
            }
            return lhs.actionRate < rhs.actionRate
        }) else {
            return adjustOutOfQuietHours(fallbackHour, quietHours: quietHours)
        }

        // Only personalize if the best hour actually shows engagement.
        guard best.actedCount > 0 else {
            return adjustOutOfQuietHours(fallbackHour, quietHours: quietHours)
        }
        return best.hour
    }

    /// Whether the model has enough data to personalize rather than fall back.
    public static func canPersonalize(engagement: [HourEngagement]) -> Bool {
        engagement.reduce(0) { $0 + $1.deliveredCount } >= minSignalsToPersonalize
    }

    /// Aggregates content-free health metrics across all hour buckets.
    public static func health(engagement: [HourEngagement]) -> SmartTimingHealth {
        SmartTimingHealth(
            totalDelivered: engagement.reduce(0) { $0 + $1.deliveredCount },
            totalActed: engagement.reduce(0) { $0 + $1.actedCount }
        )
    }

    /// Nudges an hour to the first non-quiet hour at/after it (wrapping a day),
    /// so a fallback time never lands inside the quiet window.
    public static func adjustOutOfQuietHours(_ hour: Int, quietHours: QuietHours?) -> Int {
        guard let quietHours else { return ((hour % 24) + 24) % 24 }
        var candidate = ((hour % 24) + 24) % 24
        var guardCount = 0
        while quietHours.contains(candidate) && guardCount < 24 {
            candidate = (candidate + 1) % 24
            guardCount += 1
        }
        return candidate
    }
}
