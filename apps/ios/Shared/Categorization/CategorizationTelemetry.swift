// SPDX-License-Identifier: BUSL-1.1

// CategorizationTelemetry.swift
// FinanceShared
//
// Privacy-safe aggregate telemetry for the categorization feature. Records ONLY
// counts and enum tags (source, confidence band). It never records merchant
// names, memos, amounts, category ids, signatures, or any per-transaction
// content. The snapshot is suitable for local feature-health dashboards.
//
// References: #2382

import Foundation

// MARK: - Snapshot

/// An aggregate, content-free view of categorization feature health.
public struct CategorizationTelemetrySnapshot: Sendable, Codable, Equatable {
    /// Total suggestions surfaced to the user.
    public var suggestionsShown: Int
    /// Suggestions the user accepted as-is.
    public var accepted: Int
    /// Suggestions the user changed to a different category.
    public var overridden: Int
    /// Times the user disabled suggestions.
    public var disabled: Int
    /// Times the no-signal fallback was shown.
    public var fallbackShown: Int
    /// Suggestions shown, bucketed by source (raw value -> count).
    public var shownBySource: [String: Int]
    /// Suggestions shown, bucketed by confidence band (raw value -> count).
    public var shownByBand: [String: Int]

    public init(
        suggestionsShown: Int = 0,
        accepted: Int = 0,
        overridden: Int = 0,
        disabled: Int = 0,
        fallbackShown: Int = 0,
        shownBySource: [String: Int] = [:],
        shownByBand: [String: Int] = [:]
    ) {
        self.suggestionsShown = suggestionsShown
        self.accepted = accepted
        self.overridden = overridden
        self.disabled = disabled
        self.fallbackShown = fallbackShown
        self.shownBySource = shownBySource
        self.shownByBand = shownByBand
    }

    /// Fraction of resolved suggestions that were accepted (0.0 ... 1.0).
    public var acceptanceRate: Double {
        let resolved = accepted + overridden
        guard resolved > 0 else { return 0 }
        return Double(accepted) / Double(resolved)
    }
}

// MARK: - Recorder

/// Records aggregate categorization events. Implementations MUST NOT persist any
/// transaction content — only counts and enum tags.
public protocol CategorizationTelemetryRecording: Sendable {
    func recordSuggestionShown(source: CategorizationSource, band: CategorizationConfidenceBand)
    func recordAccepted(source: CategorizationSource)
    func recordOverridden(source: CategorizationSource)
    func recordDisabled()
    func snapshot() -> CategorizationTelemetrySnapshot
    func reset()
}

/// In-memory recorder for previews and deterministic tests.
public final class InMemoryCategorizationTelemetry: CategorizationTelemetryRecording, @unchecked Sendable {
    private let lock = NSLock()
    private var state = CategorizationTelemetrySnapshot()

    public init() {}

    public func recordSuggestionShown(source: CategorizationSource, band: CategorizationConfidenceBand) {
        lock.lock(); defer { lock.unlock() }
        state.suggestionsShown += 1
        state.shownBySource[source.rawValue, default: 0] += 1
        state.shownByBand[band.rawValue, default: 0] += 1
        if source == .fallback {
            state.fallbackShown += 1
        }
    }

    public func recordAccepted(source: CategorizationSource) {
        lock.lock(); defer { lock.unlock() }
        state.accepted += 1
    }

    public func recordOverridden(source: CategorizationSource) {
        lock.lock(); defer { lock.unlock() }
        state.overridden += 1
    }

    public func recordDisabled() {
        lock.lock(); defer { lock.unlock() }
        state.disabled += 1
    }

    public func snapshot() -> CategorizationTelemetrySnapshot {
        lock.lock(); defer { lock.unlock() }
        return state
    }

    public func reset() {
        lock.lock(); defer { lock.unlock() }
        state = CategorizationTelemetrySnapshot()
    }
}

/// UserDefaults-backed aggregate recorder for production.
///
/// Persists only the ``CategorizationTelemetrySnapshot`` (counts + enum tags).
public final class AggregateCategorizationTelemetry: CategorizationTelemetryRecording, @unchecked Sendable {
    private let lock = NSLock()
    private let defaults: UserDefaults?
    private let storageKey: String

    public init(
        defaults: UserDefaults? = SharedConstants.sharedDefaults,
        storageKey: String = "finance:categorization-telemetry"
    ) {
        self.defaults = defaults
        self.storageKey = storageKey
    }

    private func load() -> CategorizationTelemetrySnapshot {
        guard let data = defaults?.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode(CategorizationTelemetrySnapshot.self, from: data)
        else { return CategorizationTelemetrySnapshot() }
        return decoded
    }

    private func save(_ snapshot: CategorizationTelemetrySnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: storageKey)
    }

    public func recordSuggestionShown(source: CategorizationSource, band: CategorizationConfidenceBand) {
        lock.lock(); defer { lock.unlock() }
        var snapshot = load()
        snapshot.suggestionsShown += 1
        snapshot.shownBySource[source.rawValue, default: 0] += 1
        snapshot.shownByBand[band.rawValue, default: 0] += 1
        if source == .fallback {
            snapshot.fallbackShown += 1
        }
        save(snapshot)
    }

    public func recordAccepted(source: CategorizationSource) {
        lock.lock(); defer { lock.unlock() }
        var snapshot = load()
        snapshot.accepted += 1
        save(snapshot)
    }

    public func recordOverridden(source: CategorizationSource) {
        lock.lock(); defer { lock.unlock() }
        var snapshot = load()
        snapshot.overridden += 1
        save(snapshot)
    }

    public func recordDisabled() {
        lock.lock(); defer { lock.unlock() }
        var snapshot = load()
        snapshot.disabled += 1
        save(snapshot)
    }

    public func snapshot() -> CategorizationTelemetrySnapshot {
        lock.lock(); defer { lock.unlock() }
        return load()
    }

    public func reset() {
        lock.lock(); defer { lock.unlock() }
        defaults?.removeObject(forKey: storageKey)
    }
}
