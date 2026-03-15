// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.queue

import com.finance.sync.SyncMutation
import com.finance.sync.SyncProvider
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

// ── New batch-processing types ──────────────────────────────────────────

/**
 * Observable processing state for the queue processor.
 */
sealed class ProcessingState {
    /** No processing activity. */
    data object Idle : ProcessingState()

    /**
     * Currently processing a batch of mutations.
     *
     * @property batchSize Total mutations in the current batch.
     * @property processed Number of mutations processed so far across all
     *   batches in the current [QueueProcessor.processAll] invocation.
     */
    data class Processing(val batchSize: Int, val processed: Int) : ProcessingState()

    /** Waiting before retrying a failed batch (backoff in progress). */
    data object WaitingForRetry : ProcessingState()

    /**
     * A non-retryable or exhausted-retries error halted processing.
     *
     * @property error Human-readable description of the failure(s).
     */
    data class Failed(val error: String) : ProcessingState()
}

/**
 * Aggregate result of processing one or more batches of mutations.
 *
 * @property succeeded Mutations that were pushed and acknowledged.
 * @property failed Mutations that failed with non-retryable errors (removed).
 * @property retryable Mutations that failed but are eligible for retry.
 * @property deadLettered Mutations whose retry count reached the maximum.
 */
data class ProcessingResult(
    val succeeded: Int,
    val failed: Int,
    val retryable: Int,
    val deadLettered: Int,
)

/**
 * Result from pushing a batch of mutations to the server.
 *
 * Allows partial success: some mutations may succeed while others fail.
 *
 * @property succeeded IDs of mutations the server accepted.
 * @property failed Details about each mutation that the server rejected.
 */
data class PushResult(
    val succeeded: List<String>,
    val failed: List<PushFailure>,
)

/**
 * Details about a single mutation push failure.
 *
 * @property mutationId The ID of the mutation that failed.
 * @property error Human-readable error description.
 * @property retryable `true` if the failure is transient and the mutation
 *   should be retried; `false` if it is permanent (e.g., validation error).
 */
data class PushFailure(
    val mutationId: String,
    val error: String,
    val retryable: Boolean,
)

// ── Legacy status (kept for backward compatibility) ─────────────────────

/**
 * Status of the [QueueProcessor]'s push cycle.
 *
 * **Legacy API** — prefer observing [QueueProcessor.state] ([ProcessingState])
 * for new code.
 */
sealed class QueueProcessorStatus {
    /** No mutations to process. */
    data object Idle : QueueProcessorStatus()

    /** Currently pushing mutations. */
    data class Processing(val remaining: Int) : QueueProcessorStatus()

    /** A mutation failed after all retries. */
    data class Failed(val mutationId: String, val error: Throwable) : QueueProcessorStatus()

    /** All pending mutations were pushed successfully. */
    data object Completed : QueueProcessorStatus()
}

// ── Processor ───────────────────────────────────────────────────────────

/**
 * Processes mutations from the [MutationQueue] and pushes them to the sync
 * backend.
 *
 * Features:
 * - **Batch processing**: pushes up to [batchSize] mutations per round-trip.
 * - **Partial failure handling**: successfully pushed mutations are
 *   acknowledged even when others in the same batch fail.
 * - **Exponential backoff with jitter**: retries use
 *   `min(baseMs × 2^retryCount, maxMs) × jitter` to avoid thundering herds.
 * - **Dead-letter detection**: mutations exceeding [maxRetries] are skipped
 *   and reported.
 * - **Observable state**: callers observe progress via [state].
 *
 * Two constructor overloads are provided:
 * 1. **Primary** — accepts a `pushFn` lambda for maximum flexibility.
 * 2. **Legacy** — accepts a [SyncProvider] and wraps its `push()` method.
 *
 * @property queue         The mutation queue to drain.
 * @property pushFn        Function that pushes a batch to the server and
 *   returns a [PushResult] indicating per-mutation success/failure.
 * @property batchSize     Number of mutations per push batch (default 50).
 * @property maxRetries    Maximum retry attempts before dead-lettering
 *   (default 5).
 * @property baseBackoffMs Base delay for exponential backoff (default 1 000).
 * @property maxBackoffMs  Ceiling for backoff delay (default 60 000).
 */
