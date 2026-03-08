// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.household

import com.finance.models.HouseholdRole
import kotlin.test.*

/**
 * Verifies the RBAC permission matrix for every [HouseholdRole].
 * Each test makes assertions against both the convenience functions
 * and the underlying [RbacPermissions.permissionMatrix] data structure.
 */
class RbacPermissionsTest {

    // Owner -- full access

    @Test
    fun owner_canViewTransactions() {
        assertTrue(RbacPermissions.canViewTransactions(HouseholdRole.OWNER))
    }

    @Test
    fun owner_canCreateTransactions() {
        assertTrue(RbacPermissions.canCreateTransactions(HouseholdRole.OWNER))
    }

    @Test
    fun owner_canEditBudgets() {
        assertTrue(RbacPermissions.canEditBudgets(HouseholdRole.OWNER))
    }

    @Test
    fun owner_canManageMembers() {
        assertTrue(RbacPermissions.canManageMembers(HouseholdRole.OWNER))
    }

    @Test
    fun owner_canDeleteHousehold() {
        assertTrue(RbacPermissions.canDeleteHousehold(HouseholdRole.OWNER))
    }

    // Partner -- finances yes, admin no

    @Test
    fun partner_canViewTransactions() {
        assertTrue(RbacPermissions.canViewTransactions(HouseholdRole.PARTNER))
    }

    @Test
    fun partner_canCreateTransactions() {
        assertTrue(RbacPermissions.canCreateTransactions(HouseholdRole.PARTNER))
    }

    @Test
    fun partner_canEditBudgets() {
        assertTrue(RbacPermissions.canEditBudgets(HouseholdRole.PARTNER))
    }

    @Test
    fun partner_cannotManageMembers() {
        assertFalse(RbacPermissions.canManageMembers(HouseholdRole.PARTNER))
    }

    @Test
    fun partner_cannotDeleteHousehold() {
        assertFalse(RbacPermissions.canDeleteHousehold(HouseholdRole.PARTNER))
    }

    // Member -- create and view, but not edit budgets or admin

    @Test
    fun member_canViewTransactions() {
        assertTrue(RbacPermissions.canViewTransactions(HouseholdRole.MEMBER))
    }

    @Test
    fun member_canCreateTransactions() {
        assertTrue(RbacPermissions.canCreateTransactions(HouseholdRole.MEMBER))
    }

    @Test
    fun member_cannotEditBudgets() {
        assertFalse(RbacPermissions.canEditBudgets(HouseholdRole.MEMBER))
    }

    @Test
    fun member_cannotManageMembers() {
        assertFalse(RbacPermissions.canManageMembers(HouseholdRole.MEMBER))
    }

    @Test
    fun member_cannotDeleteHousehold() {
        assertFalse(RbacPermissions.canDeleteHousehold(HouseholdRole.MEMBER))
    }

    // Viewer -- read-only

    @Test
    fun viewer_canViewTransactions() {
        assertTrue(RbacPermissions.canViewTransactions(HouseholdRole.VIEWER))
    }

    @Test
    fun viewer_cannotCreateTransactions() {
        assertFalse(RbacPermissions.canCreateTransactions(HouseholdRole.VIEWER))
    }

    @Test
    fun viewer_cannotEditBudgets() {
        assertFalse(RbacPermissions.canEditBudgets(HouseholdRole.VIEWER))
    }

    @Test
    fun viewer_cannotManageMembers() {
        assertFalse(RbacPermissions.canManageMembers(HouseholdRole.VIEWER))
    }

    @Test
    fun viewer_cannotDeleteHousehold() {
        assertFalse(RbacPermissions.canDeleteHousehold(HouseholdRole.VIEWER))
    }

    // Matrix structural integrity

    @Test
    fun permissionMatrix_coversAllRoles() {
        val matrixRoles = RbacPermissions.permissionMatrix.keys
        HouseholdRole.entries.forEach { role ->
            assertTrue(
                role in matrixRoles,
                "permissionMatrix is missing role: $role",
            )
        }
    }

    @Test
    fun permissionsFor_returnsMatchingPermissionSet() {
        val ownerPerms = RbacPermissions.permissionsFor(HouseholdRole.OWNER)
        assertTrue(ownerPerms.viewTransactions)
        assertTrue(ownerPerms.createTransactions)
        assertTrue(ownerPerms.editBudgets)
        assertTrue(ownerPerms.manageMembers)
        assertTrue(ownerPerms.deleteHousehold)
    }

    @Test
    fun permissionMatrix_hasExactlyFourEntries() {
        assertEquals(
            HouseholdRole.entries.size,
            RbacPermissions.permissionMatrix.size,
            "permissionMatrix should have exactly one entry per HouseholdRole",
        )
    }

    // Role hierarchy -- permissions are strictly decreasing

    @Test
    fun permissions_decreaseFromOwnerToViewer() {
        fun permCount(role: HouseholdRole): Int {
            val p = RbacPermissions.permissionsFor(role)
            return listOf(
                p.viewTransactions,
                p.createTransactions,
                p.editBudgets,
                p.manageMembers,
                p.deleteHousehold,
            ).count { it }
        }

        assertTrue(permCount(HouseholdRole.OWNER) >= permCount(HouseholdRole.PARTNER))
        assertTrue(permCount(HouseholdRole.PARTNER) >= permCount(HouseholdRole.MEMBER))
        assertTrue(permCount(HouseholdRole.MEMBER) >= permCount(HouseholdRole.VIEWER))
    }

    @Test
    fun allRoles_canViewTransactions() {
        HouseholdRole.entries.forEach { role ->
            assertTrue(
                RbacPermissions.canViewTransactions(role),
                "$role should be able to view transactions",
            )
        }
    }

    @Test
    fun onlyOwner_canDeleteHousehold() {
        HouseholdRole.entries.forEach { role ->
            if (role == HouseholdRole.OWNER) {
                assertTrue(RbacPermissions.canDeleteHousehold(role))
            } else {
                assertFalse(
                    RbacPermissions.canDeleteHousehold(role),
                    "$role should NOT be able to delete household",
                )
            }
        }
    }

    @Test
    fun onlyOwner_canManageMembers() {
        HouseholdRole.entries.forEach { role ->
            if (role == HouseholdRole.OWNER) {
                assertTrue(RbacPermissions.canManageMembers(role))
            } else {
                assertFalse(
                    RbacPermissions.canManageMembers(role),
                    "$role should NOT be able to manage members",
                )
            }
        }
    }
}
