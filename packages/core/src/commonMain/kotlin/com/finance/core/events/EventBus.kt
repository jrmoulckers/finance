// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.events

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * In-process event bus for domain events.
 * Subscribers receive events via SharedFlow (coroutines-based).
 */
class EventBus {
    private val _events = MutableSharedFlow<DomainEvent>(extraBufferCapacity = 64)

    /** Stream of all domain events. Subscribe to filter for specific types. */
    val events: SharedFlow<DomainEvent> = _events.asSharedFlow()

    /**
     * Emit a domain event to all subscribers.
     */
    suspend fun emit(event: DomainEvent) {
        _events.emit(event)
    }

    /**
     * Try to emit without suspending. Returns false if buffer is full.
     */
    fun tryEmit(event: DomainEvent): Boolean {
        return _events.tryEmit(event)
    }
}
