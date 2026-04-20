// SPDX-License-Identifier: BUSL-1.1

// HouseholdRepository.swift
// Finance
//
// Protocol defining the data-access contract for household collaboration.
// Implementations can back this with KMP bridge calls or stub data.
//
// References: #270

import Foundation

/// Data-access contract for household collaboration features.
///
/// All methods are `async throws` to support network-backed operations
/// for real-time household sync.
protocol HouseholdRepository: Sendable {

    /// Returns the current user's household, if any.
    func getHousehold() async throws -> HouseholdItem?

    /// Creates a new household with the current user as owner.
    func createHousehold(name: String) async throws -> HouseholdItem

    /// Generates an invite code for the household.
    func generateInviteCode(householdId: String) async throws -> String

    /// Joins a household using an invite code.
    func joinHousehold(inviteCode: String) async throws -> HouseholdItem

    /// Removes a member from the household. Requires admin/owner role.
    func removeMember(householdId: String, memberId: String) async throws

    /// Updates a member's role. Requires owner role.
    func updateMemberRole(
        householdId: String,
        memberId: String,
        newRole: HouseholdRole
    ) async throws

    /// Leaves the current household.
    func leaveHousehold(householdId: String) async throws

    /// Returns the activity feed for the household.
    func getActivityFeed(
        householdId: String,
        limit: Int
    ) async throws -> [HouseholdActivity]
}
