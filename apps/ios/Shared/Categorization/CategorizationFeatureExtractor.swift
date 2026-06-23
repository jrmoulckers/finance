// SPDX-License-Identifier: BUSL-1.1

// CategorizationFeatureExtractor.swift
// FinanceShared
//
// Converts a CategorizationInput into deterministic CategorizationFeatures.
// The calendar is injectable so unit tests can pin a fixed time zone and get
// reproducible day-of-week / hour features regardless of the host machine.
//
// References: #2382

import Foundation

/// Builds deterministic ``CategorizationFeatures`` from a ``CategorizationInput``.
public struct CategorizationFeatureExtractor: Sendable {

    /// Calendar used to derive day-of-week and hour features.
    private let calendar: Calendar

    /// Upper bounds (exclusive) in *major units* for each magnitude bucket.
    /// Index of the first bound the absolute amount is below becomes the bucket;
    /// amounts at or above the last bound fall into the final bucket.
    private static let bucketBoundsMajor: [Double] = [
        5, 20, 50, 100, 250, 500, 1_000,
    ]

    /// Creates an extractor.
    ///
    /// - Parameter calendar: Defaults to the current calendar. Tests should pass
    ///   a calendar with a fixed `timeZone` for reproducibility.
    public init(calendar: Calendar = .current) {
        self.calendar = calendar
    }

    /// A deterministic extractor pinned to UTC, for reproducible features.
    public static var utc: CategorizationFeatureExtractor {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        return CategorizationFeatureExtractor(calendar: calendar)
    }

    /// Extracts features for the given input.
    public func features(for input: CategorizationInput) -> CategorizationFeatures {
        let tokens = MerchantTokenizer.tokens(merchant: input.merchant, memo: input.memo)
        let signature = MerchantTokenizer.signature(for: tokens)
        let absolute = input.amountMinorUnits.magnitude
        let absoluteSigned = Int64(min(absolute, UInt64(Int64.max)))

        let components = calendar.dateComponents([.weekday, .hour], from: input.date)
        let weekday = components.weekday ?? 1
        let hour = components.hour ?? 0
        let isWeekend = weekday == 1 || weekday == 7

        return CategorizationFeatures(
            tokens: tokens,
            signature: signature,
            absoluteAmountMinorUnits: absoluteSigned,
            amountMagnitudeBucket: Self.magnitudeBucket(forMinorUnits: absoluteSigned),
            dayOfWeek: weekday,
            hour: hour,
            isWeekend: isWeekend
        )
    }

    /// Maps an absolute minor-unit amount to a coarse magnitude bucket (0...7).
    public static func magnitudeBucket(forMinorUnits minorUnits: Int64) -> Int {
        let major = Double(minorUnits) / 100.0
        for (index, bound) in bucketBoundsMajor.enumerated() where major < bound {
            return index
        }
        return bucketBoundsMajor.count
    }
}
