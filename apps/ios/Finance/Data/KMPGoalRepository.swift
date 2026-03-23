// SPDX-License-Identifier: BUSL-1.1
import Foundation; import os
actor KMPGoalRepository: GoalRepository {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "KMPGoalRepository")
    private var cachedGoals: [GoalItem] = []
    init() {}
    func getGoals() async throws -> [GoalItem] { cachedGoals }
    func populateCache(goals: [GoalItem]) { self.cachedGoals = goals }
}
