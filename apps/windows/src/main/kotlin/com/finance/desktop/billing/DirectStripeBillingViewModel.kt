// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.billing

import com.finance.desktop.viewmodel.DesktopViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DirectStripeBillingViewModel(
    private val repository: ProductBillingRepository,
) : DesktopViewModel() {
    private val _state = MutableStateFlow<ProductBillingState>(ProductBillingState.Idle())
    val state: StateFlow<ProductBillingState> = _state.asStateFlow()

    fun startCheckout(
        choice: BillingCatalogChoice,
        householdIntent: String? = null,
        openExternalUrl: (String) -> Unit,
    ) {
        viewModelScope.launch {
            repository.startCheckout(choice, householdIntent)
                .onSuccess { checkoutUrl ->
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
                    _state.value = ProductBillingState.Error(
                        _state.value.projection,
                        "Checkout could not be started. Try again.",
                    )
                }
        }
    }

    fun refresh(householdId: String? = null) {
        viewModelScope.launch {
            repository.loadProjection(householdId)
                .onSuccess { projection ->
                    _state.value = if (projection.confirmsPaidAccess) {
                        ProductBillingState.Confirmed(projection)
                    } else {
                        ProductBillingState.Idle(projection)
                    }
                }
                .onFailure {
                    _state.value = ProductBillingState.Error(
                        _state.value.projection,
                        "Entitlement status could not be refreshed.",
                    )
                }
        }
    }

    fun reconcile(householdId: String? = null) {
        viewModelScope.launch {
            _state.value = ProductBillingState.Pending(_state.value.projection)
            repository.reconcile()
                .onSuccess { refresh(householdId) }
                .onFailure {
                    _state.value = ProductBillingState.Error(
                        _state.value.projection,
                        "Billing reconciliation could not be completed.",
                    )
                }
        }
    }

    fun openPortal(openExternalUrl: (String) -> Unit) {
        viewModelScope.launch {
            repository.openPortal()
                .onSuccess { portalUrl ->
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
                    _state.value = ProductBillingState.Error(
                        _state.value.projection,
                        "Billing management could not be opened.",
                    )
                }
        }
    }
}
