// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.navigation

import java.net.URI
import java.util.logging.Logger

/**
 * Handles finance:// deep link protocol navigation.
 *
 * Supported routes:
 * - finance://accounts/{id} -> navigates to account detail
 * - finance://transactions/{id} -> navigates to transaction detail
 * - finance://budgets/{id} -> navigates to budget detail
 * - finance://import?file={path} -> opens import wizard
 * - finance://settings -> opens settings
 * - finance://sync -> triggers sync
 *
 * Protocol registered in AppxManifest.xml via <uap:Protocol>.
 * When the app is launched via deep link, the URI is passed as a
 * command-line argument. When already running, Windows activates
 * the existing instance with the URI.
 */
object DeepLinkHandler {
    private val logger = Logger.getLogger(DeepLinkHandler::class.java.name)

    /** Parse a finance:// URI into a navigation action. */
    fun parse(rawUri: String): DeepLinkAction {
        @Suppress("TooGenericExceptionCaught") // Deep link parsing must not crash the app
        return try {
            val uri = URI(rawUri)
            if (uri.scheme != "finance") return DeepLinkAction.Unknown(rawUri)
            val segments = uri.path?.trimStart('/')?.split('/') ?: emptyList()
            when (uri.host?.lowercase()) {
                "accounts" -> DeepLinkAction.NavigateAccount(segments.getOrNull(0))
                "transactions" -> DeepLinkAction.NavigateTransaction(segments.getOrNull(0))
                "budgets" -> DeepLinkAction.NavigateBudget(segments.getOrNull(0))
                "import" -> DeepLinkAction.OpenImport(uri.query?.substringAfter("file="))
                "settings" -> DeepLinkAction.OpenSettings
                "sync" -> DeepLinkAction.TriggerSync
                else -> DeepLinkAction.Unknown(rawUri)
            }
        } catch (e: Exception) {
            logger.warning("Failed to parse deep link: ${rawUri} - ${e.message}")
            DeepLinkAction.Unknown(rawUri)
        }
    }

    /** Extract deep link URI from command-line arguments. */
    fun extractFromArgs(args: Array<String>): String? =
        args.firstOrNull { it.startsWith("finance://") }
}

sealed class DeepLinkAction {
    data class NavigateAccount(val accountId: String?) : DeepLinkAction()
    data class NavigateTransaction(val transactionId: String?) : DeepLinkAction()
    data class NavigateBudget(val budgetId: String?) : DeepLinkAction()
    data class OpenImport(val filePath: String?) : DeepLinkAction()
    data object OpenSettings : DeepLinkAction()
    data object TriggerSync : DeepLinkAction()
    data class Unknown(val rawUri: String) : DeepLinkAction()
}
