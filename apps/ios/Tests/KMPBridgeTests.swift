// SPDX-License-Identifier: BUSL-1.1
// KMPBridgeTests.swift

import Foundation
import Testing
@testable import FinanceApp

@Suite("KMPBridge initialisation")
struct KMPBridgeInitTests {
    @Test("isKMPAvailable is false when useMocks is true")
    @MainActor func kmpUnavailable() { let b = KMPBridge(useMocks: true); #expect(!b.isKMPAvailable) }
    @Test("syncClient is nil by default")
    @MainActor func syncNil() { let b = KMPBridge(useMocks: true); #expect(b.syncClient == nil) }
}

@Suite("KMPTypeAdapters enum round-trip")
struct KMPEnumAdapterTests {
    @Test("TransactionTypeUI round-trips")
    func txnType() { for t in TransactionTypeUI.allCases { #expect(TransactionTypeUI.fromKMP(t.toKMP()) == t) } }
    @Test("AccountTypeUI round-trips")
    func acctType() { for t in AccountTypeUI.allCases { #expect(AccountTypeUI.fromKMP(t.toKMP()) == t) } }
    @Test("GoalStatusUI round-trips")
    func goalStatus() { for s in GoalStatusUI.allCases { #expect(GoalStatusUI.fromKMP(s.toKMP()) == s) } }
    @Test("BudgetPeriod displayNames non-empty")
    func budgetPeriod() { for p in KMPBudgetPeriod.allCases { #expect(!p.displayName.isEmpty) } }
}

@Suite("KMPDateConversion")
struct KMPDateConversionTests {
    @Test("dateFromEpochMs converts correctly")
    func epochMs() {
        let d = KMPDateConversion.dateFromEpochMs(1_704_067_200_000)
        var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "UTC")!
        let comps = c.dateComponents([.year, .month, .day], from: d)
        #expect(comps.year == 2024); #expect(comps.month == 1); #expect(comps.day == 1)
    }
    @Test("epochMs round-trips")
    func roundTrip() {
        let orig: Int64 = 1_700_000_000_000
        let rt = KMPDateConversion.epochMsFromDate(KMPDateConversion.dateFromEpochMs(orig))
        #expect(abs(rt - orig) <= 1)
    }
}

@Suite("KMPRepositoryError")
struct KMPRepositoryErrorTests {
    @Test("entityNotFound includes type") func entityNotFound() {
        #expect(KMPRepositoryError.entityNotFound(entityType: "Account", id: "x").localizedDescription.contains("Account"))
    }
    @Test("bridgeCallFailed wraps message") func bridgeCall() {
        #expect(KMPRepositoryError.bridgeCallFailed(underlying: "timeout").localizedDescription.contains("timeout"))
    }
}

@Suite("KMP Repository fallback")
struct KMPRepositoryFallbackTests {
    @Test("accounts fallback") @MainActor func acct() async throws {
        #expect(!(try await KMPAccountRepository().getAccounts()).isEmpty)
    }
    @Test("transactions paginated") @MainActor func txnPage() async throws {
        #expect((try await KMPTransactionRepository().getTransactions(offset: 0, limit: 2)).count <= 2)
    }
    @Test("budgets fallback") @MainActor func budget() async throws {
        #expect(!(try await KMPBudgetRepository().getBudgets()).isEmpty)
    }
    @Test("goals fallback") @MainActor func goal() async throws {
        #expect(!(try await KMPGoalRepository().getGoals()).isEmpty)
    }
}