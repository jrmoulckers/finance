// SPDX-License-Identifier: BUSL-1.1

// TripBudget.swift
// Finance
//
// A budget scoped to a named trip / country and date range, so a digital
// nomad can plan against *this place* — "Bangkok Jan–Mar", "Portugal summer"
// — instead of a single global category bucket (#2205).

import SwiftUI

/// A first-class trip/country budget with a local-currency limit, date range,
/// and archive state for when the trip ends.
struct TripBudget: Identifiable, Sendable, Equatable, Codable {
    let id: String

    /// User-facing trip name, e.g. "Bangkok Jan–Mar".
    var name: String

    /// Country or region the trip covers, e.g. "Thailand". Also used as the
    /// default transaction match tag when set.
    var country: String

    /// Currency the trip is budgeted in (local budgeting currency). Roll-ups
    /// into the home/display currency happen at the reporting layer (#2203).
    var currencyCode: String

    /// The trip's spending limit in minor units of ``currencyCode``.
    var limitMinorUnits: Int64

    /// Inclusive first day of the trip.
    var startDate: Date

    /// Inclusive last day of the trip.
    var endDate: Date

    /// Optional tag transactions must carry to count toward this trip. When
    /// empty, membership is by date range alone.
    var matchTag: String

    /// Whether the trip is archived (kept for history but hidden from active
    /// lists) once it ends.
    var isArchived: Bool

    init(
        id: String = UUID().uuidString,
        name: String,
        country: String,
        currencyCode: String,
        limitMinorUnits: Int64,
        startDate: Date,
        endDate: Date,
        matchTag: String = "",
        isArchived: Bool = false
    ) {
        self.id = id
        self.name = name
        self.country = country
        self.currencyCode = currencyCode
        self.limitMinorUnits = limitMinorUnits
        self.startDate = startDate
        self.endDate = endDate
        self.matchTag = matchTag
        self.isArchived = isArchived
    }

    /// Symbol for the trip's budgeting currency.
    var currencySymbol: String { CurrencyPreferences.symbol(for: currencyCode) }

    /// Whether `date` falls on or after the trip start and on or before the
    /// trip end (day-granular, comparing calendar days).
    func containsDay(_ day: Date, calendar: Calendar = .current) -> Bool {
        let start = calendar.startOfDay(for: startDate)
        let end = calendar.startOfDay(for: endDate)
        let target = calendar.startOfDay(for: day)
        return target >= start && target <= end
    }

    /// Whether the trip has already ended relative to `now`.
    func hasEnded(now: Date = .now, calendar: Calendar = .current) -> Bool {
        calendar.startOfDay(for: endDate) < calendar.startOfDay(for: now)
    }
}
