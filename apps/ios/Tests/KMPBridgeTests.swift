// SPDX-License-Identifier: BUSL-1.1
// KMPBridgeTests.swift

import Foundation
import Testing
@testable import FinanceApp

@Suite("KMPBridge initialisation")
struct KMPBridgeInitTests {
    @Test("isKMPAvailable is false when useMocks is true")
    @MainActor func kmpUnavailableInMockMode() {
        let bridge = KMPBridge(useMocks: true)
        #expect(!bridge.isKMPAvailable)
    }
    @Test("syncClient is nil by default")
    @MainActor func syncClientNilByDefault() {
        let bridge = KMPBridge(useMocks: true)
        #expect(bridge.syncClient == nil)
    }
}

@Suite("KMPTypeAdapters enum round-trip")
struct KMPEnumAdapterTests {
    @Test("TransactionTypeUI round-trips")
    func txnTypeRoundTrip() {
        for t in TransactionTypeUI.allCases {
            #expect(TransactionTypeUI.fromKMP(t.toKMP()) == t)
        }
    }
    @Test("AccountTypeUI round-trips")
    func acctTypeRoundTrip() {
        for t in AccountTypeUI.allCases {
            #expect(AccountTypeUI.fromKMP(t.toKMP()) == t)
        }
    }
    @Test("GoalStatusUI round-trips")
    func goalStatusRoundTrip() {
        for s in GoalStatusUI.allCases {
            #expect(GoalStatusUI.fromKMP(s.toKMP()) == s)
        }
    }
}

@Suite("KMPDateConversion")
struct KMPDateConversionTests {
    @Test("dateFromEpochMs converts correctly")
    func epochMsToDate() {
        let date = KMPDateConversion.dateFromEpochMs(1_704_067_200_000)
        var utcCal = Calendar(identifier: .gregorian)
        utcCal.timeZone = TimeZone(identifier: "UTC")!
        let comps = utcCal.dateComponents([.year, .month, .day], from: date)
        #expect(comps.year == 2024)
        #expect(comps.month == 1)
        #expect(comps.day == 1)
    }
    @Test("epochMsFromDate round-trips")
    func epochMsRoundTrip() {
        let original: Int64 = 1_700_000_000_000
        let date = KMPDateConversion.dateFromEpochMs(original)
        let rt = KMPDateConversion.epochMsFromDate(date)
        #expect(abs(rt - original) <= 1)
    }
}

@Suite("KMPRepositoryError")
struct KMPRepositoryErrorTests {
    @Test("entityNotFound includes type and id")
    func entityNotFound() {
        let e = KMPRepositoryError.entityNotFound(entityType: "Account", id: "x")
        #expect(e.localizedDescription.contains("Account"))
    }
    @Test("bridgeCallFailed wraps message")
    func bridgeCallFailed() {
        let e = KMPRepositoryError.bridgeCallFailed(underlying: "timeout")
        #expect(e.localizedDescription.contains("timeout"))
    }
}

@Suite("KMP Repository fallback")
struct KMPRepositoryFallbackTests {
    @Test("KMPAccountRepository falls back to mock data")
    @MainActor func accountFallback() async throws {
        let repo = KMPAccountRepository()
        let accounts = try await repo.getAccounts()
        #expect(!accounts.isEmpty)
    }
    @Test("KMPTransactionRepository paginated returns correct slice")
    @MainActor func txnPaginated() async throws {
        let repo = KMPTransactionRepository()
        let page = try await repo.getTransactions(offset: 0, limit: 2)
        #expect(page.count <= 2)
    }
    @Test("KMPBudgetRepository falls back to mock data")
    @MainActor func budgetFallback() async throws {
        let repo = KMPBudgetRepository()
        let budgets = try await repo.getBudgets()
        #expect(!budgets.isEmpty)
    }
    @Test("KMPGoalRepository falls back to mock data")
    @MainActor func goalFallback() async throws {
        let repo = KMPGoalRepository()
        let goals = try await repo.getGoals()
        #expect(!goals.isEmpty)
    }
}