// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.household

import com.finance.models.Household
import com.finance.models.HouseholdMember
import com.finance.models.HouseholdRole
import com.finance.models.types.SyncId

/**
 * Core interface for household lifecycle and membership management.
 *
 * Implementations are responsible for persistence, invite-code generation,
 * and enforcing household-level invariants (e.g. max members, single owner).
 * All operations are suspend because they may involve database or network I/O.
 *
 * RBAC enforcement is **not** baked into this interface; callers should check
 * [RbacPermissions] before invoking mutation methods.
 */
interface HouseholdManager {

    /**
     * Create a new household and add [ownerId] as the [HouseholdRole.OWNER].
     *
     * @param name   Display name for the household.
     * @param ownerId  [SyncId] of the user who will own the household.
     * @return The newly created [Household].
     */
    suspend fun createHousehold(name: String, ownerId: SyncId): Household

    /**
     * Generate an invite for [email] to join [householdId] with the given [role].
     *
     * @return An [InviteResult] indicating success (with code) or failure reason.
     */
    suspend fun inviteMember(
        householdId: SyncId,
        email: String,
        role: HouseholdRole,
    ): InviteResult

    /**
     * Accept a pending invite using the single-use [inviteCode].
     *
     * @param inviteCode  The invite code received by the invitee.
     * @param userId      [SyncId] of the accepting user.
     * @return [Result.success] with the new [HouseholdMember] on success,
     *         or [Result.failure] with a descriptive exception on error
     *         (e.g. expired code, already redeemed).
     */
    suspend fun acceptInvite(inviteCode: String, userId: SyncId): Result<HouseholdMember>

    /**
     * Remove a member from the household.
     *
     * Owners cannot be removed — transfer ownership first.
     *
     * @param householdId  The household to remove the member from.
     * @param memberId     [SyncId] of the [HouseholdMember] to remove.
     */
    suspend fun removeMember(householdId: SyncId, memberId: SyncId)

    /**
     * Change the role of an existing member.
     *
     * Cannot demote the sole owner — there must always be exactly one.
     *
     * @param householdId  The household that the member belongs to.
     * @param memberId     [SyncId] of the [HouseholdMember] to update.
     * @param role         The new [HouseholdRole] to assign.
     */
    suspend fun updateRole(householdId: SyncId, memberId: SyncId, role: HouseholdRole)
}
