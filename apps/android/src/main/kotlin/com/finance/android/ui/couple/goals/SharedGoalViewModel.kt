// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.goals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.GoalRepository
import com.finance.android.ui.couple.CoupleProfile
import com.finance.android.ui.couple.CoupleProfileRepository
import com.finance.android.ui.couple.Partner
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Goal
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import timber.log.Timber

/** A selectable goal in the shared-contributions picker. */
data class SelectableGoalUi(val id: String, val name: String)

/** Per-partner contribution summary. */
data class PartnerProgressUi(
    val partner: Partner,
    val name: String,
    val contributedFormatted: String,
    val fractionOfRecorded: Float,
    val suggestedMonthlyFormatted: String,
)

/** A displayable home-purchase milestone. */
data class MilestoneUi(
    val label: String,
    val amountFormatted: String,
    val reached: Boolean,
)

/** A single contribution history row. */
data class ContributionRowUi(
    val id: String,
    val partnerName: String,
    val amountFormatted: String,
    val note: String,
)

/** UI state for the shared goal contributions screen (#2147). */
data class SharedGoalUiState(
    val isLoading: Boolean = true,
    val profile: CoupleProfile = CoupleProfile(),
    val goals: List<SelectableGoalUi> = emptyList(),
    val selectedGoalId: String? = null,
    val selectedGoalName: String = "",
    val targetFormatted: String = "$0.00",
    val totalSavedFormatted: String = "$0.00",
    val remainingFormatted: String = "$0.00",
    val progressFraction: Float = 0f,
    val partnerProgress: List<PartnerProgressUi> = emptyList(),
    val unattributedFormatted: String = "$0.00",
    val showContributionsVisibly: Boolean = true,
    val milestones: List<MilestoneUi> = emptyList(),
    val history: List<ContributionRowUi> = emptyList(),
    val monthsToTarget: Int = DEFAULT_MONTHS,
) {
    companion object {
        const val DEFAULT_MONTHS = 24
    }
}

/**
 * ViewModel for shared goal contributions toward a house down payment (#2147).
 *
 * Reuses the real [GoalRepository] for goal totals and layers partner-specific
 * contributions on top, exposing household total progress plus each partner's
 * effort, suggested monthly targets, and home-purchase milestones.
 */
class SharedGoalViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val goalRepository: GoalRepository,
    private val contributionRepository: SharedContributionRepository,
    private val profileRepository: CoupleProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SharedGoalUiState())
    val uiState: StateFlow<SharedGoalUiState> = _uiState.asStateFlow()

    private val currency: Currency = Currency.USD
    private var goalsCache: List<Goal> = emptyList()

    init {
        load(null)
    }

    fun selectGoal(goalId: String) = load(goalId)

    fun refresh() = load(_uiState.value.selectedGoalId)

    fun toggleVisibility(visible: Boolean) {
        _uiState.update { it.copy(showContributionsVisibly = visible) }
    }

    fun addContribution(partner: Partner, amountDollars: Double, note: String) {
        val goalId = _uiState.value.selectedGoalId ?: return
        if (amountDollars <= 0) return
        contributionRepository.add(
            GoalContribution(
                id = "contrib-${System.currentTimeMillis()}",
                goalId = goalId,
                partner = partner,
                amount = Cents.fromDollars(amountDollars),
                epochDay = Clock.System.todayIn(TimeZone.currentSystemDefault()).toEpochDays().toLong(),
                note = note.trim(),
            ),
        )
        load(goalId)
    }

    fun deleteContribution(id: String) {
        contributionRepository.delete(id)
        load(_uiState.value.selectedGoalId)
    }

    private fun load(preferredGoalId: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID — skipping shared goal load")
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }

            @Suppress("TooGenericExceptionCaught")
            try {
                goalsCache = goalRepository.observeAll(householdId).first()
                val profile = profileRepository.load()
                val selectable = goalsCache.map { SelectableGoalUi(it.id.value, it.name) }

                val goal = pickGoal(preferredGoalId)
                if (goal == null) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            profile = profile,
                            goals = selectable,
                            selectedGoalId = null,
                        )
                    }
                    return@launch
                }

                _uiState.update { render(goal, profile, selectable, it.showContributionsVisibly) }
            } catch (e: Exception) {
                Timber.e(e, "Failed to load shared goal")
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    private fun pickGoal(preferredGoalId: String?): Goal? {
        if (goalsCache.isEmpty()) return null
        preferredGoalId?.let { id -> goalsCache.firstOrNull { it.id.value == id }?.let { return it } }
        // Default to a house/down-payment goal when present, else the first goal.
        return goalsCache.firstOrNull { g ->
            HOME_KEYWORDS.any { kw -> g.name.contains(kw, ignoreCase = true) }
        } ?: goalsCache.first()
    }

    private fun render(
        goal: Goal,
        profile: CoupleProfile,
        selectable: List<SelectableGoalUi>,
        visible: Boolean,
    ): SharedGoalUiState {
        val contributions = contributionRepository.forGoal(goal.id.value)
        val byPartner = contributions.groupBy { it.partner }
        val aTotal = byPartner[Partner.A].orEmpty().fold(0L) { s, c -> s + c.amount.amount }
        val bTotal = byPartner[Partner.B].orEmpty().fold(0L) { s, c -> s + c.amount.amount }
        val recorded = aTotal + bTotal

        val totalSaved = goal.currentAmount.amount
        val target = goal.targetAmount.amount
        val remaining = (target - totalSaved).coerceAtLeast(0L)
        val unattributed = (totalSaved - recorded).coerceAtLeast(0L)

        val months = monthsToTarget(goal)
        val suggestedPerPerson = if (months > 0) remaining / months / 2 else remaining / 2

        val partnerProgress = listOf(
            partnerUi(Partner.A, profile, aTotal, recorded, suggestedPerPerson),
            partnerUi(Partner.B, profile, bTotal, recorded, suggestedPerPerson),
        )

        return SharedGoalUiState(
            isLoading = false,
            profile = profile,
            goals = selectable,
            selectedGoalId = goal.id.value,
            selectedGoalName = goal.name,
            targetFormatted = CurrencyFormatter.format(goal.targetAmount, currency),
            totalSavedFormatted = CurrencyFormatter.format(goal.currentAmount, currency),
            remainingFormatted = CurrencyFormatter.format(Cents(remaining), currency),
            progressFraction = goal.progress.toFloat(),
            partnerProgress = partnerProgress,
            unattributedFormatted = CurrencyFormatter.format(Cents(unattributed), currency),
            showContributionsVisibly = visible,
            milestones = homeMilestones(goal.targetAmount).map {
                MilestoneUi(
                    label = it.label,
                    amountFormatted = CurrencyFormatter.format(it.target, currency),
                    reached = it.isReached(goal.currentAmount),
                )
            },
            history = contributions.map {
                ContributionRowUi(
                    id = it.id,
                    partnerName = profile.nameFor(it.partner),
                    amountFormatted = CurrencyFormatter.format(it.amount, currency),
                    note = it.note,
                )
            },
            monthsToTarget = months,
        )
    }

    private fun partnerUi(
        partner: Partner,
        profile: CoupleProfile,
        contributed: Long,
        recorded: Long,
        suggestedPerPerson: Long,
    ) = PartnerProgressUi(
        partner = partner,
        name = profile.nameFor(partner),
        contributedFormatted = CurrencyFormatter.format(Cents(contributed), currency),
        fractionOfRecorded = if (recorded > 0) (contributed.toFloat() / recorded) else 0f,
        suggestedMonthlyFormatted = CurrencyFormatter.format(Cents(suggestedPerPerson), currency),
    )

    private fun monthsToTarget(goal: Goal): Int {
        val targetDate = goal.targetDate ?: return SharedGoalUiState.DEFAULT_MONTHS
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        if (targetDate <= today) return 1
        val days = today.toEpochDays().let { targetDate.toEpochDays() - it }
        return ((days / DAYS_PER_MONTH) + 1).coerceIn(1, MAX_MONTHS)
    }

    /**
     * Home-purchase milestones expressed as cumulative amounts: the down payment
     * (the goal target), estimated closing costs on top, and an emergency buffer.
     */
    private fun homeMilestones(target: Cents): List<HomeMilestone> = listOf(
        HomeMilestone("Down payment", target),
        HomeMilestone(
            "+ Closing costs",
            Cents(target.amount + (target.amount * CLOSING_PCT / 100)),
        ),
        HomeMilestone(
            "+ Emergency buffer",
            Cents(target.amount + (target.amount * (CLOSING_PCT + BUFFER_PCT) / 100)),
        ),
    )

    private companion object {
        val HOME_KEYWORDS = listOf("house", "home", "down payment", "downpayment")
        const val DAYS_PER_MONTH = 30
        const val MAX_MONTHS = 600
        const val CLOSING_PCT = 15L
        const val BUFFER_PCT = 10L
    }
}
