// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.widgets

import com.finance.core.budget.BudgetHealth
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.logging.Logger

/**
 * Renders [WidgetData] into Windows 11 Adaptive Card JSON payloads.
 *
 * Windows 11 Widgets use Adaptive Cards (https://adaptivecards.io) as their
 * rendering format. This renderer produces JSON strings conforming to the
 * Adaptive Card schema v1.5, which is the version supported by the Windows 11
 * Widget Board.
 *
 * ## Widget Types
 *
 * Three widget layouts are supported:
 * - **Net Worth Summary**: Headline net-worth figure with today/monthly spending
 * - **Budget Overview**: Up to 4 budget progress bars with health indicators
 * - **Recent Transactions**: Last 5 transactions with amount and date
 *
 * Each template includes accessible `"fallbackText"` fields for screen readers
 * and an `"altText"` on graphical elements for Narrator compatibility.
 *
 * @see WidgetDataProvider for the data source
 * @see WidgetRegistrationManager for COM server registration
 */
class WidgetContentRenderer {

    companion object {
        private val logger: Logger = Logger.getLogger(WidgetContentRenderer::class.java.name)

        /** Adaptive Card schema version supported by Windows 11 Widgets. */
        private const val SCHEMA_VERSION = "1.5"

        private const val SCHEMA_URL = "http://adaptivecards.io/schemas/adaptive-card.json"
    }

    /**
     * Renders the **Net Worth Summary** widget card.
     *
     * Layout:
     * ```
     * ┌─────────────────────────┐
     * │ Finance                 │
     * │ Net Worth: $XX,XXX.XX   │
     * │ Today: $X,XXX.XX        │
     * │ This Month: $X,XXX.XX   │
     * │ Updated at HH:MM        │
     * └─────────────────────────┘
     * ```
     */
    fun renderNetWorthCard(data: WidgetData): String {
        val card = JsonObject(
            mapOf(
                "\$schema" to JsonPrimitive(SCHEMA_URL),
                "type" to JsonPrimitive("AdaptiveCard"),
                "version" to JsonPrimitive(SCHEMA_VERSION),
                "fallbackText" to JsonPrimitive(
                    "Net Worth: ${data.netWorthFormatted}. " +
                        "Today spending: ${data.todaySpendingFormatted}. " +
                        "Monthly spending: ${data.monthlySpendingFormatted}.",
                ),
                "body" to JsonArray(
                    listOf(
                        textBlock("Finance", "Large", "Bolder"),
                        textBlock("Net Worth", "Small", "Default", true),
                        textBlock(data.netWorthFormatted, "ExtraLarge", "Bolder"),
                        columnSet(
                            column(
                                "Today",
                                data.todaySpendingFormatted,
                            ),
                            column(
                                "This Month",
                                data.monthlySpendingFormatted,
                            ),
                        ),
                        textBlock(data.lastUpdated, "Small", "Lighter", isSubtle = true),
                    ),
                ),
            ),
        )
        return card.toString()
    }

    /**
     * Renders the **Budget Overview** widget card.
     *
     * Shows up to 4 budgets with progress indicators and health colors.
     */
    fun renderBudgetOverviewCard(data: WidgetData): String {
        val budgetItems = data.budgetSummaries.map { budget ->
            val color = when (budget.health) {
                BudgetHealth.HEALTHY -> "Good"
                BudgetHealth.WARNING -> "Warning"
                BudgetHealth.OVER -> "Attention"
            }
            JsonObject(
                mapOf(
                    "type" to JsonPrimitive("Container"),
                    "items" to JsonArray(
                        listOf(
                            JsonObject(
                                mapOf(
                                    "type" to JsonPrimitive("ColumnSet"),
                                    "columns" to JsonArray(
                                        listOf(
                                            JsonObject(
                                                mapOf(
                                                    "type" to JsonPrimitive("Column"),
                                                    "width" to JsonPrimitive("stretch"),
                                                    "items" to JsonArray(
                                                        listOf(
                                                            textBlock(budget.name, "Default", "Bolder"),
                                                        ),
                                                    ),
                                                ),
                                            ),
                                            JsonObject(
                                                mapOf(
                                                    "type" to JsonPrimitive("Column"),
                                                    "width" to JsonPrimitive("auto"),
                                                    "items" to JsonArray(
                                                        listOf(
                                                            textBlock(
                                                                "${budget.spentFormatted} / ${budget.limitFormatted}",
                                                                "Small",
                                                                "Default",
                                                            ),
                                                        ),
                                                    ),
                                                ),
                                            ),
                                        ),
                                    ),
                                ),
                            ),
                            JsonObject(
                                mapOf(
                                    "type" to JsonPrimitive("TextBlock"),
                                    "text" to JsonPrimitive("${budget.utilizationPercent}%"),
                                    "size" to JsonPrimitive("Small"),
                                    "color" to JsonPrimitive(color),
                                    "altText" to JsonPrimitive(
                                        "${budget.name} budget: ${budget.utilizationPercent}% used, " +
                                            "${budget.spentFormatted} of ${budget.limitFormatted}",
                                    ),
                                ),
                            ),
                        ),
                    ),
                    "separator" to JsonPrimitive(true),
                ),
            )
        }

        val card = JsonObject(
            mapOf(
                "\$schema" to JsonPrimitive(SCHEMA_URL),
                "type" to JsonPrimitive("AdaptiveCard"),
                "version" to JsonPrimitive(SCHEMA_VERSION),
                "fallbackText" to JsonPrimitive(
                    "Budget Overview: " + data.budgetSummaries.joinToString(". ") {
                        "${it.name}: ${it.utilizationPercent}% used"
                    },
                ),
                "body" to JsonArray(
                    listOf(
                        textBlock("Finance — Budgets", "Large", "Bolder"),
                    ) + budgetItems + listOf(
                        textBlock(data.lastUpdated, "Small", "Lighter", isSubtle = true),
                    ),
                ),
            ),
        )
        return card.toString()
    }

