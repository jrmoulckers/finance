package com.finance.sync.integration

import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Simulates network conditions for integration tests.
 *
 * Wraps sync operations to inject latency, offline states, and failures,
 * allowing tests to exercise offline-queue, retry, and backoff logic
 * without touching real networks.
 */
class NetworkSimulator {

    enum class State { ONLINE, OFFLINE }

    private val mutex = Mutex()

    var state: State = State.ONLINE
        private set

    var latencyMs: Long = 0L
        private set

    /** History of state transitions for assertions. */
    private val _stateHistory = mutableListOf(State.ONLINE)
    val stateHistory: List<State> get() = _stateHistory.toList()

    val isOnline: Boolean get() = state == State.ONLINE
    val isOffline: Boolean get() = state == State.OFFLINE

    /** Transition to online. */
    suspend fun goOnline() = mutex.withLock {
        state = State.ONLINE
        _stateHistory.add(State.ONLINE)
    }

    /** Transition to offline. */
    suspend fun goOffline() = mutex.withLock {
        state = State.OFFLINE
        _stateHistory.add(State.OFFLINE)
    }

    /** Set simulated latency applied to every request while online. */
    suspend fun setLatency(ms: Long) = mutex.withLock {
        require(ms >= 0) { "Latency must be non-negative, got $ms" }
        latencyMs = ms
    }

    /**
     * Execute [block] through the simulated network.
     *
     * @throws NetworkOfflineException if the simulator is offline.
     */
    suspend fun <T> execute(block: suspend () -> T): T {
        if (state == State.OFFLINE) {
            throw NetworkOfflineException("Network is offline")
        }
        if (latencyMs > 0) {
            delay(latencyMs)
        }
        return block()
    }

    /** Reset the simulator to default online state with zero latency. */
    suspend fun reset() = mutex.withLock {
        state = State.ONLINE
        latencyMs = 0L
        _stateHistory.clear()
        _stateHistory.add(State.ONLINE)
    }
}

/** Thrown when an operation is attempted while the network simulator is offline. */
class NetworkOfflineException(message: String) : Exception(message)
