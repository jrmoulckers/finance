// SPDX-License-Identifier: BUSL-1.1
import Foundation; import os
actor KMPAccountRepository: AccountRepository {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "KMPAccountRepository")
    private var cachedAccounts: [AccountItem] = []
    private let bridge: KMPBridge
    init(bridge: KMPBridge? = nil) { self.bridge = bridge ?? KMPBridge._unsafeShared }
    func getAccounts() async throws -> [AccountItem] { cachedAccounts.filter { !$0.isArchived }.sorted { $0.name < $1.name } }
    func getAccount(id: String) async throws -> AccountItem? { cachedAccounts.first { $0.id == id } }
    func deleteAccount(id: String) async throws { cachedAccounts.removeAll { $0.id == id } }
    func calculateNetWorth() -> Int64 { bridge.financialAggregator.netWorth(accounts: cachedAccounts.map { $0.toKMP(householdId: "") }) }
    func populateCache(accounts: [AccountItem]) { self.cachedAccounts = accounts }
}
