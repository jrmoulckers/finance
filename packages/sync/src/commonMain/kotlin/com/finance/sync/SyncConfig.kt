// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import kotlinx.serialization.Serializable

/**
 * Configuration for initialising a [SyncProvider].
 *
 * Combines connection parameters with operational tuning knobs for
 * retry behaviour, batching, and timeouts. Immutable — use [copy] to
 * create variants.
 *
 * @property endpoint The base URL of the sync backend (e.g. PowerSync service).
 * @property databaseName Local database file name used by the sync provider.
 * @property syncRulesRef An opaque reference to the active sync-rules version on the backend.
 *   May be `null` when the provider discovers rules automatically.
 * @property syncIntervalMs Milliseconds between automatic sync cycles. Default 30 000 (30 s).
 * @property maxRetryAttempts Maximum number of retry attempts for a failed sync operation.
 * @property retryBackoffBaseMs Base delay in milliseconds for exponential back-off. Default 1 000.
 * @property retryBackoffMaxMs Ceiling for exponential back-off delay. Default 60 000 (1 min).
 * @property batchSize Maximum number of records per push/pull batch. Default 100.
 * @property enableCompression Whether to request compressed payloads from the server.
 * @property connectionTimeoutMs TCP connection timeout in milliseconds. Default 10 000.
 * @property requestTimeoutMs Per-request timeout in milliseconds. Default 30 000.
 */
@Serializable
data class SyncConfig(
    val endpoint: String,
    val databaseName: String,
    val syncRulesRef: String? = null,
    val syncIntervalMs: Long = 30_000L,
    val maxRetryAttempts: Int = 5,
    val retryBackoffBaseMs: Long = 1_000L,
    val retryBackoffMaxMs: Long = 60_000L,
    val batchSize: Int = 100,
    val enableCompression: Boolean = true,
    val connectionTimeoutMs: Long = 10_000L,
    val requestTimeoutMs: Long = 30_000L,
) {
    init {
        require(endpoint.isNotBlank()) { "Sync endpoint cannot be blank" }
        require(databaseName.isNotBlank()) { "Database name cannot be blank" }
        require(syncIntervalMs > 0) { "Sync interval must be positive, got $syncIntervalMs" }
        require(maxRetryAttempts >= 0) { "Max retry attempts must be non-negative, got $maxRetryAttempts" }
        require(retryBackoffBaseMs > 0) { "Retry backoff base must be positive, got $retryBackoffBaseMs" }
        require(retryBackoffMaxMs >= retryBackoffBaseMs) {
            "Retry backoff max ($retryBackoffMaxMs) must be >= base ($retryBackoffBaseMs)"
        }
        require(batchSize > 0) { "Batch size must be positive, got $batchSize" }
        require(connectionTimeoutMs > 0) { "Connection timeout must be positive, got $connectionTimeoutMs" }
        require(requestTimeoutMs > 0) { "Request timeout must be positive, got $requestTimeoutMs" }
    }
}
