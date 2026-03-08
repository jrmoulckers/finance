// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.household

import com.finance.models.HouseholdRole

/**
 * Role-Based Access Control (RBAC) permission enforcement for households.
 *
 * Permission matrix:
 * ```
 * Permission            | OWNER | PARTNER | MEMBER | VIEWER
 * ----------------------|-------|---------|--------|-------
 * viewTransactions      |  Yes  |   Yes   |   Yes  |   Yes
 * createTransactions    |  Yes  |   Yes   |   Yes  |   No
 * editBudgets           |  Yes  |   Yes   |   No   |   No
 * manageMembers         |  Yes  |   No    |   No   |   No
 * deleteHousehold       |  Yes  |   No    |   No   |   No
 * ```
 */
object RbacPermissions {

    /**
     * Complete set of permissions that can be granted to a role.
     * Immutable — use [permissionMatrix] to look up a role's grants.
     */
    data class PermissionSet(
        val viewTransactions: Boolean,
        val createTransactions: Boolean,
        val editBudgets: Boolean,
        val manageMembers: Boolean,
        val deleteHousehold: Boolean,
    )

    /**
     * Exhaustive mapping from every [HouseholdRole] to its [PermissionSet].
     * This is the single source of truth for all permission checks.
     */
    val permissionMatrix: Map<HouseholdRole, PermissionSet> = mapOf(
        HouseholdRole.OWNER to PermissionSet(
            viewTransactions = true,
            createTransactions = true,
            editBudgets = true,
            manageMembers = true,
            deleteHousehold = true,
        ),
        HouseholdRole.PARTNER to PermissionSet(
            viewTransactions = true,
            createTransactions = true,
            editBudgets = true,
            manageMembers = false,
            deleteHousehold = false,
        ),
        HouseholdRole.MEMBER to PermissionSet(
            viewTransactions = true,
            createTransactions = true,
            editBudgets = false,
            manageMembers = false,
            deleteHousehold = false,
        ),
        HouseholdRole.VIEWER to PermissionSet(
            viewTransactions = true,
            createTransactions = false,
            editBudgets = false,
            manageMembers = false,
            deleteHousehold = false,
        ),
    )

    // -- Convenience query functions --

    fun canViewTransactions(role: HouseholdRole): Boolean =
        permissionMatrix.getValue(role).viewTransactions

    fun canCreateTransactions(role: HouseholdRole): Boolean =
        permissionMatrix.getValue(role).createTransactions

    fun canEditBudgets(role: HouseholdRole): Boolean =
        permissionMatrix.getValue(role).editBudgets

    fun canManageMembers(role: HouseholdRole): Boolean =
        permissionMatrix.getValue(role).manageMembers

    fun canDeleteHousehold(role: HouseholdRole): Boolean =
        permissionMatrix.getValue(role).deleteHousehold

    /**
     * Return the full [PermissionSet] for the given role.
     * Useful when a caller needs to check multiple permissions at once.
     */
    fun permissionsFor(role: HouseholdRole): PermissionSet =
        permissionMatrix.getValue(role)
}
