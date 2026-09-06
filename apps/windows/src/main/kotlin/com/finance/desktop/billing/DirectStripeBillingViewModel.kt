// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.billing

import com.finance.core.entitlement.EntitlementRepository
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementUnavailableReason
import com.finance.desktop.data.repository.AuthRepository
import com.finance.desktop.viewmodel.DesktopViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class DirectStripeBillingViewModel(
    private val repository: ProductBillingRepository,
    private val entitlementRepository: EntitlementRepository,
    private val authRepository: AuthRepository,
) : DesktopViewModel() {
    private val _state = MutableStateFlow<ProductBillingState>(ProductBillingState.Idle())
    val state: StateFlow<ProductBillingState> = _state.asStateFlow()

    private var operationJob: Job? = null
    private var operationGeneration = 0L

    init {
        viewModelScope.launch {
            authRepository.currentAccount
                .map { it?.userId }
                .distinctUntilChanged()
                .collectLatest { userId ->
                    operationJob?.cancel()
                    operationGeneration += 1
                    _state.value = ProductBillingState.Idle()
                    if (userId != null) refresh()
                }
        }
    }

    fun startCheckout(
        choice: BillingCatalogChoice,
        householdIntent: String? = null,
        openExternalUrl: (String) -> Unit,
    ) {
        launchForCurrentPrincipal("Sign in to start checkout.") { generation, principalId ->
            repository.startCheckout(choice, householdIntent)
                .onSuccess { checkoutUrl ->
                    if (!isCurrent(generation, principalId)) return@onSuccess
                    try {
                        openExternalUrl(checkoutUrl)
                        _state.value = ProductBillingState.Pending(_state.value.projection)
                    } catch (_: Exception) {
                        _state.value = ProductBillingState.Error(
                            _state.value.projection,
                            "Checkout could not be opened. Try again.",
                        )
                    }
                }
                .onFailure {
                    if (!isCurrent(generation, principalId)) return@onFailure
                    _state.value = ProductBillingState.Error(
                        _state.value.projection,
                        "Checkout could not be started. Try again.",
                    )
                }
        }
    }

    fun refresh(householdId: String? = null) {
        launchForCurrentPrincipal("Sign in to view billing status.") { generation, principalId ->
            refreshProjection(generation, principalId, householdId)
        }
    }

    fun reconcile(householdId: String? = null) {
        launchForCurrentPrincipal("Sign in to restore purchases.") { generation, principalId ->
            _state.value = ProductBillingState.Pending(_state.value.projection)
            repository.reconcile()
                .onSuccess {
                    if (isCurrent(generation, principalId)) {
                        refreshProjection(generation, principalId, householdId)
                    }
                }
                .onFailure {
                    if (!isCurrent(generation, principalId)) return@onFailure
                    _state.value = ProductBillingState.Error(
                        _state.value.projection,
                        "Billing reconciliation could not be completed.",
                    )
                }
        }
    }

    fun openPortal(openExternalUrl: (String) -> Unit) {
        launchForCurrentPrincipal("Sign in to manage billing.") { generation, principalId ->
            repository.openPortal()
                .onSuccess { portalUrl ->
                    if (!isCurrent(generation, principalId)) return@onSuccess
                    try {
                        openExternalUrl(portalUrl)
                    } catch (_: Exception) {
                        _state.value = ProductBillingState.Error(
                            _state.value.projection,
                            "Billing management could not be opened.",
                        )
                    }
                }
                .onFailure {
                    if (!isCurrent(generation, principalId)) return@onFailure
                    _state.value = ProductBillingState.Error(
                        _state.value.projection,
                        "Billing management could not be opened.",
                    )
                }
        }
    }

    private suspend fun refreshProjection(
        generation: Long,
        principalId: String,
        householdId: String?,
    ) {
        when (val result = entitlementRepository.load(householdId)) {
                is EntitlementResult.Available -> {
                    if (!isCurrent(generation, principalId)) return
                    _state.value = if (
                        result.envelope.confirmsServerResolvedPaidDisplay()
                    ) {
                        ProductBillingState.Confirmed(result.envelope)
                    } else {
                        ProductBillingState.Idle(result.envelope)
                    }
                }
                is EntitlementResult.Unavailable -> {
                    if (!isCurrent(generation, principalId)) return
                    val retainedProjection = when (result.reason) {
                        EntitlementUnavailableReason.UNAUTHENTICATED,
                        EntitlementUnavailableReason.FORBIDDEN,
                        EntitlementUnavailableReason.INVALID_REQUEST,
                        EntitlementUnavailableReason.MALFORMED,
                        EntitlementUnavailableReason.UNSUPPORTED_CONTRACT_VERSION,
                        EntitlementUnavailableReason.UNSUPPORTED_CATALOG_VERSION,
                        -> null
                        EntitlementUnavailableReason.RATE_LIMITED,
                        EntitlementUnavailableReason.PROJECTION_UNAVAILABLE,
                        EntitlementUnavailableReason.OFFLINE,
                        -> _state.value.projection
                    }
                    _state.value = ProductBillingState.Error(
                        retainedProjection,
                        "Entitlement status could not be refreshed.",
                    )
                }
        }
    }

    private fun launchForCurrentPrincipal(
        unauthenticatedMessage: String,
        block: suspend (generation: Long, principalId: String) -> Unit,
    ) {
        val principalId = authRepository.currentAccount.value?.userId
        if (principalId == null) {
                operationJob?.cancel()
                operationGeneration += 1
                _state.value = ProductBillingState.Error(null, unauthenticatedMessage)
                return
        }

        operationJob?.cancel()
        val generation = ++operationGeneration
        operationJob = viewModelScope.launch {
                if (isCurrent(generation, principalId)) {
                    block(generation, principalId)
                }
        }
    }

    private fun isCurrent(generation: Long, principalId: String): Boolean =
        generation == operationGeneration &&
                authRepository.currentAccount.value?.userId == principalId

    override fun onCleared() {
        operationJob?.cancel()
        super.onCleared()
    }
}
