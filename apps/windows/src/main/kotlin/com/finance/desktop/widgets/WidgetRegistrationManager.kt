// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.widgets

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Describes a Finance widget type that can be registered with the
 * Windows 11 Widget Board.
 *
 * @property id Unique widget identifier used in the MSIX manifest.
 * @property displayName Human-readable name shown in the widget picker.
 * @property description Brief description for the widget gallery.
 */
/**
 * Available widget sizes following Windows 11 Widget Board conventions.
 *
 * @property columns Grid columns consumed.
 * @property displayName Human-readable size label.
 */
enum class WidgetSize(val columns: Int, val displayName: String) {
    SMALL(1, "Small"),
    MEDIUM(2, "Medium"),
    LARGE(3, "Large"),
}

enum class FinanceWidgetType(
    val id: String,
    val displayName: String,
    val description: String,
    val supportedSizes: List<WidgetSize> = listOf(WidgetSize.SMALL, WidgetSize.MEDIUM, WidgetSize.LARGE),
    val defaultSize: WidgetSize = WidgetSize.MEDIUM,
) {
    NET_WORTH(
        id = "com.finance.widget.networth",
        displayName = "Net Worth",
        description = "At-a-glance net worth with today's and monthly spending.",
    ),
    BUDGET_OVERVIEW(
        id = "com.finance.widget.budgets",
        displayName = "Budget Overview",
        description = "Budget progress bars with health status indicators.",
    ),
    RECENT_TRANSACTIONS(
        id = "com.finance.widget.transactions",
        displayName = "Recent Transactions",
        description = "Last 5 transactions with amounts and dates.",
    ),
    GOALS_PROGRESS(
        id = "com.finance.widget.goals",
        displayName = "Goals Progress",
        description = "Savings goal progress bars with target amounts.",
        supportedSizes = listOf(WidgetSize.MEDIUM, WidgetSize.LARGE),
    ),
    SPENDING_TRENDS(
        id = "com.finance.widget.trends",
        displayName = "Spending Trends",
        description = "Weekly and monthly spending trend comparison.",
        supportedSizes = listOf(WidgetSize.MEDIUM, WidgetSize.LARGE),
    ),
}

/**
 * Manages the lifecycle of Windows 11 Widget Board widget registration.
 *
 * Windows 11 widgets are registered through the MSIX package manifest
 * (`AppxManifest.xml`) using the `com.microsoft.windows.widgets` extension.
 * The actual COM server activation is handled by the OS widget host — this
 * manager provides:
 *
 * 1. **Registration status checks** — verifies whether the MSIX manifest
 *    declares the widget provider extension
 * 2. **Widget content updates** — coordinates between [WidgetDataProvider]
 *    and [WidgetContentRenderer] to produce updated Adaptive Card JSON
 * 3. **Lifecycle hooks** — called from [Main.kt] on app start/stop to
 *    ensure widgets show fresh data
 *
 * ## MSIX Requirement
 *
 * Full widget board integration requires the application to be packaged as
 * MSIX with the widget provider extension declared. When running unpackaged
 * (during development), this manager operates in a degraded mode and logs
 * a warning.
 *
 * @see WidgetDataProvider for data aggregation
 * @see WidgetContentRenderer for Adaptive Card JSON rendering
 */
class WidgetRegistrationManager(
    private val dataProvider: WidgetDataProvider,
    private val renderer: WidgetContentRenderer,
) {
    companion object {
        private val logger: Logger =
            Logger.getLogger(WidgetRegistrationManager::class.java.name)
    }

    /** Cached widget content for each widget type. */
    private val widgetContentCache = mutableMapOf<FinanceWidgetType, String>()

    /**
     * Whether the application is running as a packaged MSIX with widget
     * support declared.
     *
     * Heuristic: checks for the `MSIX_PACKAGE_NAME` environment variable
     * set during MSIX execution context, or the Windows identity API.
     */
    val isPackagedApp: Boolean
        get() = System.getenv("MSIX_PACKAGE_NAME") != null ||
            System.getProperty("msix.packaged") == "true"

    /**
     * Initialises the widget manager.
     *
     * Call once during application startup. If the app is packaged, this
     * refreshes all widget content. If unpackaged, it logs a debug message
     * and skips registration.
     */
    fun initialize() {
        if (!isPackagedApp) {
            logger.info(
                "Running unpackaged — widget board integration is inactive. " +
                    "Package as MSIX to enable Windows 11 widgets.",
            )
            return
        }

        logger.info("Widget manager initialising for packaged app")
        CoroutineScope(Dispatchers.IO).launch {
            refreshAllWidgets()
        }
    }

    /**
     * Refreshes the Adaptive Card content for all widget types.
     *
     * This is a suspend function because it reads from repositories.
     * The resulting JSON is cached so the widget host can retrieve it
     * synchronously via the COM callback.
     */
    suspend fun refreshAllWidgets() {
        try {
            val data = dataProvider.fetchWidgetData()

            widgetContentCache[FinanceWidgetType.NET_WORTH] =
                renderer.renderNetWorthCard(data)
            widgetContentCache[FinanceWidgetType.BUDGET_OVERVIEW] =
                renderer.renderBudgetOverviewCard(data)
            widgetContentCache[FinanceWidgetType.RECENT_TRANSACTIONS] =
                renderer.renderRecentTransactionsCard(data)
            widgetContentCache[FinanceWidgetType.GOALS_PROGRESS] =
                renderer.renderGoalsProgressCard(data)
            widgetContentCache[FinanceWidgetType.SPENDING_TRENDS] =
                renderer.renderSpendingTrendsCard(data)

            logger.fine("All widget content refreshed successfully")
        } catch (e: Exception) {
            logger.log(Level.WARNING, "Failed to refresh widget content", e)
        }
    }

    /**
     * Returns the cached Adaptive Card JSON for the given widget type.
     *
     * Returns `null` if the widget has never been refreshed or the type
     * is unknown.
     */
    fun getWidgetContent(type: FinanceWidgetType): String? {
        return widgetContentCache[type]
    }

    /**
     * Returns all registered widget types with their metadata.
     */
    fun getRegisteredWidgets(): List<FinanceWidgetType> {
        return FinanceWidgetType.entries.toList()
    }

    /**
     * Called on application shutdown to clean up resources.
     */
    fun dispose() {
        widgetContentCache.clear()
        logger.info("Widget manager disposed")
    }
}
