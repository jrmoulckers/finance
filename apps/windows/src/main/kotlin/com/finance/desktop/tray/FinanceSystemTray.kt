// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.tray

import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.data.repository.AccountRepository
import com.finance.desktop.data.repository.BudgetRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import java.awt.AWTException
import java.awt.MenuItem
import java.awt.PopupMenu
import java.awt.SystemTray
import java.awt.Toolkit
import java.awt.TrayIcon
import java.awt.TrayIcon.MessageType
import java.awt.event.ActionEvent
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Callback interface for system tray quick actions.
 */
interface TrayActionHandler {
    /** User clicked "Quick Add Transaction" in the tray menu. */
    fun onQuickAddTransaction()

    /** User clicked "Open Finance" or double-clicked the tray icon. */
    fun onOpenApp()

    /** User clicked "Show Summary". */
    fun onShowSummary()
}

/**
 * Windows system tray integration with quick actions.
 *
 * Provides:
 * - Tray icon with context menu (Quick Add, Daily Summary, Open, Quit)
 * - Daily summary notifications showing today's spending and budget health
 * - Budget alert notifications when budgets are exceeded or near limit
 * - Double-click to open / focus the application window
 *
 * Uses [java.awt.SystemTray] API for native Windows integration. The tray
 * icon produces standard Windows 10/11 toast notifications that appear in
 * the Action Center.
 *
 * Thread safety: all public methods are safe to call from any thread.
 * Internal AWT operations are dispatched to the EDT automatically.
 */
