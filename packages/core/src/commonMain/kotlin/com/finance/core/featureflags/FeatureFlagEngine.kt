// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.featureflags

/**
 * Pure evaluation engine for feature flags.
 *
 * Stateless and side-effect-free — takes a flag definition and evaluation context,
 * returns the resolved value. This design makes it trivially testable and ensures
 * consistent behavior across all platforms.
 *
 * Evaluation order:
 * 1. If the flag is disabled → return [FeatureFlag.defaultValue].
 * 2. Iterate [FeatureFlag.rules] in order; return the first matching rule's value.
 * 3. If no rules match → return [FeatureFlag.defaultValue].
 */
object FeatureFlagEngine {

    /**
     * Evaluate a feature flag against the given context.
     *
     * @param flag The flag definition (from sync / local cache).
     * @param context Attributes describing the current user/device/environment.
     * @return The resolved [FeatureFlagValue].
     */
    @Suppress("ReturnCount")
    fun evaluate(flag: FeatureFlag, context: EvaluationContext): FeatureFlagValue {
        if (!flag.enabled) return flag.defaultValue

        for (rule in flag.rules) {
            if (matchesRule(rule, context)) {
                return rule.value
            }
        }

        return flag.defaultValue
    }

    /**
     * Convenience: evaluate a flag and extract a Boolean.
     * Returns [default] if the flag is missing or the value is not a BooleanValue.
     */
    fun evaluateBoolean(flag: FeatureFlag?, context: EvaluationContext, default: Boolean = false): Boolean {
        if (flag == null) return default
        return when (val result = evaluate(flag, context)) {
            is FeatureFlagValue.BooleanValue -> result.value
            else -> default
        }
    }

    /**
     * Convenience: evaluate a flag and extract a String.
     * Returns [default] if the flag is missing or the value is not a StringValue.
     */
    fun evaluateString(flag: FeatureFlag?, context: EvaluationContext, default: String = ""): String {
        if (flag == null) return default
        return when (val result = evaluate(flag, context)) {
            is FeatureFlagValue.StringValue -> result.value
            else -> default
        }
    }

    /**
     * Convenience: evaluate a flag and extract an Int.
     * Returns [default] if the flag is missing or the value is not an IntValue.
     */
    fun evaluateInt(flag: FeatureFlag?, context: EvaluationContext, default: Int = 0): Int {
        if (flag == null) return default
        return when (val result = evaluate(flag, context)) {
            is FeatureFlagValue.IntValue -> result.value
            else -> default
        }
    }

    // ── Rule matching ────────────────────────────────────────────────

    internal fun matchesRule(rule: TargetingRule, context: EvaluationContext): Boolean {
        if (rule.conditions.isEmpty()) return true // empty conditions = always match
        return rule.conditions.all { condition -> matchesCondition(condition, context) }
    }

    @Suppress("ReturnCount")
    internal fun matchesCondition(condition: RuleCondition, context: EvaluationContext): Boolean {
        val attributeValue = context.getAttribute(condition.attribute) ?: return false

        return when (condition.operator) {
            ConditionOperator.IN -> attributeValue in condition.values
            ConditionOperator.NOT_IN -> attributeValue !in condition.values
            ConditionOperator.EQUALS -> condition.values.firstOrNull() == attributeValue
            ConditionOperator.NOT_EQUALS -> condition.values.firstOrNull() != attributeValue
            ConditionOperator.GREATER_THAN -> {
                val threshold = condition.values.firstOrNull()?.toDoubleOrNull() ?: return false
                val actual = attributeValue.toDoubleOrNull() ?: return false
                actual > threshold
            }
            ConditionOperator.LESS_THAN -> {
                val threshold = condition.values.firstOrNull()?.toDoubleOrNull() ?: return false
                val actual = attributeValue.toDoubleOrNull() ?: return false
                actual < threshold
            }
            ConditionOperator.CONTAINS -> {
                val substring = condition.values.firstOrNull() ?: return false
                attributeValue.contains(substring)
            }
            ConditionOperator.STARTS_WITH -> {
                val prefix = condition.values.firstOrNull() ?: return false
                attributeValue.startsWith(prefix)
            }
        }
    }
}
