// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.household

import com.finance.models.HouseholdRole
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * Invitation lifecycle state machine for household membership.
 *
 * States: PENDING -> ACCEPTED | DECLINED | EXPIRED | REVOKED
 * All terminal states are final (no further transitions).
 */
object InvitationStateMachine {

    const val DEFAULT_TTL_SECONDS: Long = 7 * 24 * 60 * 60

    fun transition(
        invitation: Invitation,
        action: InvitationAction,
        now: Instant,
    ): TransitionResult {
        val effectiveStatus = if (invitation.status == InvitationStatus.PENDING && isExpired(invitation, now)) {
            InvitationStatus.EXPIRED
        } else {
            invitation.status
        }

        if (effectiveStatus != InvitationStatus.PENDING) {
            return TransitionResult.InvalidTransition(
                currentStatus = effectiveStatus,
                attemptedAction = action,
                reason = "Invitation is already ${effectiveStatus.name.lowercase()}",
            )
        }

        val newStatus = when (action) {
            InvitationAction.ACCEPT -> InvitationStatus.ACCEPTED
            InvitationAction.DECLINE -> InvitationStatus.DECLINED
            InvitationAction.EXPIRE -> InvitationStatus.EXPIRED
            InvitationAction.REVOKE -> InvitationStatus.REVOKED
        }

        return TransitionResult.Success(
            invitation.copy(status = newStatus, respondedAt = now, updatedAt = now),
        )
    }

    fun isExpired(invitation: Invitation, now: Instant): Boolean {
        if (invitation.status != InvitationStatus.PENDING) return false
        val elapsed = now.epochSeconds - invitation.createdAt.epochSeconds
        return elapsed > (invitation.ttlSeconds ?: DEFAULT_TTL_SECONDS)
    }

    fun expireStale(invitations: List<Invitation>, now: Instant): List<Invitation> {
        return invitations.map { inv ->
            if (inv.status == InvitationStatus.PENDING && isExpired(inv, now)) {
                inv.copy(status = InvitationStatus.EXPIRED, updatedAt = now)
            } else {
                inv
            }
        }
    }
}

@Serializable
data class Invitation(
    val id: SyncId,
    val householdId: SyncId,
    val inviterUserId: SyncId,
    val inviteeEmail: String,
    val role: HouseholdRole,
    val status: InvitationStatus = InvitationStatus.PENDING,
    val inviteCode: String,
    val ttlSeconds: Long? = InvitationStateMachine.DEFAULT_TTL_SECONDS,
    val respondedAt: Instant? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
)

@Serializable
enum class InvitationStatus { PENDING, ACCEPTED, DECLINED, EXPIRED, REVOKED }

@Serializable
enum class InvitationAction { ACCEPT, DECLINE, EXPIRE, REVOKE }

sealed class TransitionResult {
    data class Success(val invitation: Invitation) : TransitionResult()
    data class InvalidTransition(
        val currentStatus: InvitationStatus,
        val attemptedAction: InvitationAction,
        val reason: String,
    ) : TransitionResult()
}
