// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.featureflags

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map

/**
 * Reactive provider that holds the current set of feature flags and exposes
 * evaluated flag values as [Flow]s.
 *
 * Platform apps update this provider when flags arrive from PowerSync (real-time)
 * or from a bootstrap/cache layer at startup.
 *
 * Thread-safe: backed by [MutableStateFlow] with atomic updates.
 */
class FeatureFlagProvider {

    private val _flags = MutableStateFlow<Map<FeatureFlagKey, FeatureFlag>>(emptyMap())

    /** Observable snapshot of all currently loaded flags. */
    val flags: StateFlow<Map<FeatureFlagKey, FeatureFlag>> = _flags.asStateFlow()

    /** Replace the entire flag set (e.g., on initial sync or full refresh). */
    fun setFlags(flags: List<FeatureFlag>) {
        _flags.value = flags.associateBy { it.key }
    }

    /** Update or insert a single flag (e.g., from a PowerSync incremental change). */
    fun upsertFlag(flag: FeatureFlag) {
        _flags.value = _flags.value + (flag.key to flag)
    }

    /** Remove a flag by key (e.g., flag was deleted server-side). */
    fun removeFlag(key: FeatureFlagKey) {
        _flags.value = _flags.value - key
    }

    /** Get a flag by key from the current snapshot. */
    fun getFlag(key: FeatureFlagKey): FeatureFlag? = _flags.value[key]

    /** Total number of loaded flags. */
    val flagCount: Int get() = _flags.value.size

    // ── Evaluation helpers ───────────────────────────────────────────

    /** Evaluate a flag by key. Returns the resolved value or null if the key is unknown. */
    fun evaluate(key: FeatureFlagKey, context: EvaluationContext): FeatureFlagValue? {
        val flag = getFlag(key) ?: return null
        return FeatureFlagEngine.evaluate(flag, context)
    }

    /** Evaluate as Boolean. Returns [default] if the flag is missing or not a BooleanValue. */
    fun isEnabled(key: FeatureFlagKey, context: EvaluationContext, default: Boolean = false): Boolean {
        return FeatureFlagEngine.evaluateBoolean(getFlag(key), context, default)
    }

    /** Evaluate as String. Returns [default] if the flag is missing or not a StringValue. */
    fun getString(key: FeatureFlagKey, context: EvaluationContext, default: String = ""): String {
        return FeatureFlagEngine.evaluateString(getFlag(key), context, default)
    }

    /** Evaluate as Int. Returns [default] if the flag is missing or not an IntValue. */
    fun getInt(key: FeatureFlagKey, context: EvaluationContext, default: Int = 0): Int {
        return FeatureFlagEngine.evaluateInt(getFlag(key), context, default)
    }

    // ── Reactive evaluation ──────────────────────────────────────────

    /**
     * Observe a boolean flag reactively. Emits a new value whenever the flag set changes.
     */
    fun observeBoolean(
        key: FeatureFlagKey,
        context: EvaluationContext,
        default: Boolean = false,
    ): Flow<Boolean> = _flags.map { flagMap ->
        FeatureFlagEngine.evaluateBoolean(flagMap[key], context, default)
    }

    /**
     * Observe a string flag reactively. Emits a new value whenever the flag set changes.
     */
    fun observeString(
        key: FeatureFlagKey,
        context: EvaluationContext,
        default: String = "",
    ): Flow<String> = _flags.map { flagMap ->
        FeatureFlagEngine.evaluateString(flagMap[key], context, default)
    }

    /** Clear all flags (e.g., on user logout). */
    fun clear() {
        _flags.value = emptyMap()
    }
}
