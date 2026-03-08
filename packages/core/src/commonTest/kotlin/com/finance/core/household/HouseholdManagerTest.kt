// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.household

import com.finance.core.TestFixtures
import com.finance.models.Household
import com.finance.models.HouseholdMember
import com.finance.models.HouseholdRole
import com.finance.models.types.SyncId
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.*

/**
 * Tests for [HouseholdManager] contract using an in-memory fake.
 * Verifies create -> invite -> accept -> remove -> updateRole flows.
 */
class HouseholdManagerTest {

    private lateinit var manager: FakeHouseholdManager

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
        manager = FakeHouseholdManager()
    }

    // -- createHousehold --

    @Test
    fun createHousehold_returnsHouseholdWithOwner() = runTest {
        val ownerId = TestFixtures.nextId()
        val household = manager.createHousehold("Test Family", ownerId)

        assertEquals("Test Family", household.name)
        assertEquals(ownerId, household.ownerId)

        // Owner should be added as a member automatically
        val members = manager.membersOf(household.id)
        assertEquals(1, members.size)
        assertEquals(HouseholdRole.OWNER, members.first().role)
        assertEquals(ownerId, members.first().userId)
    }

    @Test
    fun createHousehold_generatesUniqueSyncIds() = runTest {
        val h1 = manager.createHousehold("Family A", TestFixtures.nextId())
        val h2 = manager.createHousehold("Family B", TestFixtures.nextId())
        assertNotEquals(h1.id, h2.id)
    }

    // -- inviteMember --

    @Test
    fun inviteMember_success_returnsCode() = runTest {
        val household = manager.createHousehold("Family", TestFixtures.nextId())
        val result = manager.inviteMember(household.id, "partner@test.com", HouseholdRole.PARTNER)

        assertIs<InviteResult.Success>(result)
        assertTrue(result.code.isNotBlank())
    }

    @Test
    fun inviteMember_invalidEmail_returnsInvalidEmail() = runTest {
        val household = manager.createHousehold("Family", TestFixtures.nextId())
        val result = manager.inviteMember(household.id, "not-an-email", HouseholdRole.MEMBER)

        assertIs<InviteResult.InvalidEmail>(result)
    }

    @Test
    fun inviteMember_alreadyMember_returnsAlreadyMember() = runTest {
        val ownerId = TestFixtures.nextId()
        val household = manager.createHousehold("Family", ownerId)

        // Accept an invite first
        val invite = manager.inviteMember(household.id, "user@test.com", HouseholdRole.MEMBER)
        assertIs<InviteResult.Success>(invite)
        val userId = TestFixtures.nextId()
        manager.acceptInvite(invite.code, userId)

        // Mark user email in the fake so duplicate detection works
        manager.setUserEmail(userId, "user@test.com")

        // Try inviting the same email again
        val duplicate = manager.inviteMember(household.id, "user@test.com", HouseholdRole.MEMBER)
        assertIs<InviteResult.AlreadyMember>(duplicate)
    }

    @Test
    fun inviteMember_householdFull_returnsHouseholdFull() = runTest {
        val household = manager.createHousehold("Tiny Family", TestFixtures.nextId())

        // Fill up the household to max capacity (fake uses max = 6)
        repeat(FakeHouseholdManager.MAX_MEMBERS - 1) { i ->
            val invite = manager.inviteMember(household.id, "user$i@test.com", HouseholdRole.MEMBER)
            assertIs<InviteResult.Success>(invite)
            manager.acceptInvite(invite.code, TestFixtures.nextId())
        }

        // One more should fail
        val result = manager.inviteMember(household.id, "overflow@test.com", HouseholdRole.MEMBER)
        assertIs<InviteResult.HouseholdFull>(result)
    }

    // -- acceptInvite --

    @Test
    fun acceptInvite_validCode_addsMember() = runTest {
        val household = manager.createHousehold("Family", TestFixtures.nextId())
        val invite = manager.inviteMember(household.id, "new@test.com", HouseholdRole.PARTNER)
        assertIs<InviteResult.Success>(invite)

        val userId = TestFixtures.nextId()
        val result = manager.acceptInvite(invite.code, userId)

        assertTrue(result.isSuccess)
        val member = result.getOrThrow()
        assertEquals(HouseholdRole.PARTNER, member.role)
        assertEquals(userId, member.userId)
        assertEquals(household.id, member.householdId)
    }

    @Test
    fun acceptInvite_invalidCode_returnsFailure() = runTest {
        val result = manager.acceptInvite("bogus-code", TestFixtures.nextId())
        assertTrue(result.isFailure)
    }

    @Test
    fun acceptInvite_codeCannotBeReusedTwice() = runTest {
        val household = manager.createHousehold("Family", TestFixtures.nextId())
        val invite = manager.inviteMember(household.id, "new@test.com", HouseholdRole.MEMBER)
        assertIs<InviteResult.Success>(invite)

        // First use succeeds
        val first = manager.acceptInvite(invite.code, TestFixtures.nextId())
        assertTrue(first.isSuccess)

        // Second use fails
        val second = manager.acceptInvite(invite.code, TestFixtures.nextId())
        assertTrue(second.isFailure)
    }

    // -- removeMember --

    @Test
    fun removeMember_removesMemberFromHousehold() = runTest {
        val household = manager.createHousehold("Family", TestFixtures.nextId())
        val invite = manager.inviteMember(household.id, "doomed@test.com", HouseholdRole.MEMBER)
        assertIs<InviteResult.Success>(invite)

        val memberId = TestFixtures.nextId()
        val result = manager.acceptInvite(invite.code, memberId)
        assertTrue(result.isSuccess)
        val member = result.getOrThrow()

        assertEquals(2, manager.membersOf(household.id).size)

        manager.removeMember(household.id, member.id)

        assertEquals(1, manager.membersOf(household.id).size)
    }

    @Test
    fun removeMember_ownerCannotBeRemoved() = runTest {
        val ownerId = TestFixtures.nextId()
        val household = manager.createHousehold("Family", ownerId)
        val ownerMember = manager.membersOf(household.id).first { it.role == HouseholdRole.OWNER }

        assertFailsWith<IllegalStateException> {
            manager.removeMember(household.id, ownerMember.id)
        }
    }

    // -- updateRole --

    @Test
    fun updateRole_changeMemberRole() = runTest {
        val household = manager.createHousehold("Family", TestFixtures.nextId())
        val invite = manager.inviteMember(household.id, "member@test.com", HouseholdRole.MEMBER)
        assertIs<InviteResult.Success>(invite)

        val result = manager.acceptInvite(invite.code, TestFixtures.nextId())
        assertTrue(result.isSuccess)
        val member = result.getOrThrow()

        assertEquals(HouseholdRole.MEMBER, member.role)

        manager.updateRole(household.id, member.id, HouseholdRole.PARTNER)

        val updated = manager.membersOf(household.id).first { it.id == member.id }
        assertEquals(HouseholdRole.PARTNER, updated.role)
    }

    @Test
    fun updateRole_cannotDemoteOnlyOwner() = runTest {
        val ownerId = TestFixtures.nextId()
        val household = manager.createHousehold("Family", ownerId)
        val ownerMember = manager.membersOf(household.id).first { it.role == HouseholdRole.OWNER }

        assertFailsWith<IllegalStateException> {
            manager.updateRole(household.id, ownerMember.id, HouseholdRole.MEMBER)
        }
    }
}