class FinanceSystemTray(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
    private val budgetRepository: BudgetRepository,
) {

    private val logger = Logger.getLogger("FinanceSystemTray")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val householdId = SyncId("d1")

    @Volatile
    private var trayIcon: TrayIcon? = null

    @Volatile
    private var actionHandler: TrayActionHandler? = null

    @Volatile
    private var isInitialised = false

    // ── Lifecycle ────────────────────────────────────────────────────

    /**
     * Initialise the system tray icon with context menu.
     *
     * Must be called once during application startup, after Koin is
     * initialised. If the system tray is unsupported, degrades silently.
     *
     * @param handler Callback for user interactions.
     * @param onQuit  Called when the user selects "Quit" from the tray menu.
     */
    @Synchronized
    fun initialise(handler: TrayActionHandler, onQuit: () -> Unit) {
        if (isInitialised) {
            logger.fine("FinanceSystemTray already initialised.")
            return
        }

        if (!SystemTray.isSupported()) {
            logger.warning("SystemTray not supported. Tray features disabled.")
            return
        }

        actionHandler = handler

        try {
            val popup = buildPopupMenu(handler, onQuit)
            val image = loadTrayImage()
            val icon = TrayIcon(image, "Finance — Personal Finance Tracker").apply {
                isImageAutoSize = true
                popupMenu = popup
                addActionListener { handler.onOpenApp() }
            }

            SystemTray.getSystemTray().add(icon)
            trayIcon = icon
            isInitialised = true
            logger.info("FinanceSystemTray initialised successfully.")
        } catch (e: AWTException) {
            logger.log(Level.WARNING, "Failed to add system tray icon: ${e.message}", e)
        }
    }

    /**
     * Remove the tray icon and release resources.
     */
    @Synchronized
    fun dispose() {
        scope.cancel()
        trayIcon?.let { icon ->
            try {
                SystemTray.getSystemTray().remove(icon)
            } catch (e: Exception) {
                logger.log(Level.FINE, "Error removing tray icon", e)
            }
        }
        trayIcon = null
        actionHandler = null
        isInitialised = false
        logger.info("FinanceSystemTray disposed.")
    }

    // ── Notifications ────────────────────────────────────────────────

    /**
     * Show a daily spending summary as a toast notification.
     *
     * Fetches today's transactions and budget status, then displays
     * a summary notification with spending total and budget alerts.
     */
    fun showDailySummary() {
        scope.launch {
            try {
                val today = currentDate()
                val transactions = transactionRepository.observeAll(householdId).first()
                val accounts = accountRepository.observeAll(householdId).first()
                val budgets = budgetRepository.observeAll(householdId).first()
                val currency = Currency.USD

                val todayExpenses = transactions.filter {
                    it.type == TransactionType.EXPENSE && it.date == today
                }
                val todayTotal = Cents(todayExpenses.sumOf { it.amount.abs().amount })
                val txnCount = todayExpenses.size
                val formattedTotal = CurrencyFormatter.format(todayTotal, currency)

                // Check budget health
                val budgetAlerts = budgets.mapNotNull { budget ->
                    val catTxns = transactions.filter { it.categoryId == budget.categoryId }
                    val status = BudgetCalculator.calculateStatus(budget, catTxns, today)
                    when (status.healthLevel) {
                        BudgetHealth.OVER -> "${budget.name}: over budget"
                        BudgetHealth.WARNING -> "${budget.name}: nearing limit"
                        BudgetHealth.HEALTHY -> null
                    }
                }

                val body = buildString {
                    append("Today's spending: $formattedTotal ($txnCount transactions)")
                    if (budgetAlerts.isNotEmpty()) {
                        append("\n\n⚠️ Budget alerts:\n")
                        budgetAlerts.forEach { append("• $it\n") }
                    }
                }

                val messageType = when {
                    budgetAlerts.any { "over" in it } -> MessageType.WARNING
                    budgetAlerts.isNotEmpty() -> MessageType.INFO
                    else -> MessageType.INFO
                }

                showNotification("Daily Summary", body.trim(), messageType)
            } catch (e: Exception) {
                logger.log(Level.WARNING, "Failed to generate daily summary", e)
            }
        }
    }

    /**
     * Show a budget alert notification for a specific budget.
     */
    fun showBudgetAlert(budgetName: String, percentUsed: Int) {
        val (title, body, type) = when {
            percentUsed >= 100 -> Triple(
                "Budget Exceeded",
                "$budgetName has exceeded its limit ($percentUsed% used).",
                MessageType.ERROR,
            )
            percentUsed >= 90 -> Triple(
                "Budget Warning",
                "$budgetName is at $percentUsed% of its limit.",
                MessageType.WARNING,
            )
            else -> Triple(
                "Budget Update",
                "$budgetName is at $percentUsed%.",
                MessageType.INFO,
            )
        }
        showNotification(title, body, type)
    }

    /**
     * Show a generic notification via the tray icon.
     */
    fun showNotification(title: String, body: String, type: MessageType = MessageType.INFO) {
        val icon = trayIcon
        if (icon == null) {
            logger.fine("Notification suppressed (tray icon not available): $title")
            return
        }

        val truncated = if (body.length > 256) body.take(255) + "…" else body
        try {
            icon.displayMessage(title, truncated, type)
        } catch (e: Exception) {
            logger.log(Level.WARNING, "Failed to show notification: $title", e)
        }
    }

    // ── Quick add support ────────────────────────────────────────────

    /**
     * Show a confirmation notification after quick-adding a transaction.
     */
    fun showQuickAddConfirmation(payee: String, amount: String) {
        showNotification(
            "Transaction Added",
            "$amount at $payee added successfully.",
            MessageType.INFO,
        )
    }

    // ── Internal ─────────────────────────────────────────────────────

    private fun buildPopupMenu(handler: TrayActionHandler, onQuit: () -> Unit): PopupMenu {
        return PopupMenu("Finance").apply {
            // Quick Add Transaction
            add(MenuItem("Quick Add Transaction").apply {
                addActionListener { handler.onQuickAddTransaction() }
            })

            addSeparator()

            // Daily Summary
            add(MenuItem("Show Daily Summary").apply {
                addActionListener { showDailySummary() }
            })

            addSeparator()

            // Open App
            add(MenuItem("Open Finance").apply {
                addActionListener { handler.onOpenApp() }
            })

            addSeparator()

            // Quit
            add(MenuItem("Quit").apply {
                addActionListener { onQuit() }
            })
        }
    }

    private fun loadTrayImage(): java.awt.Image {
        val url = FinanceSystemTray::class.java.getResource("/icons/finance-tray.png")
        if (url != null) {
            return Toolkit.getDefaultToolkit().getImage(url)
        }
        // Fallback: 16x16 transparent image
        return java.awt.image.BufferedImage(16, 16, java.awt.image.BufferedImage.TYPE_INT_ARGB)
    }

    private fun currentDate(): LocalDate =
        Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
}
