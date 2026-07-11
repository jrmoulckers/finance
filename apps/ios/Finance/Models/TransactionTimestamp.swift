// SPDX-License-Identifier: BUSL-1.1

// TransactionTimestamp.swift
// Finance
//
// Value type and formatting helpers for preserving *where and when* a
// transaction happened. Cross-border finance is multi-timezone, not just
// multi-currency: a 11:50 PM purchase in Bangkok must not silently roll into
// the next calendar day when reviewed later in Lisbon (#2206).

import Foundation

/// Captures the local instant and timezone of a purchase so daily spend,
/// trip reports, and audit trails stay stable after the device timezone
/// changes.
struct TransactionTimestamp: Equatable, Sendable {
    /// The absolute instant the purchase occurred.
    let instant: Date

    /// The timezone in effect at the point of purchase.
    let timeZone: TimeZone

    init(instant: Date, timeZone: TimeZone = .current) {
        self.instant = instant
        self.timeZone = timeZone
    }

    /// Builds a timestamp from a stored instant and an optional timezone
    /// identifier, falling back to the current timezone for legacy/manual
    /// entries that never recorded one.
    init(instant: Date, timeZoneIdentifier: String?) {
        self.instant = instant
        self.timeZone = TransactionTimestamp.resolveTimeZone(timeZoneIdentifier)
    }

    /// Resolves a timezone identifier to a `TimeZone`, gracefully degrading to
    /// the device's current zone when the identifier is missing or invalid.
    static func resolveTimeZone(_ identifier: String?) -> TimeZone {
        guard let identifier, let zone = TimeZone(identifier: identifier) else {
            return .current
        }
        return zone
    }

    /// The calendar day of the purchase *in its original timezone*.
    ///
    /// This is the anchor for day-based reporting: it does not move when the
    /// reviewer later crosses into another timezone.
    var localDay: Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.startOfDay(for: instant)
    }

    /// Local wall-clock time string at the point of purchase, e.g. "11:50 PM".
    var localTimeDescription: String {
        let formatter = DateFormatter()
        formatter.timeZone = timeZone
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter.string(from: instant)
    }

    /// Local date + time with an abbreviated zone, e.g. "Jan 5, 2026 at
    /// 11:50 PM GMT+7" — used on receipts, disputes, and reconciliation.
    var localDateTimeDescription: String {
        let formatter = DateFormatter()
        formatter.timeZone = timeZone
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        let base = formatter.string(from: instant)
        return "\(base) \(zoneAbbreviation)"
    }

    /// A short zone label, preferring the localized abbreviation (e.g. "ICT",
    /// "GMT+7") for compact display.
    var zoneAbbreviation: String {
        timeZone.abbreviation(for: instant) ?? timeZone.identifier
    }

    /// Whether the purchase timezone differs from the device's current
    /// timezone — the signal that a border was likely crossed since capture.
    func differsFromDeviceZone(now: Date = .now, deviceZone: TimeZone = .current) -> Bool {
        timeZone.secondsFromGMT(for: instant) != deviceZone.secondsFromGMT(for: now)
    }
}
