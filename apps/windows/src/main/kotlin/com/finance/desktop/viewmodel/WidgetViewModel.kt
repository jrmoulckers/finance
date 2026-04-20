// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.widgets.FinanceWidgetType
import com.finance.desktop.widgets.WidgetRegistrationManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.logging.Level
import java.util.logging.Logger

/**
 * UI state for widget management in the Settings screen.
 */
data class WidgetUiState(
    val isPackaged: Boolean = false,
    val widgets: List<WidgetInfo> = emptyList(),
    val lastRefreshTimestamp: Long = 0L,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * Display information for a single widget type.
 */
data class WidgetInfo(
    val type: FinanceWidgetType,
    val displayName: String,
    val description: String,
    val hasContent: Boolean,
)

/**
 * ViewModel for Windows 11 Widget Board integration.
 *
 * Exposes the registration status of each widget type and provides
 * actions to refresh widget content on demand. Consumed by the Settings
 * screen to show widget status and a "Refresh Widgets" button.
 */
class WidgetViewModel(
    private val widgetManager: WidgetRegistrationManager,
) : DesktopViewModel() {

    companion object {
        private val logger: Logger = Logger.getLogger(WidgetViewModel::class.java.name)
    }

    private val _uiState = MutableStateFlow(WidgetUiState())
    val uiState: StateFlow<WidgetUiState> = _uiState.asStateFlow()

    init {
        loadWidgetStatus()
    }

    /**
     * Triggers a refresh of all widget Adaptive Card content.
     */
    fun refreshWidgets() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true, errorMessage = null)
            try {
                widgetManager.refreshAllWidgets()
                _uiState.value = _uiState.value.copy(
                    isRefreshing = false,
                    lastRefreshTimestamp = System.currentTimeMillis(),
                    widgets = buildWidgetInfoList(),
                )
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "Widget refresh failed", e)
                _uiState.value = _uiState.value.copy(
                    isRefreshing = false,
                    errorMessage = "Failed to refresh widgets: ${e.message}",
                )
            }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    private fun loadWidgetStatus() {
        _uiState.value = WidgetUiState(
            isPackaged = widgetManager.isPackagedApp,
            widgets = buildWidgetInfoList(),
        )
    }

    private fun buildWidgetInfoList(): List<WidgetInfo> {
        return widgetManager.getRegisteredWidgets().map { type ->
            WidgetInfo(
                type = type,
                displayName = type.displayName,
                description = type.description,
                hasContent = widgetManager.getWidgetContent(type) != null,
            )
        }
    }
}
