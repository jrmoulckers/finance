// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.core.entitlement.EntitlementDisplayPolicy
import com.finance.core.entitlement.EntitlementRepository
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementTier
import com.finance.desktop.data.repository.AuthRepository
import com.finance.desktop.entitlement.EntitlementDisplayCache
import com.finance.desktop.entitlement.EntitlementDisplayStatus
import com.finance.desktop.entitlement.EntitlementHouseholdScope
import com.finance.desktop.entitlement.EntitlementHouseholdSource
import com.finance.desktop.entitlement.EntitlementPresentationPolicy
import com.finance.desktop.entitlement.allowsDisplayCache
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

data class EntitlementUiState(
    val status: EntitlementDisplayStatus = EntitlementDisplayStatus.PENDING,
    val currentTier: EntitlementTier = EntitlementTier.FREE,
    val bankConnectionAllowance: Long = 0,
    val statusMessage: String = "Loading subscription status.",
    val pendingDowngradeAt: Instant? = null,
    val householdScopes: List<EntitlementHouseholdScope> = emptyList(),
    val selectedHouseholdId: String? = null,
)

/**
 * Presents the shared minimized Finance entitlement on Windows.
 *
 * This state is display-only. It never authorizes a server operation, derives a
 * tier from checkout state, or applies a local feature matrix. Manual entry,
 * import, export, deletion, privacy/security controls, accessibility, and
 * historical data remain outside entitlement handling.
 */
class EntitlementViewModel(
    private val entitlementRepository: EntitlementRepository,
    private val displayCache: EntitlementDisplayCache,
    private val authRepository: AuthRepository,
    private val householdSource: EntitlementHouseholdSource,
    private val now: () -> Instant = { Clock.System.now() },
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(EntitlementUiState())
    val uiState: StateFlow<EntitlementUiState> = _uiState.asStateFlow()

    private var requestJob: Job? = null
    private var refreshTimerJob: Job? = null
    private var requestGeneration = 0L

    init {
        viewModelScope.launch {
            authRepository.currentAccount
                .map { it?.userId }
                .distinctUntilChanged()
                .collectLatest(::principalChanged)
        }
    }

    fun selectHousehold(householdId: String?) {
        if (householdId != null && _uiState.value.householdScopes.none { it.id == householdId }) {
            return
        }
        if (_uiState.value.selectedHouseholdId == householdId) return
        _uiState.value = _uiState.value.copy(selectedHouseholdId = householdId)
        refresh()
    }

    fun refresh() {
        val userId = authRepository.currentAccount.value?.userId
        if (userId == null) {
            resetForSignedOutUser()
            return
        }
        requestJob?.cancel()
        refreshTimerJob?.cancel()
        val generation = ++requestGeneration
        val requestedHouseholdId = _uiState.value.selectedHouseholdId
        requestJob = viewModelScope.launch {
            val scopes = loadHouseholdScopes(userId)
            if (generation != requestGeneration ||
                authRepository.currentAccount.value?.userId != userId
            ) {
                return@launch
            }
            val householdId = requestedHouseholdId
                ?.takeIf { requested -> scopes.any { it.id == requested } }
                ?: scopes.singleOrNull()?.id
            _uiState.value = _uiState.value.copy(
                status = EntitlementDisplayStatus.PENDING,
                statusMessage = "Refreshing subscription status.",
                householdScopes = scopes,
                selectedHouseholdId = householdId,
            )
            loadEntitlement(generation, userId, householdId)
        }
    }

    private suspend fun principalChanged(userId: String?) {
        requestJob?.cancel()
        refreshTimerJob?.cancel()
        requestGeneration += 1
        if (userId == null) {
            resetForSignedOutUser()
            return
        }

        _uiState.value = EntitlementUiState(
            statusMessage = "Loading subscription status.",
        )
        refresh()
    }

    private suspend fun loadEntitlement(
        generation: Long,
        userId: String,
        householdId: String?,
    ) {
        when (val result = entitlementRepository.load(householdId)) {
            is EntitlementResult.Available -> {
                if (!isCurrentRequest(generation, userId, householdId)) return
                displayCache.write(userId, householdId, result.envelope)
                if (!isCurrentRequest(generation, userId, householdId)) return
                val presentation =
                    EntitlementPresentationPolicy.current(result.envelope, now())
                publish(presentation)
                scheduleRefresh(result.envelope)
            }
            is EntitlementResult.Unavailable -> {
                if (!isCurrentRequest(generation, userId, householdId)) return
                val cached = if (result.reason.allowsDisplayCache()) {
                    displayCache.read(userId, householdId)
                } else {
                    displayCache.remove(userId, householdId)
                    null
                }
                if (!isCurrentRequest(generation, userId, householdId)) return
                if (result.reason ==
                    com.finance.core.entitlement.EntitlementUnavailableReason.FORBIDDEN &&
                    householdId != null
                ) {
                    _uiState.value = _uiState.value.copy(
                        householdScopes =
                            _uiState.value.householdScopes.filterNot { it.id == householdId },
                        selectedHouseholdId = null,
                    )
                }
                val presentation =
                    EntitlementPresentationPolicy.fallback(result, cached, now())
                publish(presentation)
                if (cached != null &&
                    presentation.status != EntitlementDisplayStatus.REFRESH_NEEDED
                ) {
                    scheduleRefresh(cached)
                }
            }
        }
    }

    private suspend fun loadHouseholdScopes(userId: String): List<EntitlementHouseholdScope> =
        try {
            householdSource.loadForUser(userId)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            emptyList()
        }

    private fun publish(
        presentation: com.finance.desktop.entitlement.EntitlementPresentation,
    ) {
        _uiState.value = EntitlementUiState(
            status = presentation.status,
            currentTier = presentation.tier,
            bankConnectionAllowance = presentation.bankConnectionAllowance,
            statusMessage = presentation.message,
            pendingDowngradeAt = presentation.envelope?.entitlement?.downgrade?.effectiveAt,
            householdScopes = _uiState.value.householdScopes,
            selectedHouseholdId = _uiState.value.selectedHouseholdId,
        )
    }

    /**
     * A refresh deadline only requests another repository read. It never
     * changes the tier directly and never authorizes an operation.
     */
    private fun scheduleRefresh(
        envelope: com.finance.core.entitlement.EntitlementEnvelope,
    ) {
        val refreshAfter = EntitlementDisplayPolicy.refreshAfter(envelope) ?: return
        val waitMillis = refreshAfter.toEpochMilliseconds() - now().toEpochMilliseconds()
        if (waitMillis <= 0) return
        refreshTimerJob = viewModelScope.launch {
            delay(waitMillis)
            refresh()
        }
    }

    private fun isCurrentRequest(
        generation: Long,
        userId: String,
        householdId: String?,
    ): Boolean =
        generation == requestGeneration &&
            authRepository.currentAccount.value?.userId == userId &&
            _uiState.value.selectedHouseholdId == householdId

    private fun resetForSignedOutUser() {
        requestJob?.cancel()
        refreshTimerJob?.cancel()
        requestGeneration += 1
        _uiState.value = EntitlementUiState(
            status = EntitlementDisplayStatus.UNAVAILABLE,
            statusMessage = "Sign in to view subscription status.",
        )
    }

    override fun onCleared() {
        requestJob?.cancel()
        refreshTimerJob?.cancel()
        super.onCleared()
    }
}