// -- In-memory fake implementing HouseholdManager for test purposes --

/**
 * Minimal in-memory implementation of [HouseholdManager] used only in tests.
 * Keeps all state in-memory maps — no persistence, no I/O.
 */
internal class FakeHouseholdManager : HouseholdManager {

    companion object {
        const val MAX_MEMBERS = 6
    }

    private var idCounter = 1000

    private val households = mutableMapOf<SyncId, Household>()
    private val members = mutableMapOf<SyncId, MutableList<HouseholdMember>>()
    private val userEmails = mutableMapOf<SyncId, String>()

    /** Pending invites: code -> (householdId, email, role) */
    private data class PendingInvite(
        val householdId: SyncId,
        val email: String,
        val role: HouseholdRole,
    )

    private val pendingInvites = mutableMapOf<String, PendingInvite>()

    private fun nextId(): SyncId = SyncId("fake-${++idCounter}")
    private fun now(): Instant = Clock.System.now()

    /** Expose members for test assertions. */
    fun membersOf(householdId: SyncId): List<HouseholdMember> =
        members[householdId].orEmpty()

    /** Associate a userId with an email for duplicate-member detection. */
    fun setUserEmail(userId: SyncId, email: String) {
        userEmails[userId] = email
    }

    override suspend fun createHousehold(name: String, ownerId: SyncId): Household {
        val id = nextId()
        val timestamp = now()
        val household = Household(
            id = id,
            name = name,
            ownerId = ownerId,
            createdAt = timestamp,
            updatedAt = timestamp,
        )
        households[id] = household

        val ownerMember = HouseholdMember(
            id = nextId(),
            householdId = id,
            userId = ownerId,
            role = HouseholdRole.OWNER,
            joinedAt = timestamp,
            createdAt = timestamp,
            updatedAt = timestamp,
        )
        members[id] = mutableListOf(ownerMember)
        return household
    }

