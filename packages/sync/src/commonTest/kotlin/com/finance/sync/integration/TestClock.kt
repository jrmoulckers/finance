package com.finance.sync.integration

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

/**
 * A controllable [Clock] for deterministic testing.
 *
 * Starts at a fixed epoch instant and only advances when [advanceBy] is
 * called explicitly, removing all dependency on real wall-clock timing
 * and eliminating flaky assertions in CI environments (e.g. ChromeHeadless)
 * where system-clock resolution may be insufficient.
 */
class TestClock(
    startInstant: Instant = Instant.fromEpochMilliseconds(1_700_000_000_000L),
) : Clock {

    private var _now: Instant = startInstant

    override fun now(): Instant = _now

    /** Advance the clock by [millis] milliseconds. */
    fun advanceBy(millis: Long) {
        require(millis >= 0) { "Cannot advance clock by negative millis: $millis" }
        _now = _now + millis.milliseconds
    }

    /** Advance the clock by [duration]. */
    fun advanceBy(duration: Duration) {
        require(!duration.isNegative()) { "Cannot advance clock by negative duration: $duration" }
        _now = _now + duration
    }
}
