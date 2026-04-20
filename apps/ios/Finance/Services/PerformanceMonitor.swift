// SPDX-License-Identifier: BUSL-1.1
// PerformanceMonitor.swift — Centralised performance instrumentation.
//
// Provides os_signpost spans for critical code paths so they appear in
// Instruments as named intervals. Also integrates with MetricKit for
// field-collected performance diagnostics.
//
// Usage:
//   await PerformanceMonitor.shared.measure("Dashboard Load") {
//       await loadDashboard()
//   }
//
// Or manually:
//   let span = PerformanceMonitor.shared.beginSpan("Transaction List")
//   // ... work ...
//   PerformanceMonitor.shared.endSpan(span)
//
// References: #903, PERFORMANCE.md

import Foundation
import os

// MARK: - Performance Monitor

/// Actor-isolated performance instrumentation using `os_signpost`.
///
/// All signpost emissions go through this actor to ensure consistent
/// subsystem/category naming and to prevent interleaved signpost IDs.
/// Spans appear in Instruments → Points of Interest when profiling.
actor PerformanceMonitor {

    /// Shared singleton instance.
    static let shared = PerformanceMonitor()

    private let signpostLog: OSLog
    private let logger: Logger

    /// Performance thresholds (milliseconds) that trigger warnings.
    private let thresholds: [String: UInt64] = [
        "Dashboard Load": 1_500,
        "Transaction List Load": 500,
        "Account List Load": 300,
        "Budget List Load": 300,
        "Goal List Load": 300,
        "Export Pipeline": 5_000,
        "KMP Bridge Call": 100,
        "Screen Transition": 300,
    ]

    init() {
        self.signpostLog = OSLog(
            subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
            category: .pointsOfInterest
        )
        self.logger = Logger(
            subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
            category: "PerformanceMonitor"
        )
    }

    // MARK: - Signpost Span

    /// A named performance span backed by `os_signpost`.
    struct Span: Sendable {
        let name: StaticString
        let id: OSSignpostID
        let startTime: UInt64

        fileprivate init(name: StaticString, id: OSSignpostID) {
            self.name = name
            self.id = id
            self.startTime = clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)
        }

        /// Duration in milliseconds since span started.
        var elapsedMs: UInt64 {
            let now = clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)
            return (now - startTime) / 1_000_000
        }
    }

    // MARK: - Span Lifecycle

    /// Begins a named signpost interval.
    ///
    /// - Parameter name: Static string identifying the span in Instruments.
    /// - Returns: A `Span` token to pass to `endSpan(_:)`.
    func beginSpan(_ name: StaticString) -> Span {
        let signpostID = OSSignpostID(log: signpostLog)
        os_signpost(.begin, log: signpostLog, name: name, signpostID: signpostID)
        return Span(name: name, id: signpostID)
    }

    /// Ends a previously begun signpost interval.
    ///
    /// Logs a warning if the span exceeds its threshold.
    ///
    /// - Parameter span: The span token returned from `beginSpan(_:)`.
    func endSpan(_ span: Span) {
        os_signpost(.end, log: signpostLog, name: span.name, signpostID: span.id)

        let elapsed = span.elapsedMs
        let nameString = "\(span.name)"

        if let threshold = thresholds[nameString], elapsed > threshold {
            logger.warning(
                "Performance threshold exceeded: \(nameString, privacy: .public) "
                + "took \(elapsed, privacy: .public)ms (threshold: \(threshold, privacy: .public)ms)"
            )
        } else {
            logger.debug(
                "Span completed: \(nameString, privacy: .public) in \(elapsed, privacy: .public)ms"
            )
        }
    }

    // MARK: - Convenience: Measure Async Block

    /// Measures an async closure with signpost instrumentation.
    ///
    /// - Parameters:
    ///   - name: Static string identifying the span.
    ///   - operation: The async work to measure.
    /// - Returns: The result of the operation.
    func measure<T: Sendable>(
        _ name: StaticString,
        operation: @Sendable () async throws -> T
    ) async rethrows -> T {
        let span = beginSpan(name)
        defer { endSpan(span) }
        return try await operation()
    }

    /// Measures an async throwing closure and returns the duration in milliseconds.
    ///
    /// - Parameters:
    ///   - name: Static string identifying the span.
    ///   - operation: The async work to measure.
    /// - Returns: A tuple of the operation result and elapsed time in milliseconds.
    func measureWithDuration<T: Sendable>(
        _ name: StaticString,
        operation: @Sendable () async throws -> T
    ) async rethrows -> (result: T, durationMs: UInt64) {
        let span = beginSpan(name)
        let result = try await operation()
        let duration = span.elapsedMs
        endSpan(span)
        return (result, duration)
    }

    // MARK: - Event Signpost

    /// Emits a single signpost event (not a range).
    ///
    /// Use for marking discrete moments like "Sync Complete" or "Cache Hit".
    ///
    /// - Parameter name: Static string identifying the event.
    func event(_ name: StaticString) {
        os_signpost(.event, log: signpostLog, name: name)
        logger.debug("Event: \(name, privacy: .public)")
    }
}