    override suspend fun inviteMember(
        householdId: SyncId,
        email: String,
        role: HouseholdRole,
    ): InviteResult {
        // Basic email validation
        if (!email.contains("@") || !email.contains(".")) {
            return InviteResult.InvalidEmail
        }

        val currentMembers = members[householdId] ?: return InviteResult.InvalidEmail

        // Check if email already belongs to an existing member
        val memberUserIds = currentMembers.map { it.userId }.toSet()
        val emailAlreadyMember = memberUserIds.any { uid -> userEmails[uid] == email }
        if (emailAlreadyMember) {
            return InviteResult.AlreadyMember
        }

        // Check capacity
        if (currentMembers.size >= MAX_MEMBERS) {
            return InviteResult.HouseholdFull
        }

        val code = "invite-${++idCounter}"
        pendingInvites[code] = PendingInvite(householdId, email, role)
        return InviteResult.Success(code)
    }

    override suspend fun acceptInvite(inviteCode: String, userId: SyncId): Result<HouseholdMember> {
        val invite = pendingInvites.remove(inviteCode)
            ?: return Result.failure(IllegalArgumentException("Invalid or expired invite code"))

        val timestamp = now()
        val member = HouseholdMember(
            id = nextId(),
            householdId = invite.householdId,
            userId = userId,
            role = invite.role,
            joinedAt = timestamp,
            createdAt = timestamp,
            updatedAt = timestamp,
        )
        members.getOrPut(invite.householdId) { mutableListOf() }.add(member)
        return Result.success(member)
    }

    override suspend fun removeMember(householdId: SyncId, memberId: SyncId) {
        val memberList = members[householdId]
            ?: error("Household not found: ${householdId.value}")

        val target = memberList.firstOrNull { it.id == memberId }
            ?: error("Member not found: ${memberId.value}")

        if (target.role == HouseholdRole.OWNER) {
            error("Cannot remove the owner from the household")
        }

        memberList.removeAll { it.id == memberId }
    }

    override suspend fun updateRole(householdId: SyncId, memberId: SyncId, role: HouseholdRole) {
        val memberList = members[householdId]
            ?: error("Household not found: ${householdId.value}")

        val index = memberList.indexOfFirst { it.id == memberId }
        if (index == -1) error("Member not found: ${memberId.value}")

        val target = memberList[index]

        // Cannot demote the sole owner
        if (target.role == HouseholdRole.OWNER && role != HouseholdRole.OWNER) {
            val ownerCount = memberList.count { it.role == HouseholdRole.OWNER }
            if (ownerCount <= 1) {
                error("Cannot demote the only owner of the household")
            }
        }

        memberList[index] = target.copy(role = role, updatedAt = now())
    }
}
