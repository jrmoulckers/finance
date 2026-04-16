// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.featureflags

/**
 * Context provided to the [FeatureFlagEngine] for targeting rule evaluation.
 *
 * Contains attributes about the current user, device, and environment that
 * targeting rules compare against. Platform apps populate this from their
 * runtime environment (e.g., user session, device info, build config).
 *
 * All attribute values are strings to keep evaluation logic uniform —
 * numeric comparisons parse on the fly.
 */
data class EvaluationContext(
    /** Key-value attributes for rule evaluation (e.g., "userId" → "abc-123"). */
    val attributes: Map<String, String> = emptyMap(),
) {
    /** Get an attribute value, or null if not present. */
    fun getAttribute(key: String): String? = attributes[key]

    /** Builder DSL for constructing an [EvaluationContext]. */
    class Builder {
        private val attrs = mutableMapOf<String, String>()

        fun userId(id: String) = apply { attrs["userId"] = id }
        fun householdId(id: String) = apply { attrs["householdId"] = id }
        fun platform(platform: String) = apply { attrs["platform"] = platform }
        fun appVersion(version: String) = apply { attrs["appVersion"] = version }
        fun accountTier(tier: String) = apply { attrs["accountTier"] = tier }
        fun locale(locale: String) = apply { attrs["locale"] = locale }
        fun attribute(key: String, value: String) = apply { attrs[key] = value }

        fun build(): EvaluationContext = EvaluationContext(attrs.toMap())
    }

    companion object {
        /** Empty context — no attributes, all targeting rules will fail to match. */
        val EMPTY = EvaluationContext()

        fun builder(): Builder = Builder()
    }
}
