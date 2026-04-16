// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.featureflags

import kotlinx.datetime.Instant
import kotlin.test.*

class FeatureFlagEngineTest {

    private val fixedInstant = Instant.parse("2024-06-15T12:00:00Z")

    // ── Disabled flag ────────────────────────────────────────────────

    @Test
    fun disabledFlagReturnsDefaultValue() {
        val flag = createFlag(
            enabled = false,
            defaultValue = FeatureFlagValue.BooleanValue(true),
            rules = listOf(
                TargetingRule(
                    name = "Everyone",
                    conditions = emptyList(),
                    value = FeatureFlagValue.BooleanValue(false),
                ),
            ),
        )
        val result = FeatureFlagEngine.evaluate(flag, EvaluationContext.EMPTY)
        assertEquals(FeatureFlagValue.BooleanValue(true), result)
    }

    // ── Enabled flag with no rules ───────────────────────────────────

    @Test
    fun enabledFlagWithNoRulesReturnsDefault() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.StringValue("control"),
        )
        val result = FeatureFlagEngine.evaluate(flag, EvaluationContext.EMPTY)
        assertEquals(FeatureFlagValue.StringValue("control"), result)
    }

    // ── Rule with empty conditions always matches ────────────────────

    @Test
    fun ruleWithEmptyConditionsAlwaysMatches() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(false),
            rules = listOf(
                TargetingRule(
                    name = "Catch-all",
                    conditions = emptyList(),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
        )
        val result = FeatureFlagEngine.evaluate(flag, EvaluationContext.EMPTY)
        assertEquals(FeatureFlagValue.BooleanValue(true), result)
    }

    // ── IN operator ──────────────────────────────────────────────────

    @Test
    fun inOperatorMatchesWhenAttributeInList() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(false),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("platform", ConditionOperator.IN, listOf("ios", "android")),
                    ),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
        )
        val ctx = EvaluationContext.builder().platform("ios").build()
        assertTrue((FeatureFlagEngine.evaluate(flag, ctx) as FeatureFlagValue.BooleanValue).value)
    }

    @Test
    fun inOperatorFailsWhenAttributeNotInList() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(false),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("platform", ConditionOperator.IN, listOf("ios", "android")),
                    ),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
        )
        val ctx = EvaluationContext.builder().platform("web").build()
        assertFalse((FeatureFlagEngine.evaluate(flag, ctx) as FeatureFlagValue.BooleanValue).value)
    }

    // ── NOT_IN operator ──────────────────────────────────────────────

    @Test
    fun notInOperatorMatchesWhenAttributeNotInList() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(false),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("platform", ConditionOperator.NOT_IN, listOf("web")),
                    ),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
        )
        val ctx = EvaluationContext.builder().platform("ios").build()
        assertTrue((FeatureFlagEngine.evaluate(flag, ctx) as FeatureFlagValue.BooleanValue).value)
    }

    // ── EQUALS operator ──────────────────────────────────────────────

    @Test
    fun equalsOperatorMatches() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.StringValue("free"),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("accountTier", ConditionOperator.EQUALS, listOf("premium")),
                    ),
                    value = FeatureFlagValue.StringValue("premium"),
                ),
            ),
        )
        val ctx = EvaluationContext.builder().accountTier("premium").build()
        assertEquals(FeatureFlagValue.StringValue("premium"), FeatureFlagEngine.evaluate(flag, ctx))
    }

    // ── NOT_EQUALS operator ──────────────────────────────────────────

    @Test
    fun notEqualsOperatorMatches() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(false),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("accountTier", ConditionOperator.NOT_EQUALS, listOf("free")),
                    ),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
        )
        val ctx = EvaluationContext.builder().accountTier("premium").build()
        assertTrue((FeatureFlagEngine.evaluate(flag, ctx) as FeatureFlagValue.BooleanValue).value)
    }

    // ── GREATER_THAN operator ────────────────────────────────────────

    @Test
    fun greaterThanOperatorMatchesNumericAttribute() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(false),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("appVersion", ConditionOperator.GREATER_THAN, listOf("2.0")),
                    ),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
        )
        val ctx = EvaluationContext.builder().appVersion("3.1").build()
        assertTrue((FeatureFlagEngine.evaluate(flag, ctx) as FeatureFlagValue.BooleanValue).value)
    }

    @Test
    fun greaterThanOperatorFailsForNonNumericAttribute() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(false),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("appVersion", ConditionOperator.GREATER_THAN, listOf("2.0")),
                    ),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
        )
        val ctx = EvaluationContext.builder().appVersion("not-a-number").build()
        assertFalse((FeatureFlagEngine.evaluate(flag, ctx) as FeatureFlagValue.BooleanValue).value)
    }

    // ── LESS_THAN operator ───────────────────────────────────────────

    @Test
    fun lessThanOperatorMatches() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.IntValue(10),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("accountCount", ConditionOperator.LESS_THAN, listOf("5")),
                    ),
                    value = FeatureFlagValue.IntValue(3),
                ),
            ),
        )
        val ctx = EvaluationContext(mapOf("accountCount" to "2"))
        assertEquals(FeatureFlagValue.IntValue(3), FeatureFlagEngine.evaluate(flag, ctx))
    }

    // ── CONTAINS operator ────────────────────────────────────────────

    @Test
    fun containsOperatorMatches() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(false),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("email", ConditionOperator.CONTAINS, listOf("@finance.com")),
                    ),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
        )
        val ctx = EvaluationContext(mapOf("email" to "dev@finance.com"))
        assertTrue((FeatureFlagEngine.evaluate(flag, ctx) as FeatureFlagValue.BooleanValue).value)
    }

    // ── STARTS_WITH operator ─────────────────────────────────────────

    @Test
    fun startsWithOperatorMatches() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(false),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("userId", ConditionOperator.STARTS_WITH, listOf("beta-")),
                    ),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
        )
        val ctx = EvaluationContext.builder().userId("beta-user-42").build()
        assertTrue((FeatureFlagEngine.evaluate(flag, ctx) as FeatureFlagValue.BooleanValue).value)
    }

    // ── Multiple conditions (AND logic) ──────────────────────────────

    @Test
    fun multipleConditionsRequireAllToMatch() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(false),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("platform", ConditionOperator.EQUALS, listOf("ios")),
                        RuleCondition("accountTier", ConditionOperator.EQUALS, listOf("premium")),
                    ),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
        )

        // Both match
        val ctxBoth = EvaluationContext.builder()
            .platform("ios")
            .accountTier("premium")
            .build()
        assertTrue((FeatureFlagEngine.evaluate(flag, ctxBoth) as FeatureFlagValue.BooleanValue).value)

        // Only one matches
        val ctxPartial = EvaluationContext.builder()
            .platform("ios")
            .accountTier("free")
            .build()
        assertFalse((FeatureFlagEngine.evaluate(flag, ctxPartial) as FeatureFlagValue.BooleanValue).value)
    }

    // ── First matching rule wins ─────────────────────────────────────

    @Test
    fun firstMatchingRuleWins() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.StringValue("default"),
            rules = listOf(
                TargetingRule(
                    name = "Premium",
                    conditions = listOf(
                        RuleCondition("accountTier", ConditionOperator.EQUALS, listOf("premium")),
                    ),
                    value = FeatureFlagValue.StringValue("variant-a"),
                ),
                TargetingRule(
                    name = "Catch-all",
                    conditions = emptyList(),
                    value = FeatureFlagValue.StringValue("variant-b"),
                ),
            ),
        )

        val premiumCtx = EvaluationContext.builder().accountTier("premium").build()
        assertEquals(FeatureFlagValue.StringValue("variant-a"), FeatureFlagEngine.evaluate(flag, premiumCtx))

        val freeCtx = EvaluationContext.builder().accountTier("free").build()
        assertEquals(FeatureFlagValue.StringValue("variant-b"), FeatureFlagEngine.evaluate(flag, freeCtx))
    }

    // ── Missing attribute returns default ────────────────────────────

    @Test
    fun missingAttributeFailsCondition() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(false),
            rules = listOf(
                TargetingRule(
                    conditions = listOf(
                        RuleCondition("userId", ConditionOperator.EQUALS, listOf("user-1")),
                    ),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
        )
        // Empty context has no userId attribute
        val result = FeatureFlagEngine.evaluate(flag, EvaluationContext.EMPTY)
        assertFalse((result as FeatureFlagValue.BooleanValue).value)
    }

    // ── Convenience evaluators ───────────────────────────────────────

    @Test
    fun evaluateBooleanReturnsDefaultForNullFlag() {
        assertFalse(FeatureFlagEngine.evaluateBoolean(null, EvaluationContext.EMPTY))
        assertTrue(FeatureFlagEngine.evaluateBoolean(null, EvaluationContext.EMPTY, default = true))
    }

    @Test
    fun evaluateStringReturnsDefaultForNonStringValue() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.BooleanValue(true),
        )
        assertEquals("fallback", FeatureFlagEngine.evaluateString(flag, EvaluationContext.EMPTY, "fallback"))
    }

    @Test
    fun evaluateIntReturnsValueFromFlag() {
        val flag = createFlag(
            enabled = true,
            defaultValue = FeatureFlagValue.IntValue(42),
        )
        assertEquals(42, FeatureFlagEngine.evaluateInt(flag, EvaluationContext.EMPTY))
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private fun createFlag(
        key: String = "test.flag",
        enabled: Boolean = true,
        defaultValue: FeatureFlagValue = FeatureFlagValue.BooleanValue(false),
        rules: List<TargetingRule> = emptyList(),
    ): FeatureFlag = FeatureFlag(
        key = FeatureFlagKey(key),
        enabled = enabled,
        defaultValue = defaultValue,
        rules = rules,
        updatedAt = fixedInstant,
    )
}
