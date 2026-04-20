// SPDX-License-Identifier: BUSL-1.1
// PerformanceMonitorTests.swift — Unit tests for performance instrumentation.
//
// Tests cover:
//   - PerformanceMonitor span lifecycle
//   - DataCache CRUD, TTL, invalidation, and statistics
//   - Signpost integration (functional, not visual)
//
// References: #903

import Foundation
import Testing
@testable import FinanceApp

// MARK: - PerformanceMonitor Tests

@Suite("PerformanceMonitor")
struct PerformanceMonitorTests {

    @Test("measure executes operation and returns result")
    func measureExecutesOperation() async throws {
        let result = await PerformanceMonitor.shared.measure("Test Span") {
            return 42
        }
        #expect(result == 42)
    }

    @Test("measureWithDuration returns result and duration")
    func measureWithDuration() async throws {
        let (result, durationMs) = await PerformanceMonitor.shared.measureWithDuration("Test Duration") {
            try? await Task.sleep(for: .milliseconds(10))
            return "hello"
        }
        #expect(result == "hello")
        #expect(durationMs >= 0, "Duration should be non-negative")
    }

    @Test("beginSpan and endSpan complete without crash")
    func spanLifecycle() async {
        let span = await PerformanceMonitor.shared.beginSpan("Test Manual Span")
        // Simulate some work
        try? await Task.sleep(for: .milliseconds(5))
        await PerformanceMonitor.shared.endSpan(span)
        // No crash = success
    }

    @Test("event emits without crash")
    func eventEmits() async {
        await PerformanceMonitor.shared.event("Test Event")
        // No crash = success
    }

    @Test("measure propagates errors")
    func measurePropagatesErrors() async {
        do {
            let _: Int = try await PerformanceMonitor.shared.measure("Error Span") {
                throw TestError.simulated
            }
            Issue.record("Should have thrown")
        } catch {
            // Expected
        }
    }
}

// MARK: - DataCache Tests

@Suite("DataCache")
struct DataCacheTests {

    @Test("set and get retrieves cached value")
    func setAndGet() async {
        let cache = DataCache()
        await cache.set("test-key", value: 42)
        let value: Int? = await cache.get("test-key")
        #expect(value == 42)
    }

    @Test("get returns nil for missing key")
    func getMissingKey() async {
        let cache = DataCache()
        let value: Int? = await cache.get("nonexistent")
        #expect(value == nil)
    }

    @Test("expired entry returns nil")
    func expiredEntry() async {
        let cache = DataCache()
        await cache.set("expiring", value: "hello", ttl: 0.01) // 10ms TTL
        try? await Task.sleep(for: .milliseconds(50))
        let value: String? = await cache.get("expiring")
        #expect(value == nil, "Expired entry should return nil")
    }

    @Test("invalidate removes specific entry")
    func invalidateSpecific() async {
        let cache = DataCache()
        await cache.set("a", value: 1)
        await cache.set("b", value: 2)

        await cache.invalidate("a")

        let a: Int? = await cache.get("a")
        let b: Int? = await cache.get("b")
        #expect(a == nil, "Invalidated entry should be nil")
        #expect(b == 2, "Other entry should remain")
    }

    @Test("invalidateAll with prefix removes matching entries")
    func invalidatePrefix() async {
        let cache = DataCache()
        await cache.set("account:1", value: "checking")
        await cache.set("account:2", value: "savings")
        await cache.set("budget:1", value: "groceries")

        await cache.invalidateAll(prefix: "account:")

        let a1: String? = await cache.get("account:1")
        let a2: String? = await cache.get("account:2")
        let b1: String? = await cache.get("budget:1")
        #expect(a1 == nil, "account:1 should be invalidated")
        #expect(a2 == nil, "account:2 should be invalidated")
        #expect(b1 == "groceries", "budget:1 should remain")
    }