    /**
     * Renders the **Recent Transactions** widget card.
     *
     * Shows the last 5 transactions with description, amount, and date.
     */
    fun renderRecentTransactionsCard(data: WidgetData): String {
        val txItems = data.recentTransactions.map { tx ->
            val amountColor = if (tx.isExpense) "Attention" else "Good"
            JsonObject(
                mapOf(
                    "type" to JsonPrimitive("ColumnSet"),
                    "columns" to JsonArray(
                        listOf(
                            JsonObject(
                                mapOf(
                                    "type" to JsonPrimitive("Column"),
                                    "width" to JsonPrimitive("stretch"),
                                    "items" to JsonArray(
                                        listOf(
                                            textBlock(tx.description, "Default", "Default"),
                                            textBlock(tx.dateFormatted, "Small", "Lighter", isSubtle = true),
                                        ),
                                    ),
                                ),
                            ),
                            JsonObject(
                                mapOf(
                                    "type" to JsonPrimitive("Column"),
                                    "width" to JsonPrimitive("auto"),
                                    "verticalContentAlignment" to JsonPrimitive("Center"),
                                    "items" to JsonArray(
                                        listOf(
                                            JsonObject(
                                                mapOf(
                                                    "type" to JsonPrimitive("TextBlock"),
                                                    "text" to JsonPrimitive(tx.amountFormatted),
                                                    "color" to JsonPrimitive(amountColor),
                                                    "weight" to JsonPrimitive("Bolder"),
                                                    "altText" to JsonPrimitive(
                                                        "${tx.description}: ${tx.amountFormatted} on ${tx.dateFormatted}",
                                                    ),
                                                ),
                                            ),
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                    "separator" to JsonPrimitive(true),
                ),
            )
        }

        val card = JsonObject(
            mapOf(
                "\$schema" to JsonPrimitive(SCHEMA_URL),
                "type" to JsonPrimitive("AdaptiveCard"),
                "version" to JsonPrimitive(SCHEMA_VERSION),
                "fallbackText" to JsonPrimitive(
                    "Recent Transactions: " + data.recentTransactions.joinToString(". ") {
                        "${it.description}: ${it.amountFormatted}"
                    },
                ),
                "body" to JsonArray(
                    listOf(
                        textBlock("Finance — Transactions", "Large", "Bolder"),
                    ) + txItems + listOf(
                        textBlock(data.lastUpdated, "Small", "Lighter", isSubtle = true),
                    ),
                ),
            ),
        )
        return card.toString()
    }

    // ── Adaptive Card JSON helpers ──────────────────────────────────────────

    private fun textBlock(
        text: String,
        size: String,
        weight: String,
        isSubtle: Boolean = false,
    ): JsonObject {
        val map = mutableMapOf(
            "type" to JsonPrimitive("TextBlock"),
            "text" to JsonPrimitive(text),
            "size" to JsonPrimitive(size),
            "weight" to JsonPrimitive(weight),
            "wrap" to JsonPrimitive(true),
        )
        if (isSubtle) {
            map["isSubtle"] = JsonPrimitive(true)
        }
        return JsonObject(map)
    }

    private fun columnSet(vararg columns: JsonObject): JsonObject {
        return JsonObject(
            mapOf(
                "type" to JsonPrimitive("ColumnSet"),
                "columns" to JsonArray(columns.toList()),
            ),
        )
    }

    private fun column(label: String, value: String): JsonObject {
        return JsonObject(
            mapOf(
                "type" to JsonPrimitive("Column"),
                "width" to JsonPrimitive("stretch"),
                "items" to JsonArray(
                    listOf(
                        textBlock(label, "Small", "Default", isSubtle = true),
                        textBlock(value, "Medium", "Bolder"),
                    ),
                ),
            ),
        )
    }
}
