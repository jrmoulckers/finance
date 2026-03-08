package com.finance.desktop.notifications

import com.finance.models.types.Cents
import java.awt.AWTException
import java.awt.Image
import java.awt.SystemTray
import java.awt.Toolkit
import java.awt.TrayIcon
import java.awt.TrayIcon.MessageType
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.logging.Level
import java.util.logging.Logger

// =============================================================================
// Windows Desktop Notification Manager
// =============================================================================
//
// Delivers toast notifications through the Windows system tray using the AWT
// [SystemTray] / [TrayIcon] API. This is the only JVM-native notification
// mechanism that produces real Windows toast notifications (displayed in the
// Action Center) without requiring a native library or JNI interop.
//
// Lifecycle:
//   1. Call [initialise] once at application start (from Main.kt).
//   2. Call show* methods whenever a notification is needed.
//   3. Call [dispose] on application exit to remove the tray icon.

/**
 * Manages Windows toast notifications for the Finance desktop application.
 *
 * Notifications are delivered via [java.awt.SystemTray] which surfaces as
 * standard Windows 10/11 toast notifications in the Action Center. This
 * approach requires no native dependencies and works on any JVM ≥ 11.
 *
 * Thread safety: all public methods are safe to call from any thread. The
 * underlying AWT tray icon dispatches to the EDT internally.
 */
object DesktopNotificationManager {

    private val logger: Logger = Logger.getLogger("DesktopNotificationManager")

    /** Human-readable application name shown in notification headers. */
    private const val APP_DISPLAY_NAME = "Finance"

    /** Maximum characters for the notification body before truncation. */
    private const val MAX_BODY_LENGTH = 256

    /**
     * The single tray icon used for all notifications. Nullable because
     * [SystemTray] may not be supported on all JVM/OS combinations.
     */
    @Volatile
    private var trayIcon: TrayIcon? = null

    /** True after a successful call to [initialise]. */
    @Volatile
    private var initialised: Boolean = false

    // =========================================================================
    // Lifecycle
    // =========================================================================

    /**
     * Sets up the system tray icon required for delivering notifications.
     *
     * Must be called once during application startup. If the system tray is
     * not supported (e.g. headless environment, unsupported Linux WM), the
     * manager logs a warning and silently degrades — all subsequent show*
     * calls become no-ops.
     *
     * @param iconPath Optional classpath resource path for the tray icon
     *   image. Defaults to a 16×16 transparent placeholder if not provided
     *   or if the resource cannot be loaded.
     */
    @Synchronized
    fun initialise(iconPath: String? = null) {
        if (initialised) {
            logger.fine("DesktopNotificationManager already initialised, skipping.")
            return
        }

        if (!SystemTray.isSupported()) {
            logger.warning(
                "SystemTray is not supported on this platform. " +
                    "Desktop notifications will be disabled.",
            )
            return
        }

        try {
            val image = loadIcon(iconPath)
            val icon = TrayIcon(image, APP_DISPLAY_NAME).apply {
                isImageAutoSize = true
            }
            SystemTray.getSystemTray().add(icon)
            trayIcon = icon
            initialised = true
            logger.info("DesktopNotificationManager initialised successfully.")
        } catch (e: AWTException) {
            logger.log(Level.WARNING, "Failed to add tray icon: ${e.message}", e)
        }
    }

    /**
     * Removes the tray icon from the system tray and releases resources.
     *
     * Call this when the application is shutting down to avoid orphaned
     * tray icons persisting after the JVM exits.
     */
    @Synchronized
    fun dispose() {
        trayIcon?.let { icon ->
            try {
                SystemTray.getSystemTray().remove(icon)
            } catch (e: Exception) {
                logger.log(Level.FINE, "Error removing tray icon during dispose", e)
            }
        }
        trayIcon = null
        initialised = false
        logger.info("DesktopNotificationManager disposed.")
    }

    // =========================================================================
    // Notification channels — semantic helpers
    // =========================================================================

    /**
     * Shows a budget alert notification when spending approaches or exceeds
     * the budget limit.
     *
     * The notification type escalates based on [percentUsed]:
     * - **≥ 100 %** → [MessageType.ERROR] (budget exceeded)
     * - **≥ 90 %**  → [MessageType.WARNING] (approaching limit)
     * - **otherwise** → [MessageType.INFO]
     *
     * @param budgetName Display name of the budget (e.g. "Groceries").
     * @param percentUsed Current spending as a percentage of the budget
     *   limit, where 100 means exactly at the limit.
     */
    fun showBudgetAlert(budgetName: String, percentUsed: Int) {
        val (title, body, type) = when {
            percentUsed >= 100 -> Triple(
                "Budget Exceeded",
                "$budgetName budget has exceeded its limit ($percentUsed% used). " +
                    "Review your spending to get back on track.",
                MessageType.ERROR,
            )
            percentUsed >= 90 -> Triple(
                "Budget Warning",
                "$budgetName budget is at $percentUsed%. " +
                    "You're approaching the limit for this period.",
                MessageType.WARNING,
            )
            else -> Triple(
                "Budget Update",
                "$budgetName budget is at $percentUsed% of the period limit.",
                MessageType.INFO,
            )
        }
        showNotification(title, body, type)
    }