    @Test("invalidateAll clears everything")
    func invalidateEverything() async {
        let cache = DataCache()
        await cache.set("a", value: 1)
        await cache.set("b", value: 2)

        await cache.invalidateAll()

        let a: Int? = await cache.get("a")
        let b: Int? = await cache.get("b")
        #expect(a == nil)
        #expect(b == nil)
    }

    @Test("hit/miss statistics are tracked")
    func hitMissStatistics() async {
        let cache = DataCache()
        await cache.resetStatistics()

        await cache.set("key", value: "value")
        let _: String? = await cache.get("key") // hit
        let _: String? = await cache.get("missing") // miss

        let hits = await cache.hits
        let misses = await cache.misses
        #expect(hits == 1, "Should have 1 hit")
        #expect(misses == 1, "Should have 1 miss")
    }

    @Test("hitRatio computes correctly")
    func hitRatioComputes() async {
        let cache = DataCache()
        await cache.resetStatistics()

        await cache.set("a", value: 1)
        let _: Int? = await cache.get("a") // hit
        let _: Int? = await cache.get("a") // hit
        let _: Int? = await cache.get("b") // miss

        let ratio = await cache.hitRatio
        #expect(ratio > 0.6, "Hit ratio should be ~0.67 (2 hits, 1 miss)")
        #expect(ratio < 0.7)
    }

    @Test("resetStatistics clears counters")
    func resetStatistics() async {
        let cache = DataCache()
        await cache.set("key", value: "value")
        let _: String? = await cache.get("key")
        let _: String? = await cache.get("missing")

        await cache.resetStatistics()

        let hits = await cache.hits
        let misses = await cache.misses
        #expect(hits == 0)
        #expect(misses == 0)
    }

    @Test("getOrFetch returns cached value on hit")
    func getOrFetchCacheHit() async throws {
        let cache = DataCache()
        await cache.set("accounts", value: [1, 2, 3])

        var fetchCalled = false
        let result: [Int] = try await cache.getOrFetch("accounts") {
            fetchCalled = true
            return [4, 5, 6]
        }

        #expect(result == [1, 2, 3], "Should return cached value")
        #expect(!fetchCalled, "Fetch should not be called on cache hit")
    }

    @Test("getOrFetch calls fetch on miss and caches result")
    func getOrFetchCacheMiss() async throws {
        let cache = DataCache()

        let result: [Int] = try await cache.getOrFetch("accounts") {
            return [1, 2, 3]
        }

        #expect(result == [1, 2, 3], "Should return fetched value")

        // Verify it's now cached
        let cached: [Int]? = await cache.get("accounts")
        #expect(cached == [1, 2, 3], "Value should be cached after fetch")
    }

    @Test("getOrFetch propagates errors")
    func getOrFetchPropagatesErrors() async {
        let cache = DataCache()

        do {
            let _: Int = try await cache.getOrFetch("failing") {
                throw TestError.simulated
            }
            Issue.record("Should have thrown")
        } catch {
            // Expected: error should propagate
        }
    }

    @Test("cache handles different types for same key")
    func differentTypes() async {
        let cache = DataCache()
        await cache.set("key", value: 42)

        // Accessing with wrong type should return nil (type mismatch)
        let stringValue: String? = await cache.get("key")
        #expect(stringValue == nil, "Wrong type should return nil")

        // Correct type should work
        let intValue: Int? = await cache.get("key")
        #expect(intValue == 42)
    }

    @Test("Keys constants are non-empty")
    func keysConstants() {
        #expect(!DataCache.Keys.accounts.isEmpty)
        #expect(!DataCache.Keys.budgets.isEmpty)
        #expect(!DataCache.Keys.recentTransactions.isEmpty)
        #expect(!DataCache.Keys.goals.isEmpty)
        #expect(!DataCache.Keys.categories.isEmpty)
        #expect(!DataCache.Keys.accountPrefix.isEmpty)
        #expect(!DataCache.Keys.transactionPrefix.isEmpty)
    }
}
