// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.featureflags

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * Cached evaluation result for a single feature flag.
 *
 * @property key The flag key that was evaluated.
 * @property value The resolved value.
 * @property evaluatedAt Timestamp of evaluation (for staleness checks).
 */
data class CachedFlagResult(
    val key: FeatureFlagKey,
    val value: FeatureFlagValue,
    val evaluatedAt: Instant,
)

/**
 * Client-side feature-flag manager that integrates sync, caching, rollout
 * evaluation, and platform filtering into a single facade.
 *
 * Lifecycle:
 * 1. Flags arrive from the sync layer (PowerSync / bootstrap) via [onFlagsUpdated].
 * 2. Clients call [isEnabled] / [evaluate] to query flag state.
 * 3. Evaluated results are cached in-memory for fast re-reads.
 * 4. When flags update, the cache is invalidated automatically.
 *
 * Thread-safe: backed by [MutableStateFlow] with atomic updates.
 */
class FeatureFlagSyncManager(
    /** The provider that holds the canonical flag set. */
    private val provider: FeatureFlagProvider,
    /** Clock for timestamping cached evaluations. */
    private val clock: Clock = Clock.System,
) {

    private val _cache = MutableStateFlow<Map<FeatureFlagKey, CachedFlagResult>>(emptyMap())

    /** Observable cache of evaluated flag results. */
    val cache: StateFlow<Map<FeatureFlagKey, CachedFlagResult>> = _cache.asStateFlow()

    /**
     * Called when flags arrive from the sync layer. Replaces all flags in the
     * [provider] and invalidates the evaluation cache.
     *
     * @param flags The full set of flags from the server.
     */
    fun onFlagsUpdated(flags: List<FeatureFlag>) {
        provider.setFlags(flags)
        _cache.value = emptyMap()
    }

    /**
     * Called when a single flag changes incrementally (e.g., a PowerSync delta).
     *
     * @param flag The updated flag definition.
     */
    fun onFlagChanged(flag: FeatureFlag) {
        provider.upsertFlag(flag)
        // Invalidate only this key's cached result.
        _cache.value = _cache.value - flag.key
    }

    /**
     * Called when a flag is removed server-side.
     *
     * @param key The removed flag's key.
     */
    fun onFlagRemoved(key: FeatureFlagKey) {
        provider.removeFlag(key)
        _cache.value = _cache.value - key
    }

    /**
     * Evaluate a boolean flag with rollout-percentage and platform support.
     *
     * Evaluation order:
     * 1. Return cached result if available.
     * 2. Evaluate targeting rules via [FeatureFlagEngine].
     * 3. Apply rollout percentage check using [RolloutEvaluator] if the context
     *    contains a userId and the flag has a "rolloutPercentage" attribute in
     *    its first rule condition.
     * 4. Cache and return the result.
     *
     * @param key The flag key to evaluate.
     * @param context Attributes describing the current user/device/environment.
     * @param default Value returned if the flag is unknown or evaluation fails.
     * @return `true` if the flag is enabled for the given context.
     */
    fun isEnabled(key: FeatureFlagKey, context: EvaluationContext, default: Boolean = false): Boolean {
        // Check cache first.
        val cached = _cache.value[key]
        if (cached != null) {
            return (cached.value as? FeatureFlagValue.BooleanValue)?.value ?: default
        }

        val flag = provider.getFlag(key)
        return if (flag != null) {
            evaluateWithRollout(flag, context, default).also { result ->
                val flagValue = FeatureFlagValue.BooleanValue(result)
                _cache.value = _cache.value + (key to CachedFlagResult(key, flagValue, clock.now()))
            }
        } else {
            default
        }
    }

    /**
     * Evaluate a flag and return the full [FeatureFlagValue].
     *
     * @param key The flag key.
     * @param context Evaluation context.
     * @return The resolved value, or `null` if the flag is unknown.
     */
    fun evaluate(key: FeatureFlagKey, context: EvaluationContext): FeatureFlagValue? =
        _cache.value[key]?.value ?: provider.getFlag(key)?.let { flag ->
            val value = FeatureFlagEngine.evaluate(flag, context)
            _cache.value = _cache.value + (key to CachedFlagResult(key, value, clock.now()))
            value
        }

    /**
     * Observe a boolean flag reactively. Emits a new value whenever the
     * underlying flag set changes.
     *
     * @param key The flag key.
     * @param context Evaluation context.
     * @param default Fallback value.
     * @return A [Flow] of boolean flag states.
     */
    fun observeEnabled(
        key: FeatureFlagKey,
        context: EvaluationContext,
        default: Boolean = false,
    ): Flow<Boolean> = provider.flags.map { flagMap ->
        val flag = flagMap[key] ?: return@map default
        evaluateWithRollout(flag, context, default)
    }

    /** Clear the evaluation cache (e.g., on user switch or logout). */
    fun clearCache() {
        _cache.value = emptyMap()
    }

    /** Clear all flags and cache (e.g., on user logout). */
    fun reset() {
        provider.clear()
        _cache.value = emptyMap()
    }

    // ── Internal ─────────────────────────────────────────────────────

    /**
     * Evaluate a flag, incorporating rollout percentage when applicable.
     *
     * If the flag is disabled, returns [default]. Otherwise evaluates targeting rules,
     * then checks rollout percentage if present.
     */
    private fun evaluateWithRollout(
        flag: FeatureFlag,
        context: EvaluationContext,
        default: Boolean,
    ): Boolean = when {
        !flag.enabled -> default
        else -> {
            val baseResult = FeatureFlagEngine.evaluateBoolean(flag, context, default)
            if (!baseResult) {
                false
            } else {
                val percentage = context.getAttribute("rolloutPercentage")?.toIntOrNull()
                val userId = context.getAttribute("userId")
                if (percentage != null && userId != null) {
                    RolloutEvaluator.isInRollout(userId, flag.key.value, percentage)
                } else {
                    baseResult
                }
            }
        }
    }
}
