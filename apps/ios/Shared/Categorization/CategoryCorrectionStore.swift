// SPDX-License-Identifier: BUSL-1.1

// CategoryCorrectionStore.swift
// FinanceShared
//
// Persistence of user corrections for on-device personalization. Stores only a
// mapping from a non-reversible token signature to a chosen category id — never
// the raw merchant, memo, or amount. Backed by an injectable UserDefaults so it
// can use the app-group suite in production and an isolated suite in tests.
//
// References: #2382

import Foundation

/// Read/write contract for learned user corrections.
public protocol CategoryCorrectionStoring: Sendable {
    /// Returns the category a user previously chose for this signature, if any.
    func correctedCategory(forSignature signature: String) -> String?

    /// Records (or overwrites) a correction for a signature.
    func recordCorrection(signature: String, categoryId: String)

    /// Removes a single correction.
    func removeCorrection(forSignature signature: String)

    /// Number of stored corrections (used for telemetry/diagnostics, no content).
    var count: Int { get }

    /// Clears every stored correction.
    func clearAll()
}

/// In-memory correction store. Useful for previews and deterministic tests.
public final class InMemoryCategoryCorrectionStore: CategoryCorrectionStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: String]

    public init(seed: [String: String] = [:]) {
        self.storage = seed
    }

    public func correctedCategory(forSignature signature: String) -> String? {
        guard !signature.isEmpty else { return nil }
        lock.lock(); defer { lock.unlock() }
        return storage[signature]
    }

    public func recordCorrection(signature: String, categoryId: String) {
        guard !signature.isEmpty else { return }
        lock.lock(); defer { lock.unlock() }
        storage[signature] = categoryId
    }

    public func removeCorrection(forSignature signature: String) {
        lock.lock(); defer { lock.unlock() }
        storage[signature] = nil
    }

    public var count: Int {
        lock.lock(); defer { lock.unlock() }
        return storage.count
    }

    public func clearAll() {
        lock.lock(); defer { lock.unlock() }
        storage.removeAll()
    }
}

/// UserDefaults-backed correction store for production personalization.
///
/// Persists a single JSON dictionary `[signature: categoryId]`. When native
/// storage is unavailable (no defaults), it degrades to an empty, no-op store so
/// categorization still works (just without personalization).
public final class UserDefaultsCategoryCorrectionStore: CategoryCorrectionStoring, @unchecked Sendable {
    private let lock = NSLock()
    private let defaults: UserDefaults?
    private let storageKey: String

    public init(
        defaults: UserDefaults? = SharedConstants.sharedDefaults,
        storageKey: String = "finance:categorization-corrections"
    ) {
        self.defaults = defaults
        self.storageKey = storageKey
    }

    private func load() -> [String: String] {
        guard let data = defaults?.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([String: String].self, from: data)
        else { return [:] }
        return decoded
    }

    private func save(_ map: [String: String]) {
        guard let data = try? JSONEncoder().encode(map) else { return }
        defaults?.set(data, forKey: storageKey)
    }

    public func correctedCategory(forSignature signature: String) -> String? {
        guard !signature.isEmpty else { return nil }
        lock.lock(); defer { lock.unlock() }
        return load()[signature]
    }

    public func recordCorrection(signature: String, categoryId: String) {
        guard !signature.isEmpty else { return }
        lock.lock(); defer { lock.unlock() }
        var map = load()
        map[signature] = categoryId
        save(map)
    }

    public func removeCorrection(forSignature signature: String) {
        lock.lock(); defer { lock.unlock() }
        var map = load()
        map[signature] = nil
        save(map)
    }

    public var count: Int {
        lock.lock(); defer { lock.unlock() }
        return load().count
    }

    public func clearAll() {
        lock.lock(); defer { lock.unlock() }
        defaults?.removeObject(forKey: storageKey)
    }
}
