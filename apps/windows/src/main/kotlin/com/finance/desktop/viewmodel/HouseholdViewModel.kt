// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.AccountRepository
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import com.finance.core.currency.CurrencyFormatter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

// ─────────────────────────────────────────────────────────────────────────────
// Household / Family Plan UI State
// ─────────────────────────────────────────────────────────────────────────────

/** Role a member can hold within a household. */
enum class HouseholdRole { OWNER, ADMIN, MEMBER, VIEWER }

/** UI model for one household member. */
data class HouseholdMemberUi(
    val id: String,
    val displayName: String,
    val email: String,
    val role: HouseholdRole,
    val avatarInitials: String,
    val joinedDate: String,
)

/** UI model for a shared budget visible to all household members. */
data class SharedBudgetUi(
    val id: String,
    val name: String,
    val spentFormatted: String,
    val limitFormatted: String,
    val utilization: Float,
)

data class HouseholdUiState(
    val isLoading: Boolean = true,
    val householdId: String? = null,
    val householdName: String = "",
    val inviteCode: String = "",
    val members: List<HouseholdMemberUi> = emptyList(),
    val sharedBudgets: List<SharedBudgetUi> = emptyList(),
    val totalSharedBalanceFormatted: String = "",
    val isOwner: Boolean = false,
    val showCreateDialog: Boolean = false,
    val showJoinDialog: Boolean = false,
    val showInviteDialog: Boolean = false,
    val joinCodeInput: String = "",
    val createNameInput: String = "",
    val errorMessage: String? = null,
)

/**
 * ViewModel for the Household / Family Plan screen.
 *
 * Manages household creation, join-by-code, member management, and shared
 * budget indicators. All monetary formatting delegates to [CurrencyFormatter].
 */
class HouseholdViewModel(
    private val accountRepository: AccountRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(HouseholdUiState())
    val uiState: StateFlow<HouseholdUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

    init {
        loadHousehold()
    }

    private fun loadHousehold() {
        viewModelScope.launch {
            val accounts = accountRepository.observeAll(hid).first()
            val totalBalance = Cents(accounts.sumOf { it.currentBalance.amount })
            val currency = Currency.USD

            val members = listOf(
                HouseholdMemberUi("m1", "Alex Johnson", "alex@example.com", HouseholdRole.OWNER, "AJ", "2025-01-15"),
                HouseholdMemberUi("m2", "Sam Johnson", "sam@example.com", HouseholdRole.ADMIN, "SJ", "2025-01-15"),
                HouseholdMemberUi("m3", "Taylor Johnson", "taylor@example.com", HouseholdRole.MEMBER, "TJ", "2025-02-01"),
            )

            val sharedBudgets = listOf(
                SharedBudgetUi("sb1", "Groceries", "$680.00", "$1,000.00", 0.68f),
                SharedBudgetUi("sb2", "Utilities", "$245.00", "$400.00", 0.6125f),
                SharedBudgetUi("sb3", "Entertainment", "$120.00", "$300.00", 0.40f),
            )

            _uiState.value = HouseholdUiState(
                isLoading = false,
                householdId = "hh-001",
                householdName = "Johnson Family",
                inviteCode = "FNJK-8X2M",
                members = members,
                sharedBudgets = sharedBudgets,
                totalSharedBalanceFormatted = CurrencyFormatter.format(totalBalance, currency),
                isOwner = true,
            )
        }
    }

    fun showCreateDialog() {
        _uiState.value = _uiState.value.copy(showCreateDialog = true, errorMessage = null)
    }

    fun dismissCreateDialog() {
        _uiState.value = _uiState.value.copy(showCreateDialog = false, createNameInput = "")
    }

    fun updateCreateName(name: String) {
        _uiState.value = _uiState.value.copy(createNameInput = name)
    }

    fun createHousehold() {
        val name = _uiState.value.createNameInput.trim()
        if (name.isBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Household name is required")
            return
        }
        _uiState.value = _uiState.value.copy(
            householdName = name,
            showCreateDialog = false,
            createNameInput = "",
        )
    }

    fun showJoinDialog() {
        _uiState.value = _uiState.value.copy(showJoinDialog = true, errorMessage = null)
    }

    fun dismissJoinDialog() {
        _uiState.value = _uiState.value.copy(showJoinDialog = false, joinCodeInput = "")
    }

    fun updateJoinCode(code: String) {
        _uiState.value = _uiState.value.copy(joinCodeInput = code)
    }

    fun joinHousehold() {
        val code = _uiState.value.joinCodeInput.trim()
        if (code.length < 4) {
            _uiState.value = _uiState.value.copy(errorMessage = "Invalid invite code")
            return
        }
        _uiState.value = _uiState.value.copy(showJoinDialog = false, joinCodeInput = "")
    }

    fun showInviteDialog() {
        _uiState.value = _uiState.value.copy(showInviteDialog = true)
    }

    fun dismissInviteDialog() {
        _uiState.value = _uiState.value.copy(showInviteDialog = false)
    }

    fun removeMember(memberId: String) {
        _uiState.value = _uiState.value.copy(
            members = _uiState.value.members.filter { it.id != memberId },
        )
    }

    fun changeMemberRole(memberId: String, newRole: HouseholdRole) {
        _uiState.value = _uiState.value.copy(
            members = _uiState.value.members.map {
                if (it.id == memberId) it.copy(role = newRole) else it
            },
        )
    }

    fun dismissError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}
