// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.data.repository.BudgetRepository
import com.finance.desktop.data.repository.CategoryRepository
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * A budget change proposal from a household member.
 */
data class BudgetProposal(
    val id: String,
    val categoryName: String,
    val proposedBy: String,
    val currentAmountFormatted: String,
    val proposedAmountFormatted: String,
    val changePercent: Int,
    val reason: String,
    val status: ProposalStatus,
    val votes: List<ProposalVote>,
    val comments: List<ProposalComment>,
    val createdAt: String,
)

enum class ProposalStatus(val displayName: String) {
    PENDING("Pending"),
    APPROVED("Approved"),
    REJECTED("Rejected"),
    WITHDRAWN("Withdrawn"),
}

data class ProposalVote(
    val memberName: String,
    val approve: Boolean,
    val timestamp: String,
)

data class ProposalComment(
    val id: String,
    val memberName: String,
    val text: String,
    val timestamp: String,
)

data class HouseholdMember(
    val id: String,
    val name: String,
    val role: String,
    val isCurrentUser: Boolean = false,
)

/**
 * UI state for the budget negotiation screen.
 */
data class BudgetNegotiationUiState(
    val isLoading: Boolean = true,
    val proposals: List<BudgetProposal> = emptyList(),
    val members: List<HouseholdMember> = emptyList(),
    val availableCategories: List<Pair<String, String>> = emptyList(),
    val showCreateDialog: Boolean = false,
    val draftCategory: String = "",
    val draftAmount: String = "",
    val draftReason: String = "",
    val commentDraft: String = "",
    val activeProposalId: String? = null,
    val errorMessage: String? = null,
)

/**
 * ViewModel for collaborative budget negotiation.
 *
 * Manages budget change proposals within a household, enabling members
 * to propose, vote on, and discuss budget adjustments. Proposals go
 * through a workflow: Pending → Approved/Rejected → Applied.
 *
 * In the current implementation, proposals are stored in-memory.
 * When the sync engine is wired, proposals will sync across devices
 * via the KMP shared sync package.
 */
class BudgetNegotiationViewModel(
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(BudgetNegotiationUiState())
    val uiState: StateFlow<BudgetNegotiationUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")
    private val proposals = mutableListOf<BudgetProposal>()
    private var nextId = 1

    // Simulated household members
    private val members = listOf(
        HouseholdMember("m1", "You", "Owner", isCurrentUser = true),
        HouseholdMember("m2", "Partner", "Member"),
    )

    init {
        loadData()
    }

    private fun loadData() {
        viewModelScope.launch {
            val categories = categoryRepository.observeAll(hid).first()
            _uiState.value = BudgetNegotiationUiState(
                isLoading = false,
                proposals = proposals.toList(),
                members = members,
                availableCategories = categories.map { it.id.value to it.name },
            )
        }
    }

    fun showCreateDialog() {
        _uiState.value = _uiState.value.copy(showCreateDialog = true)
    }

    fun dismissCreateDialog() {
        _uiState.value = _uiState.value.copy(
            showCreateDialog = false,
            draftCategory = "",
            draftAmount = "",
            draftReason = "",
        )
    }

    fun updateDraftCategory(value: String) {
        _uiState.value = _uiState.value.copy(draftCategory = value)
    }

    fun updateDraftAmount(value: String) {
        _uiState.value = _uiState.value.copy(draftAmount = value)
    }

    fun updateDraftReason(value: String) {
        _uiState.value = _uiState.value.copy(draftReason = value)
    }

    fun updateCommentDraft(value: String) {
        _uiState.value = _uiState.value.copy(commentDraft = value)
    }

    fun setActiveProposal(proposalId: String?) {
        _uiState.value = _uiState.value.copy(activeProposalId = proposalId, commentDraft = "")
    }

    /**
     * Creates a new budget change proposal.
     */
    fun createProposal() {
        viewModelScope.launch {
            val state = _uiState.value
            val categoryName = state.availableCategories
                .find { it.first == state.draftCategory }?.second ?: state.draftCategory

            val amountCents = (state.draftAmount.toDoubleOrNull() ?: 0.0) * 100
            val currency = Currency.USD
            val now = Clock.System.now()
                .toLocalDateTime(TimeZone.currentSystemDefault())

            // Look up current budget amount for this category
            val budgets = budgetRepository.observeAll(hid).first()
            val existingBudget = budgets.find { it.categoryId.value == state.draftCategory }
            val currentAmount = existingBudget?.amount?.amount ?: 0L
            val changePercent = if (currentAmount > 0) {
                ((amountCents.toLong() - currentAmount) * 100 / currentAmount).toInt()
            } else {
                100
            }

            val proposal = BudgetProposal(
                id = "p${nextId++}",
                categoryName = categoryName,
                proposedBy = "You",
                currentAmountFormatted = CurrencyFormatter.format(
                    Cents(currentAmount), currency,
                ),
                proposedAmountFormatted = CurrencyFormatter.format(
                    Cents(amountCents.toLong()), currency,
                ),
                changePercent = changePercent,
                reason = state.draftReason,
                status = ProposalStatus.PENDING,
                votes = emptyList(),
                comments = emptyList(),
                createdAt = "${now.date} ${now.hour}:${"%02d".format(now.minute)}",
            )

            proposals.add(proposal)
            _uiState.value = state.copy(
                proposals = proposals.toList(),
                showCreateDialog = false,
                draftCategory = "",
                draftAmount = "",
                draftReason = "",
            )
        }
    }

    /**
     * Records a vote on a proposal.
     */
    fun voteOnProposal(proposalId: String, approve: Boolean) {
        val now = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault())
        val vote = ProposalVote(
            memberName = "You",
            approve = approve,
            timestamp = "${now.date} ${now.hour}:${"%02d".format(now.minute)}",
        )

        val index = proposals.indexOfFirst { it.id == proposalId }
        if (index >= 0) {
            val proposal = proposals[index]
            val updatedVotes = proposal.votes.filter { it.memberName != "You" } + vote
            val allVoted = updatedVotes.size >= members.size
            val allApproved = updatedVotes.all { it.approve }

            val newStatus = when {
                allVoted && allApproved -> ProposalStatus.APPROVED
                allVoted && !allApproved -> ProposalStatus.REJECTED
                else -> ProposalStatus.PENDING
            }

            proposals[index] = proposal.copy(
                votes = updatedVotes,
                status = newStatus,
            )
            _uiState.value = _uiState.value.copy(proposals = proposals.toList())
        }
    }

    /**
     * Adds a comment to a proposal.
     */
    fun addComment(proposalId: String) {
        val text = _uiState.value.commentDraft.trim()
        if (text.isEmpty()) return

        val now = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault())
        val comment = ProposalComment(
            id = "c${nextId++}",
            memberName = "You",
            text = text,
            timestamp = "${now.date} ${now.hour}:${"%02d".format(now.minute)}",
        )

        val index = proposals.indexOfFirst { it.id == proposalId }
        if (index >= 0) {
            proposals[index] = proposals[index].copy(
                comments = proposals[index].comments + comment,
            )
            _uiState.value = _uiState.value.copy(
                proposals = proposals.toList(),
                commentDraft = "",
            )
        }
    }

    /**
     * Withdraws a proposal (only by the original proposer).
     */
    fun withdrawProposal(proposalId: String) {
        val index = proposals.indexOfFirst { it.id == proposalId }
        if (index >= 0 && proposals[index].proposedBy == "You") {
            proposals[index] = proposals[index].copy(status = ProposalStatus.WITHDRAWN)
            _uiState.value = _uiState.value.copy(proposals = proposals.toList())
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}
