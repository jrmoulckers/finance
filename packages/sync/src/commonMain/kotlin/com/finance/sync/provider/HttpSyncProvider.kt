// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.provider

import com.finance.sync.PullResult
import com.finance.sync.PushFailure
import com.finance.sync.PushResult
import com.finance.sync.SyncChange
import com.finance.sync.SyncConfig
import com.finance.sync.SyncCredentials
import com.finance.sync.SyncMutation
import com.finance.sync.SyncProvider
import com.finance.sync.SyncStatus
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.emptyFlow

/**
 * HTTP-based [SyncProvider] implementation using Ktor client.
 *
 * Communicates with the sync backend over HTTPS using JSON serialisation.
 * This provider implements the REST sync protocol:
 *
 * - **Pull**: `POST {endpoint}/sync/pull` with per-table version markers.
 * - **Push**: `POST {endpoint}/sync/push` with batched local mutations.
 *
 * The [HttpClient] is injected so callers can configure platform-specific
 * engines (OkHttp on JVM/Android, Darwin on iOS, Js on browser), install
 * content negotiation, logging, and retry plugins as needed.
 *
 * ## Usage
 *
 * ```kotlin
 * val httpClient = HttpClient {
 *     install(ContentNegotiation) { json() }
 * }
 *
 * val provider = HttpSyncProvider(httpClient)
 * provider.connect(credentials, config)
 *
 * // Use with DeltaSyncManager / DefaultSyncEngine
 * val deltaSyncManager = DeltaSyncManager(provider, sequenceTracker, config)
 * ```
 *
 * @param httpClient Ktor [HttpClient] with JSON content negotiation installed.
 *   Callers are responsible for configuring engine, timeouts, and logging.
 */
class HttpSyncProvider(
    private val httpClient: HttpClient,
) : SyncProvider {

    private var baseUrl: String = ""
    private var authToken: String = ""
    private var userId: String = ""
    private var batchSize: Int = 100

    private val _status = MutableStateFlow<SyncStatus>(SyncStatus.Idle)

    override suspend fun initialize(config: SyncConfig) {
        baseUrl = config.endpoint.trimEnd('/')
        batchSize = config.batchSize
    }

    override suspend fun connect(credentials: SyncCredentials, config: SyncConfig) {
        baseUrl = config.endpoint.trimEnd('/')
        authToken = credentials.authToken
        userId = credentials.userId
        batchSize = config.batchSize
        _status.value = SyncStatus.Connected
    }

    override suspend fun disconnect() {
        _status.value = SyncStatus.Disconnected
    }

    override suspend fun push(mutations: List<SyncMutation>): Result<Unit> {
        return try {
            val result = pushMutations(mutations)
            if (result.isFullySuccessful) {
                Result.success(Unit)
            } else {
                val errors = result.failed.joinToString("; ") { it.error }
                Result.failure(RuntimeException("Push partially failed: $errors"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override fun pull(): Flow<List<SyncChange>> = emptyFlow()

    override fun getStatus(): Flow<SyncStatus> = _status.asStateFlow()

    /**
     * Pull changes from the sync backend since the given [since] versions.
     *
     * Sends a `POST {endpoint}/sync/pull` request with the version markers
     * and deserialises the response into a [PullResult].
     *
     * @param since Map of table name → last known sync version.
     * @return A [PullResult] containing changes, updated versions, and pagination flag.
     * @throws Exception if the HTTP request fails or returns a non-2xx status.
     */
    override suspend fun pullChanges(since: Map<String, Long>): PullResult {
        val requestDto = PullRequestDto(
            sinceVersions = since,
            batchSize = batchSize,
        )

        val response: HttpResponse = httpClient.post("$baseUrl/sync/pull") {
            contentType(ContentType.Application.Json)
            bearerAuth(authToken)
            setBody(requestDto)
        }

        if (!response.status.isSuccess()) {
            val statusCode = response.status.value
            throw SyncHttpException(
                statusCode = statusCode,
                message = "Pull failed with HTTP $statusCode",
            )
        }

        val responseDto: PullResponseDto = response.body()

        return PullResult(
            changes = responseDto.changes.map { it.toSyncChange() },
            newVersions = responseDto.newVersions,
            hasMore = responseDto.hasMore,
        )
    }

    /**
     * Push local mutations to the sync backend with per-mutation result tracking.
     *
     * Sends a `POST {endpoint}/sync/push` request with the serialised
     * mutations and returns a [PushResult] with per-mutation outcomes.
     *
     * @param mutations The mutations to push.
     * @return A [PushResult] with lists of succeeded and failed mutation IDs.
     * @throws Exception if the HTTP request fails or returns a non-2xx status.
     */
    override suspend fun pushMutations(mutations: List<SyncMutation>): PushResult {
        if (mutations.isEmpty()) {
            return PushResult(succeeded = emptyList(), failed = emptyList())
        }

        val requestDto = PushRequestDto(
            mutations = mutations.map { mutation ->
                MutationDto(
                    id = mutation.id,
                    tableName = mutation.tableName,
                    operation = mutation.operation.name,
                    rowData = mutation.rowData,
                    timestamp = mutation.timestamp.toString(),
                    recordId = mutation.recordId,
                )
            },
        )

        val response: HttpResponse = httpClient.post("$baseUrl/sync/push") {
            contentType(ContentType.Application.Json)
            bearerAuth(authToken)
            setBody(requestDto)
        }

        if (!response.status.isSuccess()) {
            val statusCode = response.status.value
            // Server errors are retryable; client errors are not
            val retryable = statusCode >= 500
            return PushResult(
                succeeded = emptyList(),
                failed = mutations.map { m ->
                    PushFailure(
                        mutationId = m.id,
                        error = "Push failed with HTTP $statusCode",
                        retryable = retryable,
                    )
                },
            )
        }

        val responseDto: PushResponseDto = response.body()

        return PushResult(
            succeeded = responseDto.succeeded,
            failed = responseDto.failed.map { f ->
                PushFailure(
                    mutationId = f.mutationId,
                    error = f.error,
                    retryable = f.retryable,
                )
            },
        )
    }
}

/**
 * Exception thrown when the sync HTTP endpoint returns a non-success status.
 *
 * @property statusCode The HTTP status code.
 * @property message Human-readable error description.
 */
class SyncHttpException(
    val statusCode: Int,
    override val message: String,
) : Exception(message)
