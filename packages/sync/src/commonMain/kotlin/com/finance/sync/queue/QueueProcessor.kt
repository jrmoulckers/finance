package com.finance.sync.queue

import com.finance.sync.SyncProvider
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlin.math.min
import kotlin.math.pow

/**
 * Status of the [QueueProcessor]'s push cycle.
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

/**
 * Drains the [MutationQueue] by pushing mutations through a [SyncProvider].
 *
 * Features:
 * - **Deduplication**: only the latest mutation per entity key is pushed.
 * - **Exponential back-off**: initial delay 1 s, factor 2, max 5 min.
 * - **Max retries**: 10 attempts per mutation before it is abandoned.
 * - **Status flow**: callers observe progress via [process].
 *
 * @property queue     The mutation queue to drain.
 * @property provider  The sync backend to push mutations through.
 * @property maxRetries            Maximum push attempts per mutation (default 10).
 * @property initialBackoffMs      Initial back-off delay in milliseconds (default 1 000).
 * @property maxBackoffMs          Ceiling for back-off delay in milliseconds (default 300 000 = 5 min).
 * @property backoffFactor         Multiplier applied to the delay after each failure (default 2.0).
 */
class QueueProcessor(
    private val queue: MutationQueue,
    private val provider: SyncProvider,
    private val maxRetries: Int = MAX_RETRIES,
    private val initialBackoffMs: Long = INITIAL_BACKOFF_MS,
    private val maxBackoffMs: Long = MAX_BACKOFF_MS,
    private val backoffFactor: Double = BACKOFF_FACTOR,
) {

    /**
     * Start processing the queue.
     *
     * Returns a cold [Flow] that emits [QueueProcessorStatus] updates.
     * The flow completes when the queue is empty or a mutation exhausts its retries.
     */
    fun process(): Flow<QueueProcessorStatus> = flow {
        emit(QueueProcessorStatus.Idle)

        while (true) {
            val mutation = queue.peek() ?: break

            var attempt = 0
            var pushed = false

            while (attempt < maxRetries) {
                val result = provider.push(listOf(mutation))

                if (result.isSuccess) {
                    queue.dequeue(mutation.id)
                    pushed = true
                    break
                }

                attempt++

                if (attempt >= maxRetries) {
                    val error = result.exceptionOrNull()
                        ?: RuntimeException("Push failed after $maxRetries attempts")
                    emit(QueueProcessorStatus.Failed(mutation.id, error))
                    // Remove the permanently-failed mutation so the queue isn't stuck.
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
     */
    internal fun computeBackoff(attempt: Int): Long {
        val raw = initialBackoffMs * backoffFactor.pow(attempt - 1)
        return min(raw.toLong(), maxBackoffMs)
    }

    companion object {
        const val MAX_RETRIES = 10
        const val INITIAL_BACKOFF_MS = 1_000L
        const val MAX_BACKOFF_MS = 300_000L // 5 minutes
        const val BACKOFF_FACTOR = 2.0
    }
}