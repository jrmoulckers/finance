// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.household

/**
 * Outcome of a household member invitation attempt.
 * Modelled as a sealed hierarchy for exhaustive `when` handling.
 */
sealed class InviteResult {

    /**
     * Invitation was created successfully.
     * @param code Single-use invite code to share with the invitee.
     */
    data class Success(val code: String) : InviteResult()

    /** The invited email is already a member of this household. */
    data object AlreadyMember : InviteResult()

    /** The household has reached its maximum member count. */
    data object HouseholdFull : InviteResult()

    /** The provided email address failed validation. */
    data object InvalidEmail : InviteResult()
}
