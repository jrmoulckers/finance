// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.household

import com.finance.models.HouseholdRole
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlin.test.*

class InvitationStateMachineTest {

    private val baseTime = Instant.parse("2024-06-15T12:00:00Z")

    private fun createInvitation(
        status: InvitationStatus = InvitationStatus.PENDING,
        createdAt: Instant = baseTime,
        ttlSeconds: Long = InvitationStateMachine.DEFAULT_TTL_SECONDS,
    ) = Invitation(SyncId("inv-1"), SyncId("household-1"), SyncId("owner-1"), "test@example.com", HouseholdRole.MEMBER, status, "ABC123", ttlSeconds, null, createdAt, createdAt)

    @Test fun pendingInvitation_canBeAccepted() { val r = InvitationStateMachine.transition(createInvitation(), InvitationAction.ACCEPT, Instant.parse("2024-06-16T12:00:00Z")); assertIs<TransitionResult.Success>(r); assertEquals(InvitationStatus.ACCEPTED, r.invitation.status) }
    @Test fun pendingInvitation_canBeDeclined() { val r = InvitationStateMachine.transition(createInvitation(), InvitationAction.DECLINE, Instant.parse("2024-06-16T12:00:00Z")); assertIs<TransitionResult.Success>(r); assertEquals(InvitationStatus.DECLINED, r.invitation.status) }
    @Test fun pendingInvitation_canBeRevoked() { val r = InvitationStateMachine.transition(createInvitation(), InvitationAction.REVOKE, Instant.parse("2024-06-16T12:00:00Z")); assertIs<TransitionResult.Success>(r); assertEquals(InvitationStatus.REVOKED, r.invitation.status) }
    @Test fun pendingInvitation_canBeExpired() { val r = InvitationStateMachine.transition(createInvitation(), InvitationAction.EXPIRE, Instant.parse("2024-06-16T12:00:00Z")); assertIs<TransitionResult.Success>(r); assertEquals(InvitationStatus.EXPIRED, r.invitation.status) }

    @Test fun expiredByTTL_cannotBeAccepted() {
        val inv = createInvitation(ttlSeconds = 3600)
        val r = InvitationStateMachine.transition(inv, InvitationAction.ACCEPT, Instant.fromEpochSeconds(baseTime.epochSeconds + 7200))
        assertIs<TransitionResult.InvalidTransition>(r); assertEquals(InvitationStatus.EXPIRED, r.currentStatus)
    }

    @Test fun acceptedInvitation_cannotTransition() { assertIs<TransitionResult.InvalidTransition>(InvitationStateMachine.transition(createInvitation(status = InvitationStatus.ACCEPTED), InvitationAction.REVOKE, Instant.parse("2024-06-17T12:00:00Z"))) }
    @Test fun declinedInvitation_cannotTransition() { assertIs<TransitionResult.InvalidTransition>(InvitationStateMachine.transition(createInvitation(status = InvitationStatus.DECLINED), InvitationAction.ACCEPT, Instant.parse("2024-06-17T12:00:00Z"))) }
    @Test fun revokedInvitation_cannotTransition() { assertIs<TransitionResult.InvalidTransition>(InvitationStateMachine.transition(createInvitation(status = InvitationStatus.REVOKED), InvitationAction.ACCEPT, Instant.parse("2024-06-17T12:00:00Z"))) }
    @Test fun expiredInvitation_cannotTransition() { assertIs<TransitionResult.InvalidTransition>(InvitationStateMachine.transition(createInvitation(status = InvitationStatus.EXPIRED), InvitationAction.ACCEPT, Instant.parse("2024-06-17T12:00:00Z"))) }

    @Test fun isExpired_withinTTL_false() { assertFalse(InvitationStateMachine.isExpired(createInvitation(ttlSeconds = 86400), Instant.fromEpochSeconds(baseTime.epochSeconds + 3600))) }
    @Test fun isExpired_pastTTL_true() { assertTrue(InvitationStateMachine.isExpired(createInvitation(ttlSeconds = 3600), Instant.fromEpochSeconds(baseTime.epochSeconds + 7200))) }
    @Test fun isExpired_nonPending_false() { assertFalse(InvitationStateMachine.isExpired(createInvitation(status = InvitationStatus.ACCEPTED, ttlSeconds = 1), Instant.fromEpochSeconds(baseTime.epochSeconds + 86400))) }

    @Test fun expireStale_marksCorrectly() {
        val fresh = createInvitation(ttlSeconds = 86400)
        val stale = createInvitation(ttlSeconds = 100).copy(id = SyncId("inv-2"), inviteCode = "DEF456")
        val accepted = createInvitation(status = InvitationStatus.ACCEPTED).copy(id = SyncId("inv-3"), inviteCode = "GHI789")
        val result = InvitationStateMachine.expireStale(listOf(fresh, stale, accepted), Instant.fromEpochSeconds(baseTime.epochSeconds + 3600))
        assertEquals(InvitationStatus.PENDING, result[0].status); assertEquals(InvitationStatus.EXPIRED, result[1].status); assertEquals(InvitationStatus.ACCEPTED, result[2].status)
    }
}
