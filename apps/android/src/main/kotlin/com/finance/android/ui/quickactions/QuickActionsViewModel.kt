// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.TransactionRepository
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import timber.log.Timber

/**
 * UI state for the predictive quick-actions surface (#2396).
 *
 * @property actions Ranked, surfaceable actions (already truncated to the
 *   display limit). Empty while loading or when everything is disabled.
 * @property isLoading Whether the first ranking pass is in progress.
 */
data class QuickActionsUiState(
    val actions: List<RankedQuickAction> = emptyList(),
    val isLoading: Boolean = true,
)

/**
 * ViewModel that turns on-device signals into a ranked list of quick-actions.
 *
 * It computes [QuickActionSignals] entirely from local data — current time,
 * persisted usage history, and aggregate counts of pending imports / upcoming
 * bills derived from the transaction repository — then delegates ordering to
 * the injected [QuickActionRanker]. No behavioural history leaves the device.
 *
 * User controls (dismiss / pin / disable) update either session state or
 * [QuickActionPreferences] and re-rank immediately. Aggregate, non-PII
 * telemetry is emitted via [QuickActionTelemetry].
 *
 * @param householdIdProvider Provides the authenticated household ID.
 * @param transactionRepository Source for pending-import / upcoming-bill signals.
 * @param ranker The (swappable) on-device ranking model.
 * @param preferences On-device pin / disable / usage persistence.
 * @param telemetry Aggregate usefulness telemetry sink.
 */
class QuickActionsViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val ranker: QuickActionRanker,
    private val preferences: QuickActionPreferences,
    private val telemetry: QuickActionTelemetry,
) : ViewModel() {

    private val _uiState = MutableStateFlow(QuickActionsUiState())
    val uiState: StateFlow<QuickActionsUiState> = _uiState.asStateFlow()

    /** Actions dismissed this session — hidden now, eligible to return later. */
    private var dismissed: Set<QuickActionType> = emptySet()

    /** Cached contextual signals so re-ranks after a control tap stay cheap. */
    private var pendingImportCount: Int = 0
    private var upcomingBillCount: Int = 0

    init {
        refresh()
    }

    /** Recomputes signals from local data and re-ranks. */
    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            loadContextualSignals()
            rerank()
        }
    }

    /**
     * Handles activation of [action] at zero-based [position]. Records the
     * activation locally (for recency / frequency) and emits telemetry. The
     * caller is responsible for performing the actual navigation.
     */
    fun onActivated(action: RankedQuickAction, position: Int) {
        preferences.recordActivation(action.type, todayEpochDay())
        telemetry.onActivated(action.type, position)
        rerank()
    }

    /** Dismisses [type] for the current session. */
    fun dismiss(type: QuickActionType) {
        dismissed = dismissed + type
        telemetry.onDismissed(type)
        rerank()
    }

    /** Pins or unpins [type] (persisted). */
    fun setPinned(type: QuickActionType, pinned: Boolean) {
        preferences.setPinned(type, pinned)
        telemetry.onPinChanged(type, pinned)
        rerank()
    }

    /** Disables [type] entirely (persisted opt-out). */
    fun disable(type: QuickActionType) {
        preferences.setDisabled(type, true)
        telemetry.onDisabled(type)
        rerank()
    }

    private suspend fun loadContextualSignals() {
        val householdId = householdIdProvider.householdId.value ?: run {
            Timber.w("No household ID — quick-action context signals default to zero")
            pendingImportCount = 0
            upcomingBillCount = 0
            return
        }

        @Suppress("TooGenericExceptionCaught") // Multiple exception types possible
        try {
            val transactions = transactionRepository.observeAll(householdId).first()
            // Pending imports = transactions still needing review: uncategorized
            // or not yet cleared. Aggregate count only — no details retained.
            pendingImportCount = transactions.count { txn ->
                txn.categoryId == null || txn.status == TransactionStatus.PENDING
            }
            // Upcoming bills = recurring expense commitments.
            upcomingBillCount = transactions
                .filter { it.isRecurring && it.type == TransactionType.EXPENSE }
                .mapNotNull { it.recurringRuleId }
                .distinct()
                .size
            Timber.d(
                "Quick-action signals: pendingImports=%d upcomingBills=%d",
                pendingImportCount,
                upcomingBillCount,
            )
        } catch (e: Exception) {
            Timber.e(e, "Failed to compute quick-action context signals")
            pendingImportCount = 0
            upcomingBillCount = 0
        }
    }

    private fun rerank() {
        val signals = QuickActionSignals(
            timeBucket = currentTimeBucket(),
            usage = preferences.usage(todayEpochDay()),
            pendingImportCount = pendingImportCount,
            upcomingBillCount = upcomingBillCount,
            pinned = preferences.pinned(),
            disabled = preferences.disabled(),
            dismissed = dismissed,
            modelAgeMinutes = null,
        )

        val ranked = ranker.rank(signals).take(MAX_VISIBLE_ACTIONS)
        telemetry.onSurfaced(ranked.map { it.type })
        _uiState.update { it.copy(actions = ranked, isLoading = false) }
    }

    private fun currentTimeBucket(): TimeBucket {
        val hour = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).hour
        return TimeBucket.fromHour(hour)
    }

    private fun todayEpochDay(): Long =
        Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date.toEpochDays().toLong()

    private companion object {
        /** Maximum number of actions surfaced at once to avoid overwhelming. */
        const val MAX_VISIBLE_ACTIONS = 4
    }
}
