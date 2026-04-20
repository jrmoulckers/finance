// SPDX-License-Identifier: BUSL-1.1
// DataCache.swift — Actor-isolated cache for frequently accessed data.
//
// Caches account summaries, budget summaries, and other frequently
// read data to avoid repeated round-trips through the KMP bridge
// or LocalDataStore. Entries have configurable TTL and are invalidated
// on mutation.
//
// Addresses PERFORMANCE.md checklist item:
//   "Cache frequently read data (account list, budget summaries) in an
//    in-memory actor to avoid repeated round-trips through KMP."
//
// References: #903

import Foundation
import os

// MARK: - Cache Entry

/// A time-limited cache entry wrapping any Sendable value.
struct CacheEntry<T: Sendable>: Sendable {
    let value: T
    let timestamp: Date
    let ttl: TimeInterval

    /// Whether the entry has expired.
    var isExpired: Bool {
        Date.now.timeIntervalSince(timestamp) > ttl
    }
}

// MARK: - Data Cache

/// Actor-isolated in-memory cache for frequently accessed financial data.
///
/// The cache uses string keys and generic typed entries. All access is
/// serialized through the actor, so no external synchronization is needed.
///
/// Cache entries have a configurable TTL (default: 30 seconds). The cache
/// is invalidated on data mutations to ensure consistency.
actor DataCache {

    /// Shared singleton instance.
    static let shared = DataCache()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DataCache"
    )

    // MARK: - Storage

    /// Type-erased storage for cache entries.
    private var storage: [String: any Sendable] = [:]

    /// Default TTL for cache entries (30 seconds).
    let defaultTTL: TimeInterval = 30

    /// Cache hit/miss statistics for monitoring.
    private(set) var hits: Int = 0
    private(set) var misses: Int = 0

    // MARK: - Read

    /// Returns the cached value for the given key, or nil if expired/missing.
    ///
    /// - Parameters:
    ///   - key: Cache key string.
    ///   - type: The expected type of the cached value.
    /// - Returns: The cached value if present and not expired, otherwise nil.
    func get<T: Sendable>(_ key: String, as type: T.Type = T.self) -> T? {
        guard let entry = storage[key] as? CacheEntry<T> else {
            misses += 1
            Self.logger.debug("Cache miss: \(key, privacy: .public)")
            return nil
        }

        if entry.isExpired {
            storage.removeValue(forKey: key)
            misses += 1
            Self.logger.debug("Cache expired: \(key, privacy: .public)")
            return nil
        }

        hits += 1
        Self.logger.debug("Cache hit: \(key, privacy: .public)")
        return entry.value
    }

    // MARK: - Write

    /// Stores a value in the cache with the given key and TTL.
    ///
    /// - Parameters:
    ///   - key: Cache key string.
    ///   - value: The value to cache.
    ///   - ttl: Time-to-live for this entry. Defaults to `defaultTTL`.
    func set<T: Sendable>(_ key: String, value: T, ttl: TimeInterval? = nil) {
        let entry = CacheEntry(
            value: value,
            timestamp: .now,
            ttl: ttl ?? defaultTTL
        )
        storage[key] = entry
        Self.logger.debug("Cache set: \(key, privacy: .public)")
    }

    // MARK: - Get or Fetch

    /// Returns the cached value, or fetches it using the provided closure.
    ///
    /// This is the primary API for cache-aside pattern:
    /// ```swift
    /// let accounts = await DataCache.shared.getOrFetch("accounts") {
    ///     try await repository.getAccounts()
    /// }
    /// ```
    ///
    /// - Parameters:
    ///   - key: Cache key string.
    ///   - ttl: Optional TTL override.
    ///   - fetch: Async closure to produce the value on cache miss.
    /// - Returns: The cached or freshly fetched value.
    func getOrFetch<T: Sendable>(
        _ key: String,
        ttl: TimeInterval? = nil,
        fetch: @Sendable () async throws -> T
    ) async throws -> T {
        if let cached: T = get(key) {
            return cached
        }

        let value = try await fetch()
        set(key, value: value, ttl: ttl)
        return value
    }

    // MARK: - Invalidation

    /// Removes a specific cache entry.
    func invalidate(_ key: String) {
        storage.removeValue(forKey: key)
        Self.logger.debug("Cache invalidated: \(key, privacy: .public)")
    }

    /// Removes all cache entries matching the given prefix.
    ///
    /// Useful for invalidating all account-related caches when an
    /// account is created, updated, or deleted.
    func invalidateAll(prefix: String) {
        let keys = storage.keys.filter { $0.hasPrefix(prefix) }
        for key in keys {
            storage.removeValue(forKey: key)
        }
        if !keys.isEmpty {
            Self.logger.debug(
                "Cache invalidated \(keys.count, privacy: .public) entries with prefix '\(prefix, privacy: .public)'"
            )
        }
    }

    /// Removes all cache entries.
    func invalidateAll() {
        let count = storage.count
        storage.removeAll()
        Self.logger.info("Cache cleared: \(count, privacy: .public) entries removed")
    }

    // MARK: - Statistics

    /// Returns the current cache hit ratio (0.0–1.0).
    var hitRatio: Double {
        let total = hits + misses
        guard total > 0 else { return 0 }
        return Double(hits) / Double(total)
    }

    /// Resets hit/miss statistics.
    func resetStatistics() {
        hits = 0
        misses = 0
    }

    // MARK: - Well-Known Keys

    /// Standard cache keys for the Finance app.
    enum Keys {
        static let accounts = "accounts"
        static let allAccounts = "allAccounts"
        static let budgets = "budgets"
        static let recentTransactions = "recentTransactions"
        static let goals = "goals"
        static let categories = "categories"
        static let accountPrefix = "account:"
        static let transactionPrefix = "transaction:"
    }
}