class QueueProcessor private constructor(
    private val queue: MutationQueue,
    private val pushFn: suspend (List<SyncMutation>) -> PushResult,
    private val batchSize: Int,
    private val maxRetries: Int,
    private val baseBackoffMs: Long,
    private val maxBackoffMs: Long,
    private val backoffFactor: Double,
) {

    // ── Public constructors ─────────────────────────────────────────────

    /**
     * Primary constructor — uses a [pushFn] lambda to push mutations.
     */
    constructor(
        queue: MutationQueue,
        pushFn: suspend (List<SyncMutation>) -> PushResult,
        batchSize: Int = DEFAULT_BATCH_SIZE,
        maxRetries: Int = DEFAULT_MAX_RETRIES,
        baseBackoffMs: Long = DEFAULT_BASE_BACKOFF_MS,
        maxBackoffMs: Long = DEFAULT_MAX_BACKOFF_MS,
    ) : this(
        queue = queue,
        pushFn = pushFn,
        batchSize = batchSize,
        maxRetries = maxRetries,
        baseBackoffMs = baseBackoffMs,
        maxBackoffMs = maxBackoffMs,
        backoffFactor = BACKOFF_FACTOR,
    )

    /**
     * Legacy constructor — wraps a [SyncProvider] into a [PushResult]-based
     * push function.
     *
     * Maintained for backward compatibility with code that already uses
     * [SyncProvider] directly.
     */
    constructor(
        queue: MutationQueue,
        provider: SyncProvider,
        maxRetries: Int = MAX_RETRIES,
        initialBackoffMs: Long = INITIAL_BACKOFF_MS,
        maxBackoffMs: Long = MAX_BACKOFF_MS,
        backoffFactor: Double = BACKOFF_FACTOR,
    ) : this(
        queue = queue,
        pushFn = { mutations ->
            val result = provider.push(mutations)
            if (result.isSuccess) {
                PushResult(
                    succeeded = mutations.map { it.id },
                    failed = emptyList(),
                )
            } else {
                val error = result.exceptionOrNull()?.message ?: "Unknown error"
                PushResult(
                    succeeded = emptyList(),
                    failed = mutations.map {
                        PushFailure(it.id, error, retryable = true)
                    },
                )
            }
        },
        batchSize = 1, // Legacy API processes one mutation at a time.
        maxRetries = maxRetries,
        baseBackoffMs = initialBackoffMs,
        maxBackoffMs = maxBackoffMs,
        backoffFactor = backoffFactor,
    )

    // ── Observable state ────────────────────────────────────────────────

    private val _state = MutableStateFlow<ProcessingState>(ProcessingState.Idle)

    /** Observable processing state. */
    val state: StateFlow<ProcessingState> = _state.asStateFlow()

    // ── New batch API ───────────────────────────────────────────────────

    /**
     * Process the next batch of mutations.
     *
     * Peeks at up to [batchSize] mutations, pushes them via [pushFn], then
     * acknowledges successes and marks failures. Dead-lettered mutations
     * (those at or above [maxRetries]) are counted but left in the queue
     * for manual inspection via [MutationQueue.getDeadLetterMutations].
     *
     * @return The result of the processing attempt.
     */
    suspend fun processNextBatch(): ProcessingResult {
        val batch = queue.peekBatch(batchSize)
        if (batch.isEmpty()) {
            _state.value = ProcessingState.Idle
            return ProcessingResult(succeeded = 0, failed = 0, retryable = 0, deadLettered = 0)
        }

        _state.value = ProcessingState.Processing(batchSize = batch.size, processed = 0)

        val result = pushFn(batch)

        // Acknowledge successfully pushed mutations.
        if (result.succeeded.isNotEmpty()) {
            queue.acknowledge(result.succeeded)
        }

        // Categorise failures.
        var retryable = 0
        var deadLettered = 0
        var permanentlyFailed = 0

        val retryableIds = mutableListOf<String>()
        val nonRetryableIds = mutableListOf<String>()

        for (failure in result.failed) {
            if (failure.retryable) {
                retryableIds.add(failure.mutationId)
            } else {
                nonRetryableIds.add(failure.mutationId)
            }
        }

        // Increment retry counts for retryable failures.
        if (retryableIds.isNotEmpty()) {
            queue.markFailed(retryableIds)
            for (id in retryableIds) {
                val count = queue.getRetryCount(id)
                if (count >= maxRetries) {
                    deadLettered++
                } else {
                    retryable++
                }
            }
        }

        // Non-retryable failures are removed from the queue immediately.
        if (nonRetryableIds.isNotEmpty()) {
            queue.acknowledge(nonRetryableIds)
            permanentlyFailed = nonRetryableIds.size
        }

        val processingResult = ProcessingResult(
            succeeded = result.succeeded.size,
            failed = permanentlyFailed,
            retryable = retryable,
            deadLettered = deadLettered,
        )

        // Transition observable state.
        _state.value = when {
            retryable > 0 -> ProcessingState.WaitingForRetry
            permanentlyFailed > 0 || deadLettered > 0 -> {
                val errorMsgs = result.failed.joinToString("; ") { it.error }
                ProcessingState.Failed(errorMsgs)
            }
            else -> ProcessingState.Idle
        }

        return processingResult
    }

    /**
     * Process all pending mutations in the queue.
     *
     * Continues draining the queue in [batchSize]-sized chunks until:
     * - The queue is empty, or
     * - Only dead-lettered mutations remain, or
     * - All mutations in a batch fail with non-retryable errors.
     *
     * Backoff delays are applied when retried mutations are present.
     *
     * @return Aggregate [ProcessingResult] covering all batches.
     */
    suspend fun processAll(): ProcessingResult {
        var totalSucceeded = 0
        var totalFailed = 0
        var totalRetryable = 0
        var totalDeadLettered = 0

        while (true) {
            val pending = queue.peekBatch(batchSize)
            if (pending.isEmpty()) break

            // Filter out dead-lettered mutations.
            val processable = mutableListOf<SyncMutation>()
            var skippedDead = 0
            for (mutation in pending) {
                if (queue.getRetryCount(mutation.id) >= maxRetries) {
                    skippedDead++
                } else {
                    processable.add(mutation)
                }
            }

            if (processable.isEmpty()) {
                // Only dead-letter mutations remain — stop processing.
                totalDeadLettered += skippedDead
                break
            }

            // Apply backoff if any mutation has been retried.
            val maxRetryCount = processable.maxOf { queue.getRetryCount(it.id) }
            if (maxRetryCount > 0) {
                _state.value = ProcessingState.WaitingForRetry
                val backoff = calculateBackoff(maxRetryCount)
                delay(backoff)
            }

            _state.value = ProcessingState.Processing(
                batchSize = processable.size,
                processed = totalSucceeded,
            )

            val result = pushFn(processable)

            // Acknowledge successes.
            if (result.succeeded.isNotEmpty()) {
                queue.acknowledge(result.succeeded)
                totalSucceeded += result.succeeded.size
            }

            // Handle failures.
            val retryableIds = mutableListOf<String>()
            val nonRetryableIds = mutableListOf<String>()

            for (failure in result.failed) {
                if (failure.retryable) {
                    retryableIds.add(failure.mutationId)
                } else {
                    nonRetryableIds.add(failure.mutationId)
                }
            }

            if (retryableIds.isNotEmpty()) {
                queue.markFailed(retryableIds)
                for (id in retryableIds) {
                    val count = queue.getRetryCount(id)
                    if (count >= maxRetries) {
                        totalDeadLettered++
                    } else {
                        totalRetryable++
                    }
                }
            }

            if (nonRetryableIds.isNotEmpty()) {
                queue.acknowledge(nonRetryableIds)
                totalFailed += nonRetryableIds.size
            }

            // If nothing succeeded and nothing is retryable, stop.
            if (result.succeeded.isEmpty() && retryableIds.isEmpty()) {
                val errorMsgs = result.failed.joinToString("; ") { it.error }
                _state.value = ProcessingState.Failed(errorMsgs)
                totalFailed += nonRetryableIds.size - nonRetryableIds.size // already counted
                break
            }
        }

        _state.value = ProcessingState.Idle
        return ProcessingResult(
            succeeded = totalSucceeded,
            failed = totalFailed,
            retryable = totalRetryable,
            deadLettered = totalDeadLettered,
        )
    }

    /**
     * Calculate backoff delay with jitter.
     *
     * Formula: `min(baseMs × 2^(retryCount−1), maxMs) × (0.5 + random(0, 0.5))`
     *
     * The jitter factor (0.5–1.0×) prevents thundering-herd problems when
     * many clients retry simultaneously.
     *
     * @param retryCount The retry attempt number (1-based).
     * @return Delay in milliseconds.
     */
    fun calculateBackoff(retryCount: Int): Long {
        val exponential = baseBackoffMs * BACKOFF_FACTOR.pow(retryCount - 1)
        val capped = min(exponential.toLong(), maxBackoffMs)
        val jitter = 0.5 + Random.nextDouble() * 0.5
        return (capped * jitter).toLong()
    }

    // ── Legacy API (backward compatible) ────────────────────────────────

    /**
     * Start processing the queue one mutation at a time.
     *
     * Returns a cold [Flow] that emits [QueueProcessorStatus] updates.
     * The flow completes when the queue is empty or a mutation exhausts its
     * retries.
     *
     * **Legacy API** — prefer [processNextBatch] or [processAll] for new code.
     */
    fun process(): Flow<QueueProcessorStatus> = flow {
        emit(QueueProcessorStatus.Idle)

        while (true) {
            val mutation = queue.peek() ?: break

            var attempt = 0
            var pushed = false

            while (attempt < maxRetries) {
                val result = pushFn(listOf(mutation))

                if (result.succeeded.contains(mutation.id)) {
                    queue.dequeue(mutation.id)
                    pushed = true
                    break
                }

                attempt++

                if (attempt >= maxRetries) {
                    val errorMsg = result.failed.firstOrNull()?.error
                        ?: "Push failed after $maxRetries attempts"
                    emit(
                        QueueProcessorStatus.Failed(
                            mutation.id,
                            RuntimeException(errorMsg),
                        ),
                    )
                    // Remove the permanently-failed mutation so the queue
                    // isn't stuck.
                    queue.dequeue(mutation.id)
                    break
                }

                val delayMs = computeBackoff(attempt)
                delay(delayMs)
            }

            if (pushed) {
                val remaining = queue.pendingCount()
                if (remaining > 0) {
                    emit(QueueProcessorStatus.Processing(remaining))
                }
            }
        }

        emit(QueueProcessorStatus.Completed)
    }

    /**
     * Compute the back-off delay for the given [attempt] (1-based).
     *
     * **Legacy API** — prefer [calculateBackoff] for new code.
     */
    internal fun computeBackoff(attempt: Int): Long {
        val raw = baseBackoffMs * backoffFactor.pow(attempt - 1)
        return min(raw.toLong(), maxBackoffMs)
    }

    companion object {
        /** @suppress Legacy constant — use [DEFAULT_MAX_RETRIES] for new code. */
        const val MAX_RETRIES = 10

        /** @suppress Legacy constant — use [DEFAULT_BASE_BACKOFF_MS] for new code. */
        const val INITIAL_BACKOFF_MS = 1_000L

        /** Default maximum retries for the new batch API. */
        const val DEFAULT_MAX_RETRIES = 5

        /** Default batch size for [processNextBatch] / [processAll]. */
        const val DEFAULT_BATCH_SIZE = 50

        /** Default base backoff delay in milliseconds. */
        const val DEFAULT_BASE_BACKOFF_MS = 1_000L

        /** Maximum backoff delay in milliseconds (5 minutes). */
        const val MAX_BACKOFF_MS = 300_000L

        /** Default maximum backoff delay for the new batch API (60 seconds). */
        const val DEFAULT_MAX_BACKOFF_MS = 60_000L

        /** Backoff multiplier applied after each failed attempt. */
        const val BACKOFF_FACTOR = 2.0
    }
}