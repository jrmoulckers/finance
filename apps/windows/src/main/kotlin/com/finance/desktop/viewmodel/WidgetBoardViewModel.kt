// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.widgets.FinanceWidgetType
import com.finance.desktop.widgets.WidgetRegistrationManager
import com.finance.desktop.widgets.WidgetSize
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Configuration for a single widget on the board.
 *
 * @property type The widget type to render.
 * @property size The configured display size.
 * @property enabled Whether this widget is visible on the board.
 * @property position Sort order position on the board (lower = higher).
 */
data class WidgetBoardItem(
    val type: FinanceWidgetType,
    val size: WidgetSize = type.defaultSize,
    val enabled: Boolean = true,
    val position: Int = 0,
)

/**
 * UI state for the widget board management screen.
 */
data class WidgetBoardUiState(
    val isLoading: Boolean = true,
    val widgets: List<WidgetBoardItem> = emptyList(),
    val isRefreshing: Boolean = false,
    val isPackaged: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * ViewModel for the Widget Board management screen.
 *
 * Provides add/remove/resize/reorder operations for widgets and
 * coordinates with [WidgetRegistrationManager] for Windows 11
 * Widget Board integration.
 */
class WidgetBoardViewModel(
    private val widgetManager: WidgetRegistrationManager,
) : DesktopViewModel() {

    companion object {
        private val logger: Logger = Logger.getLogger(WidgetBoardViewModel::class.java.name)
    }

    private val _uiState = MutableStateFlow(WidgetBoardUiState())
    val uiState: StateFlow<WidgetBoardUiState> = _uiState.asStateFlow()

    init {
        loadBoard()
    }

    private fun loadBoard() {
        val defaultWidgets = FinanceWidgetType.entries.mapIndexed { index, type ->
            WidgetBoardItem(
                type = type,
                size = type.defaultSize,
                enabled = true,
                position = index,
            )
        }
        _uiState.value = WidgetBoardUiState(
            isLoading = false,
            widgets = defaultWidgets,
            isPackaged = widgetManager.isPackagedApp,
        )
    }

    /**
     * Toggles a widget's visibility on the board.
     */
    fun toggleWidget(type: FinanceWidgetType) {
        _uiState.value = _uiState.value.copy(
            widgets = _uiState.value.widgets.map { item ->
                if (item.type == type) item.copy(enabled = !item.enabled) else item
            },
        )
    }

    /**
     * Changes the display size of a widget.
     */
    fun resizeWidget(type: FinanceWidgetType, newSize: WidgetSize) {
        if (newSize !in type.supportedSizes) return
        _uiState.value = _uiState.value.copy(
            widgets = _uiState.value.widgets.map { item ->
                if (item.type == type) item.copy(size = newSize) else item
            },
        )
    }

    /**
     * Moves a widget up in the board order.
     */
    fun moveWidgetUp(type: FinanceWidgetType) {
        val widgets = _uiState.value.widgets.toMutableList()
        val index = widgets.indexOfFirst { it.type == type }
        if (index > 0) {
            val temp = widgets[index]
            widgets[index] = widgets[index - 1].copy(position = index)
            widgets[index - 1] = temp.copy(position = index - 1)
            _uiState.value = _uiState.value.copy(widgets = widgets)
        }
    }

    /**
     * Moves a widget down in the board order.
     */
    fun moveWidgetDown(type: FinanceWidgetType) {
        val widgets = _uiState.value.widgets.toMutableList()
        val index = widgets.indexOfFirst { it.type == type }
        if (index >= 0 && index < widgets.size - 1) {
            val temp = widgets[index]
            widgets[index] = widgets[index + 1].copy(position = index)
            widgets[index + 1] = temp.copy(position = index + 1)
            _uiState.value = _uiState.value.copy(widgets = widgets)
        }
    }

    /**
     * Refreshes all widget content from repositories.
     */
    fun refreshWidgets() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true, errorMessage = null)
            @Suppress("TooGenericExceptionCaught") // Widget operation error boundary
            try {
                widgetManager.refreshAllWidgets()
                _uiState.value = _uiState.value.copy(isRefreshing = false)
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "Widget board refresh failed", e)
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
}
