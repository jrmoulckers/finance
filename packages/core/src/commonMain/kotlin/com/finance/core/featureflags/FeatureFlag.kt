// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.featureflags

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * Unique, type-safe identifier for a feature flag.
 * Prevents accidentally passing arbitrary strings where a flag key is expected.
 */
@Serializable
data class FeatureFlagKey(val value: String) {
    init {
        require(value.isNotBlank()) { "FeatureFlagKey cannot be blank" }
        require(value.matches(KEY_PATTERN)) {
            "FeatureFlagKey must be lowercase alphanumeric with dots/hyphens/underscores, got: $value"
        }
    }

    companion object {
        private val KEY_PATTERN = Regex("^[a-z][a-z0-9._-]{0,127}$")
    }
}

/**
 * A feature flag definition synced from the backend (PostgreSQL → PowerSync).
 *
 * Flags support typed values via [FeatureFlagValue] and optional targeting
 * rules evaluated by the [FeatureFlagEngine].
 */
@Serializable
data class FeatureFlag(
    /** Unique key identifying this flag (e.g., "budgets.rollover.enabled"). */
    val key: FeatureFlagKey,
    /** Human-readable description for internal tooling. */
    val description: String = "",
    /** Whether this flag is globally enabled. Disabled flags always return [defaultValue]. */
    val enabled: Boolean = false,
    /** Value returned when no targeting rules match or flag is disabled. */
    val defaultValue: FeatureFlagValue,
    /** Ordered list of targeting rules. First match wins. */
    val rules: List<TargetingRule> = emptyList(),
    /** Server-side timestamp for cache invalidation and sync ordering. */
    val updatedAt: Instant,
)

/**
 * Typed flag values. Sealed hierarchy ensures exhaustive handling.
 */
@Serializable
sealed class FeatureFlagValue {
    /** Simple on/off toggle — the most common flag type. */
    @Serializable
    data class BooleanValue(val value: Boolean) : FeatureFlagValue()

    /** String variant for A/B test groups, feature tiers, etc. */
    @Serializable
    data class StringValue(val value: String) : FeatureFlagValue()

    /** Integer variant for numeric thresholds, limits, etc. */
    @Serializable
    data class IntValue(val value: Int) : FeatureFlagValue()

    /** Double variant for percentage rollouts, rate multipliers, etc. */
    @Serializable
    data class DoubleValue(val value: Double) : FeatureFlagValue()

    /** JSON variant for complex configuration objects. */
    @Serializable
    data class JsonValue(val value: String) : FeatureFlagValue()
}

/**
 * A targeting rule that conditionally overrides a flag's [FeatureFlag.defaultValue].
 *
 * Rules are evaluated in order; the first rule whose [conditions] all match
 * the evaluation context returns the rule's [value].
 */
@Serializable
data class TargetingRule(
    /** Human-readable label (e.g., "Beta testers", "Premium users"). */
    val name: String = "",
    /** All conditions must match (AND logic) for this rule to apply. */
    val conditions: List<RuleCondition>,
    /** Value to return when all [conditions] match. */
    val value: FeatureFlagValue,
)

/**
 * A single condition within a [TargetingRule].
 *
 * Evaluates an [attribute] from the [EvaluationContext] against [values]
 * using the specified [operator].
 */
@Serializable
data class RuleCondition(
    /** Context attribute key (e.g., "userId", "platform", "accountTier"). */
    val attribute: String,
    /** Comparison operator. */
    val operator: ConditionOperator,
    /** Values to compare against. For IN/NOT_IN, multiple values are checked. */
    val values: List<String>,
)

/**
 * Comparison operators for [RuleCondition] evaluation.
 */
@Serializable
enum class ConditionOperator {
    /** Attribute value is in the provided list. */
    IN,

    /** Attribute value is NOT in the provided list. */
    NOT_IN,

    /** Attribute equals the single provided value (case-sensitive). */
    EQUALS,

    /** Attribute does NOT equal the single provided value. */
    NOT_EQUALS,

    /** Attribute value (parsed as number) is greater than the threshold. */
    GREATER_THAN,

    /** Attribute value (parsed as number) is less than the threshold. */
    LESS_THAN,

    /** Attribute string contains the provided substring. */
    CONTAINS,

    /** Attribute string starts with the provided prefix. */
    STARTS_WITH,
}
