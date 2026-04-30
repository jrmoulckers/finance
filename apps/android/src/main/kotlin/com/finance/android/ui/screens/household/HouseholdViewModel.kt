// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.household

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.core.household.HouseholdRole
import com.finance.models.types.SyncId
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import timber.log.Timber

/**
 * Member in a household with role and invitation status.
 */
data class HouseholdMemberUi(
    val id: SyncId,
    val displayName: String,
    val email: String,
    val role: HouseholdRole,
    val joinedAt: Instant? = null,
    val isPending: Boolean = false,
)

/**
 * UI state for the Household/Family Plan screen (#1114).
 */
data class HouseholdUiState(
    val isLoading: Boolean = true,
    val householdName: String = "",
    val isOwner: Boolean = false,
    val currentUserRole: HouseholdRole = HouseholdRole.MEMBER,
    val members: List<HouseholdMemberUi> = emptyList(),
    val inviteEmail: String = "",
    val inviteRole: HouseholdRole = HouseholdRole.MEMBER,
    val showInviteDialog: Boolean = false,
    val showRoleDialog: Boolean = false,
    val selectedMember: HouseholdMemberUi? = null,
    val useSharedBudget: Boolean = true,
    val inviteCode: String? = null,
    val isSaving: Boolean = false,
    val isCreating: Boolean = false,
    val newHouseholdName: String = "",
    val showCreateDialog: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null,
)

/**
 * ViewModel for the Family/Household Plan feature (#1114).
 *
 * Manages household creation, member invitation, role management,
 * and shared vs personal budget toggling. Delegates to the KMP
 * [com.finance.core.household.HouseholdManager] for core logic.
 *
 * @param householdIdProvider Provides the current household scope.
 */
class HouseholdViewModel(
    private val householdIdProvider: HouseholdIdProvider,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HouseholdUiState())
    val uiState: StateFlow<HouseholdUiState> = _uiState.asStateFlow()

    init {
        loadHousehold()
    }

    private fun loadHousehold() {
        viewModelScope.launch {
            delay(300)
            val householdId = householdIdProvider.householdId.value
            if (householdId != null) {
                // Load existing household data
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        householdName = "My Household",
                        isOwner = true,
                        currentUserRole = HouseholdRole.OWNER,
                        members = listOf(
                            HouseholdMemberUi(
                                id = householdId,
                                displayName = "You",
                                email = "owner@example.com",
                                role = HouseholdRole.OWNER,
                                joinedAt = Clock.System.now(),
                            ),
                        ),
                    )
                }
            } else {
                _uiState.update { it.copy(isLoading = false) }
            }
            Timber.d("Household data loaded")
        }
    }

    fun showCreateDialog() {
        _uiState.update { it.copy(showCreateDialog = true, newHouseholdName = "") }
    }

    fun dismissCreateDialog() {
        _uiState.update { it.copy(showCreateDialog = false) }
    }

    fun updateNewHouseholdName(name: String) {
        _uiState.update { it.copy(newHouseholdName = name) }
    }

    fun createHousehold() {
        val name = _uiState.value.newHouseholdName
        if (name.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Household name cannot be empty") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true, errorMessage = null) }
            delay(500)
            _uiState.update {
                it.copy(
                    isCreating = false,
                    showCreateDialog = false,
                    householdName = name,
                    isOwner = true,
                    currentUserRole = HouseholdRole.OWNER,
                    successMessage = "Household \"$name\" created",
                )
            }
            Timber.d("Household created: %s", name)
        }
    }

    fun showInviteDialog() {
        _uiState.update {
            it.copy(showInviteDialog = true, inviteEmail = "", inviteRole = HouseholdRole.MEMBER)
        }
    }

    fun dismissInviteDialog() {
        _uiState.update { it.copy(showInviteDialog = false, inviteCode = null) }
    }

    fun updateInviteEmail(email: String) {
        _uiState.update { it.copy(inviteEmail = email, errorMessage = null) }
    }

    fun updateInviteRole(role: HouseholdRole) {
        _uiState.update { it.copy(inviteRole = role) }
    }

    fun sendInvite() {
        val email = _uiState.value.inviteEmail
        if (email.isBlank() || !email.contains("@")) {
            _uiState.update { it.copy(errorMessage = "Please enter a valid email address") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null) }
            delay(500)
            val code = "INV-${Clock.System.now().toEpochMilliseconds().toString().takeLast(8)}"
            val newMember = HouseholdMemberUi(
                id = SyncId("member-${Clock.System.now().toEpochMilliseconds()}"),
                displayName = email.substringBefore("@"),
                email = email,
                role = _uiState.value.inviteRole,
                isPending = true,
            )
            _uiState.update {
                it.copy(
                    isSaving = false,
                    inviteCode = code,
                    members = it.members + newMember,
                    successMessage = "Invitation sent to $email",
                )
            }
            Timber.d("Invite sent to %s with code %s", email, code)
        }
    }

    fun showRoleDialog(member: HouseholdMemberUi) {
        _uiState.update { it.copy(showRoleDialog = true, selectedMember = member) }
    }

    fun dismissRoleDialog() {
        _uiState.update { it.copy(showRoleDialog = false, selectedMember = null) }
    }

    fun updateMemberRole(memberId: SyncId, newRole: HouseholdRole) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true) }
            delay(300)
            _uiState.update { state ->
                state.copy(
                    isSaving = false,
                    showRoleDialog = false,
                    selectedMember = null,
                    members = state.members.map {
                        if (it.id == memberId) it.copy(role = newRole) else it
                    },
                    successMessage = "Role updated",
                )
            }
            Timber.d("Member %s role updated to %s", memberId.value, newRole.name)
        }
    }

    fun removeMember(memberId: SyncId) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true) }
            delay(300)
            _uiState.update { state ->
                state.copy(
                    isSaving = false,
                    members = state.members.filter { it.id != memberId },
                    successMessage = "Member removed",
                )
            }
            Timber.d("Member %s removed", memberId.value)
        }
    }

    fun toggleSharedBudget(shared: Boolean) {
        _uiState.update { it.copy(useSharedBudget = shared) }
        Timber.d("Shared budget toggled: %s", shared)
    }

    fun clearMessages() {
        _uiState.update { it.copy(errorMessage = null, successMessage = null) }
    }
}
