// SPDX-License-Identifier: BUSL-1.1
import Foundation; import os
actor KMPBudgetRepository: BudgetRepository {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "KMPBudgetRepository")
    private var cachedBudgets: [BudgetItem] = []
    private let bridge: KMPBridge
    init(bridge: KMPBridge? = nil) { self.bridge = bridge ?? KMPBridge._unsafeShared }
    func getBudgets() async throws -> [BudgetItem] { cachedBudgets }
    func populateCache(budgets: [BudgetItem]) { self.cachedBudgets = budgets }
}
