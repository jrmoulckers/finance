// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import timber.log.Timber

/**
 * UI-facing summary of one platform's payouts (#2133).
 *
 * @property platformName human-readable platform label.
 * @property totalFormatted summed payout amount, pre-formatted for display.
 * @property payoutCount number of deposits grouped here.
 */
data class GigPayoutRowUi(
    val platformName: String,
    val totalFormatted: String,
    val payoutCount: Int,
)

/**
 * UI-facing summary of a mileage shift (#2137).
 *
 * @property id stable shift id.
 * @property platformName platform the shift was driven for.
 * @property miles business miles, or `null` while still open/incomplete.
 * @property deductionFormatted estimated deduction, pre-formatted, or empty when open.
 * @property isActive whether the shift is currently in progress.
 */
data class GigShiftRowUi(
    val id: String,
    val platformName: String,
    val miles: Int?,
    val deductionFormatted: String,
    val isActive: Boolean,
)

/**
 * Immutable state for the Gig Tools surface.
 *
 * @property isLoading true while the initial payout load is in flight.
 * @property payoutRows payouts grouped by platform, biggest earner first.
 * @property totalPayoutFormatted total gig income across platforms.
 * @property hasActiveShift whether a shift is currently open (drives start/stop UI).
 * @property shiftRows completed + active shifts, newest first.
 * @property totalMiles total business miles across completed shifts.
 * @property totalDeductionFormatted total estimated mileage deduction.
 * @property presets the Schedule C quick-add presets to surface.
 * @property error a user-facing error key, or `null`.
 */
data class GigToolsUiState(
    val isLoading: Boolean = true,
    val payoutRows: List<GigPayoutRowUi> = emptyList(),
    val totalPayoutFormatted: String = "",
    val hasActiveShift: Boolean = false,
    val shiftRows: List<GigShiftRowUi> = emptyList(),
    val totalMiles: Int = 0,
    val totalDeductionFormatted: String = "",
    val presets: List<ScheduleCPreset> = ScheduleCPresets.presets,
    val error: GigError? = null,
)

/** Deterministic error states for gig tools, surfaced for accessibility. */
enum class GigError {
    /** Odometer readings were missing/invalid when ending a shift. */
    INVALID_MILEAGE,

    /** Tried to start a shift while one is already active. */
    SHIFT_ALREADY_ACTIVE,

    /** Tried to end a shift when none is active. */
    NO_ACTIVE_SHIFT,
}

/**
 * ViewModel for the **Gig Tools** surface, unifying three gig-driver features (#2141,
 * #2137, #2133) behind one screen:
 *
 * - **Payouts by platform** — reads transactions and delegates grouping to [GigPayouts].
 * - **Shift-based mileage** — start/stop shifts persisted via [GigShiftStore], maths via
 *   [GigMileage].
 * - **Schedule C presets** — surfaced from [ScheduleCPresets] for one-handed quick-add.
 *
 * All decision logic lives in the pure objects above; this class only wires them to
 * repositories, persistence, and reactive state so it stays testable.
 */
class GigToolsViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val shiftStore: GigShiftRepository,
    private val clock: Clock = Clock.System,
) : ViewModel() {

    private val _uiState = MutableStateFlow(GigToolsUiState())
    val uiState: StateFlow<GigToolsUiState> = _uiState.asStateFlow()

    init {
        refreshShifts()
        loadPayouts()
    }

    private fun loadPayouts() {
        viewModelScope.launch {
            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID — skipping gig payout load")
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }
            val transactions = transactionRepository.observeAll(householdId).first()
            val groups = GigPayouts.group(transactions)
            val total = GigPayouts.totalCents(transactions)
            _uiState.update {
                it.copy(
                    isLoading = false,
                    payoutRows = groups.map { group ->
                        GigPayoutRowUi(
                            platformName = group.platform.displayName,
                            totalFormatted = CurrencyFormatter.format(group.totalCents, Currency.USD),
                            payoutCount = group.payoutCount,
                        )
                    },
                    totalPayoutFormatted = CurrencyFormatter.format(total, Currency.USD),
                )
            }
        }
    }

    /**
     * Starts a new shift for [platform] with an optional starting [startOdometer].
     * Rejected (with [GigError.SHIFT_ALREADY_ACTIVE]) if a shift is already open.
     */
    fun startShift(platform: GigPlatform, startOdometer: Int?) {
        if (shiftStore.shifts().any { it.isActive }) {
            _uiState.update { it.copy(error = GigError.SHIFT_ALREADY_ACTIVE) }
            return
        }
        val now = clock.now()
        val shift = MileageShift(
            id = "shift-${now.toEpochMilliseconds()}",
            platform = platform,
            startedAt = now,
            startOdometer = startOdometer,
        )
        shiftStore.upsert(shift)
        refreshShifts()
    }

    /**
     * Ends the currently-active shift, recording [endOdometer]. Rejected with
     * [GigError.NO_ACTIVE_SHIFT] when nothing is open, or [GigError.INVALID_MILEAGE] when
     * the resulting mileage is not recordable (see [GigMileage.milesForShift]).
     */
    fun endShift(endOdometer: Int?) {
        val active = shiftStore.shifts().firstOrNull { it.isActive }
        if (active == null) {
            _uiState.update { it.copy(error = GigError.NO_ACTIVE_SHIFT) }
            return
        }
        val ended = active.copy(endedAt = clock.now(), endOdometer = endOdometer)
        if (ended.miles == null) {
            _uiState.update { it.copy(error = GigError.INVALID_MILEAGE) }
            return
        }
        shiftStore.upsert(ended)
        refreshShifts()
    }

    /** Clears any surfaced error. */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    private fun refreshShifts() {
        val shifts = shiftStore.shifts()
        _uiState.update {
            it.copy(
                hasActiveShift = shifts.any { s -> s.isActive },
                shiftRows = shifts.map { s ->
                    GigShiftRowUi(
                        id = s.id,
                        platformName = s.platform.displayName,
                        miles = s.miles,
                        deductionFormatted = s.miles?.let { m ->
                            CurrencyFormatter.format(Cents(GigMileage.deductionCents(m)), Currency.USD)
                        }.orEmpty(),
                        isActive = s.isActive,
                    )
                },
                totalMiles = GigMileage.totalMiles(shifts),
                totalDeductionFormatted = CurrencyFormatter.format(
                    Cents(GigMileage.totalDeductionCents(shifts)),
                    Currency.USD,
                ),
                error = null,
            )
        }
    }
}
