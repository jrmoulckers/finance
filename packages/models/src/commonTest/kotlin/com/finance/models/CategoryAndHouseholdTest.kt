// SPDX-License-Identifier: BUSL-1.1

package com.finance.models

import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for [Category], [Household], [HouseholdMember], and [User] data classes.
 *
 * These models are simpler but their init-validation and defaults must be verified.
 */
class CategoryAndHouseholdTest {

    private val now = Instant.parse("2024-01-15T12:00:00Z")
    private val householdId = SyncId("household-1")
    private val userId = SyncId("user-1")

    // ══════════════════════════════════════════════════════════════════════
    //  Category
    // ══════════════════════════════════════════════════════════════════════

    private fun category(name: String = "Groceries") = Category(
        id = SyncId("cat-1"),
        householdId = householdId,
        name = name,
        createdAt = now,
        updatedAt = now,
    )

    @Test
    fun createValidCategory() {
        val cat = category()
        assertEquals("Groceries", cat.name)
    }

    @Test
    fun rejectBlankCategoryName() {
        assertFailsWith<IllegalArgumentException> { category(name = "") }
    }

    @Test
    fun rejectWhitespaceCategoryName() {
        assertFailsWith<IllegalArgumentException> { category(name = "   ") }
    }

    @Test
    fun categoryDefaultParentIdIsNull() {
        assertNull(category().parentId)
    }

    @Test
    fun categoryDefaultIsIncomeFalse() {
        assertEquals(false, category().isIncome)
    }

    @Test
    fun categoryDefaultIsSystemFalse() {
        assertEquals(false, category().isSystem)
    }

    @Test
    fun categoryDefaultSortOrderIsZero() {
        assertEquals(0, category().sortOrder)
    }

    @Test
    fun categoryDefaultIconIsNull() {
        assertNull(category().icon)
    }

    @Test
    fun categoryDefaultColorIsNull() {
        assertNull(category().color)
    }

    @Test
    fun categorySubcategoryWithParent() {
        val sub = Category(
            id = SyncId("cat-2"),
            householdId = householdId,
            name = "Produce",
            parentId = SyncId("cat-1"),
            createdAt = now,
            updatedAt = now,
        )
        assertEquals(SyncId("cat-1"), sub.parentId)
    }

    @Test
    fun categoryAsIncomeCategory() {
        val income = Category(
            id = SyncId("cat-3"),
            householdId = householdId,
            name = "Salary",
            isIncome = true,
            createdAt = now,
            updatedAt = now,
        )
        assertTrue(income.isIncome)
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Household
    // ══════════════════════════════════════════════════════════════════════

    @Test
    fun createValidHousehold() {
        val h = Household(
            id = householdId,
            name = "Smith Family",
            ownerId = userId,
            createdAt = now,
            updatedAt = now,
        )
        assertEquals("Smith Family", h.name)
        assertEquals(userId, h.ownerId)
    }

    @Test
    fun householdDefaultDeletedAtIsNull() {
        val h = Household(
            id = householdId,
            name = "Test",
            ownerId = userId,
            createdAt = now,
            updatedAt = now,
        )
        assertNull(h.deletedAt)
    }

    @Test
    fun householdDefaultSyncVersionIsZero() {
        val h = Household(
            id = householdId,
            name = "Test",
            ownerId = userId,
            createdAt = now,
            updatedAt = now,
        )
        assertEquals(0L, h.syncVersion)
    }

    // ══════════════════════════════════════════════════════════════════════
    //  HouseholdMember
    // ══════════════════════════════════════════════════════════════════════

    @Test
    fun createValidHouseholdMember() {
        val member = HouseholdMember(
            id = SyncId("member-1"),
            householdId = householdId,
            userId = userId,
            role = HouseholdRole.OWNER,
            joinedAt = now,
            createdAt = now,
            updatedAt = now,
        )
        assertEquals(HouseholdRole.OWNER, member.role)
        assertEquals(userId, member.userId)
    }

    @Test
    fun allHouseholdRolesExist() {
        val roles = HouseholdRole.entries
        assertEquals(4, roles.size)
        assertTrue(roles.contains(HouseholdRole.OWNER))
        assertTrue(roles.contains(HouseholdRole.PARTNER))
        assertTrue(roles.contains(HouseholdRole.MEMBER))
        assertTrue(roles.contains(HouseholdRole.VIEWER))
    }

    @Test
    fun householdMemberDefaultDeletedAtIsNull() {
        val member = HouseholdMember(
            id = SyncId("member-1"),
            householdId = householdId,
            userId = userId,
            role = HouseholdRole.MEMBER,
            joinedAt = now,
            createdAt = now,
            updatedAt = now,
        )
        assertNull(member.deletedAt)
    }

    // ══════════════════════════════════════════════════════════════════════
    //  User
    // ══════════════════════════════════════════════════════════════════════

    @Test
    fun createValidUser() {
        val user = User(
            id = userId,
            email = "jane@example.com",
            displayName = "Jane Doe",
            createdAt = now,
            updatedAt = now,
        )
        assertEquals("jane@example.com", user.email)
        assertEquals("Jane Doe", user.displayName)
    }

    @Test
    fun userDefaultCurrencyIsUSD() {
        val user = User(
            id = userId,
            email = "test@example.com",
            displayName = "Test",
            createdAt = now,
            updatedAt = now,
        )
        assertEquals(com.finance.models.types.Currency.USD, user.defaultCurrency)
    }

    @Test
    fun userDefaultAvatarUrlIsNull() {
        val user = User(
            id = userId,
            email = "test@example.com",
            displayName = "Test",
            createdAt = now,
            updatedAt = now,
        )
        assertNull(user.avatarUrl)
    }

    @Test
    fun userDefaultDeletedAtIsNull() {
        val user = User(
            id = userId,
            email = "test@example.com",
            displayName = "Test",
            createdAt = now,
            updatedAt = now,
        )
        assertNull(user.deletedAt)
    }

    @Test
    fun userSyncMetadataDefaults() {
        val user = User(
            id = userId,
            email = "test@example.com",
            displayName = "Test",
            createdAt = now,
            updatedAt = now,
        )
        assertEquals(0L, user.syncVersion)
        assertEquals(false, user.isSynced)
    }
}