    /**
     * Shows a bill reminder notification before a bill is due.
     *
     * The notification type escalates based on proximity to the due date:
     * - **Past due** → [MessageType.ERROR]
     * - **Due today** → [MessageType.WARNING]
     * - **Upcoming** → [MessageType.INFO]
     *
     * @param billName Display name of the bill (e.g. "Electric bill").
     * @param dueDate Due date as [java.time.LocalDate].
     * @param amount Bill amount in [Cents].
     */
    fun showBillReminder(billName: String, dueDate: LocalDate, amount: Cents) {
        val formattedDate = dueDate.format(
            DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM),
        )
        val formattedAmount = formatCentsForDisplay(amount)
        val today = LocalDate.now()

        val (title, body, type) = when {
            dueDate.isBefore(today) -> Triple(
                "Bill Overdue",
                "$billName ($formattedAmount) was due on $formattedDate. " +
                    "Please review and pay as soon as possible.",
                MessageType.ERROR,
            )
            dueDate.isEqual(today) -> Triple(
                "Bill Due Today",
                "$billName ($formattedAmount) is due today, $formattedDate.",
                MessageType.WARNING,
            )
            else -> Triple(
                "Upcoming Bill",
                "$billName ($formattedAmount) is due on $formattedDate.",
                MessageType.INFO,
            )
        }
        showNotification(title, body, type)
    }

    /**
     * Shows a notification after a sync operation completes.
     *
     * @param itemCount Number of items synchronised. If zero, a "no changes"
     *   message is shown instead.
     */
    fun showSyncComplete(itemCount: Int) {
        val body = if (itemCount == 0) {
            "Sync complete. Everything is up to date."
        } else {
            val itemWord = if (itemCount == 1) "item" else "items"
            "Sync complete — $itemCount $itemWord updated across your devices."
        }
        showNotification("Sync Complete", body, MessageType.INFO)
    }

    // =========================================================================
    // Core notification dispatch
    // =========================================================================

    /**
     * Displays a Windows toast notification via the system tray icon.
     *
     * If the manager has not been initialised or the system tray is
     * unavailable, the call is silently ignored and a debug-level log
     * message is emitted.
     *
     * @param title Notification title (bold text in the toast header).
     * @param body  Notification body text. Truncated to [MAX_BODY_LENGTH]
     *   characters to avoid overflow in the toast UI.
     * @param type  AWT [MessageType] controlling the notification icon
     *   (info, warning, error, or none).
     */
    fun showNotification(
        title: String,
        body: String,
        type: MessageType = MessageType.INFO,
    ) {
        val icon = trayIcon
        if (icon == null) {
            logger.fine(
                "Notification suppressed (tray icon not available): $title",
            )
            return
        }

        val truncatedBody = if (body.length > MAX_BODY_LENGTH) {
            body.take(MAX_BODY_LENGTH - 1) + "…"
        } else {
            body
        }

        try {
            icon.displayMessage(title, truncatedBody, type)
        } catch (e: Exception) {
            logger.log(
                Level.WARNING,
                "Failed to display notification '$title': ${e.message}",
                e,
            )
        }
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    /**
     * Loads a tray icon image from the classpath.
     *
     * Falls back to the default AWT toolkit image if the resource is
     * missing or cannot be loaded.
     */
    private fun loadIcon(resourcePath: String?): Image {
        if (resourcePath != null) {
            val url = DesktopNotificationManager::class.java.getResource(resourcePath)
            if (url != null) {
                return Toolkit.getDefaultToolkit().getImage(url)
            }
            logger.warning("Tray icon resource not found: $resourcePath — using default.")
        }
        // Create a minimal 16x16 transparent image as fallback.
        return java.awt.image.BufferedImage(16, 16, java.awt.image.BufferedImage.TYPE_INT_ARGB)
    }

    /**
     * Formats a [Cents] value for human-readable display in notifications.
     *
     * Uses simple USD formatting. In production, this should delegate to
     * the shared CurrencyFormatter from `packages/core`, but notification
     * text does not warrant a full dependency on the formatter module.
     */
    private fun formatCentsForDisplay(cents: Cents): String {
        val absCents = if (cents.amount < 0) -cents.amount else cents.amount
        val dollars = absCents / 100
        val remainder = absCents % 100
        val sign = if (cents.amount < 0) "-" else ""
        return "$sign$$dollars.${remainder.toString().padStart(2, '0')}"
    }
}
