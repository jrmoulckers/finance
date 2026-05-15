// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.featureflags

import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FeatureFlagSyncManagerTest {

    private val fixedInstant = Instant.parse("2024-06-15T12:00:00Z")

    private fun createManager(): Pair<FeatureFlagProvider, FeatureFlagSyncManager> {
        val provider = FeatureFlagProvider()
        val manager = FeatureFlagSyncManager(provider)
        return provider to manager
    }

    private fun createFlag(
        key: String,
        enabled: Boolean = true,
        defaultValue: FeatureFlagValue = FeatureFlagValue.BooleanValue(true),
        rules: List<TargetingRule> = emptyList(),
    ): FeatureFlag = FeatureFlag(
        key = FeatureFlagKey(key),
        enabled = enabled,
        defaultValue = defaultValue,
        rules = rules,
        updatedAt = fixedInstant,
    )

    private val defaultContext = EvaluationContext.builder()
        .userId("user-1")
        .platform("ios")
        .build()

    // ═══════════════════════════════════════════════════════════════════
    // onFlagsUpdated — bulk update
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun onFlagsUpdated_replacesAllFlags() {
        val (provider, manager) = createManager()
        manager.onFlagsUpdated(
            listOf(
                createFlag("flag.one"),
                createFlag("flag.two"),
            ),
        )

        assertEquals(2, provider.flagCount)
        assertTrue(manager.isEnabled(FeatureFlagKey("flag.one"), defaultContext))
        assertTrue(manager.isEnabled(FeatureFlagKey("flag.two"), defaultContext))
    }

    @Test
    fun onFlagsUpdated_invalidatesCache() {
        val (_, manager) = createManager()
        manager.onFlagsUpdated(listOf(createFlag("flag.one")))

        // Trigger cache fill.
        manager.isEnabled(FeatureFlagKey("flag.one"), defaultContext)
        assertFalse(manager.cache.value.isEmpty(), "Cache should have one entry")

        // Bulk update should clear cache.
        manager.onFlagsUpdated(listOf(createFlag("flag.one", enabled = false)))
        assertTrue(manager.cache.value.isEmpty(), "Cache should be cleared after bulk update")
    }

    // ═══════════════════════════════════════════════════════════════════
    // onFlagChanged — incremental update
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun onFlagChanged_updatesSpecificFlag() {
        val (_, manager) = createManager()
        manager.onFlagsUpdated(listOf(createFlag("flag.one")))

        assertTrue(manager.isEnabled(FeatureFlagKey("flag.one"), defaultContext))

        // Disable the flag.
        manager.onFlagChanged(createFlag("flag.one", enabled = false))

        // Cache for flag.one should be invalidated, re-evaluate.
        assertFalse(manager.isEnabled(FeatureFlagKey("flag.one"), defaultContext))
    }

    // ═══════════════════════════════════════════════════════════════════
    // onFlagRemoved
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun onFlagRemoved_removesFlag() {
        val (provider, manager) = createManager()
        manager.onFlagsUpdated(listOf(createFlag("flag.one")))
        assertEquals(1, provider.flagCount)

        manager.onFlagRemoved(FeatureFlagKey("flag.one"))
        assertEquals(0, provider.flagCount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // isEnabled — caching behaviour
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun isEnabled_cachesResult() {
        val (_, manager) = createManager()
        manager.onFlagsUpdated(listOf(createFlag("flag.one")))

        // First call evaluates and caches.
        val result1 = manager.isEnabled(FeatureFlagKey("flag.one"), defaultContext)
        assertTrue(result1)
        assertFalse(manager.cache.value.isEmpty())

        // Second call should return cached value.
        val result2 = manager.isEnabled(FeatureFlagKey("flag.one"), defaultContext)
        assertEquals(result1, result2)
    }

    @Test
    fun isEnabled_unknownFlag_returnsDefault() {
        val (_, manager) = createManager()
        assertFalse(manager.isEnabled(FeatureFlagKey("unknown.flag"), defaultContext))
        assertTrue(manager.isEnabled(FeatureFlagKey("unknown.flag"), defaultContext, default = true))
    }

    @Test
    fun isEnabled_disabledFlag_returnsDefault() {
        val (_, manager) = createManager()
        manager.onFlagsUpdated(listOf(createFlag("flag.one", enabled = false)))

        assertFalse(manager.isEnabled(FeatureFlagKey("flag.one"), defaultContext))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Platform filtering via targeting rules
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun platformTargeting_matchesCorrectPlatform() {
        val (_, manager) = createManager()
        val flag = createFlag(
            key = "flag.ios-only",
            rules = listOf(
                TargetingRule(
                    name = "iOS only",
                    conditions = listOf(
                        RuleCondition("platform", ConditionOperator.IN, listOf("ios")),
                    ),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
            defaultValue = FeatureFlagValue.BooleanValue(false),
        )
        manager.onFlagsUpdated(listOf(flag))

        val iosCtx = EvaluationContext.builder().userId("user-1").platform("ios").build()
        assertTrue(manager.isEnabled(FeatureFlagKey("flag.ios-only"), iosCtx))

        // Clear cache before evaluating with a different context, because cache is
        // keyed by flag key only (not by context).
        manager.clearCache()

        val androidCtx = EvaluationContext.builder().userId("user-1").platform("android").build()
        assertFalse(manager.isEnabled(FeatureFlagKey("flag.ios-only"), androidCtx))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Rollout percentage
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun rollout_zeroPercent_alwaysFalse() {
        val (_, manager) = createManager()
        val flag = createFlag(
            key = "flag.rollout",
            rules = listOf(
                TargetingRule(
                    name = "All",
                    conditions = emptyList(),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
            defaultValue = FeatureFlagValue.BooleanValue(false),
        )
        manager.onFlagsUpdated(listOf(flag))

        val ctx = EvaluationContext.builder()
            .userId("user-1")
            .attribute("rolloutPercentage", "0")
            .build()

        assertFalse(manager.isEnabled(FeatureFlagKey("flag.rollout"), ctx))
    }

    @Test
    fun rollout_hundredPercent_alwaysTrue() {
        val (_, manager) = createManager()
        val flag = createFlag(
            key = "flag.rollout",
            rules = listOf(
                TargetingRule(
                    name = "All",
                    conditions = emptyList(),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
            defaultValue = FeatureFlagValue.BooleanValue(false),
        )
        manager.onFlagsUpdated(listOf(flag))

        val ctx = EvaluationContext.builder()
            .userId("user-1")
            .attribute("rolloutPercentage", "100")
            .build()

        assertTrue(manager.isEnabled(FeatureFlagKey("flag.rollout"), ctx))
    }

    // ═══════════════════════════════════════════════════════════════════
    // evaluate — full value
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun evaluate_returnsFullValue() {
        val (_, manager) = createManager()
        manager.onFlagsUpdated(
            listOf(
                createFlag("flag.string", defaultValue = FeatureFlagValue.StringValue("hello")),
            ),
        )

        val value = manager.evaluate(FeatureFlagKey("flag.string"), defaultContext)
        assertEquals(FeatureFlagValue.StringValue("hello"), value)
    }

    @Test
    fun evaluate_unknownFlag_returnsNull() {
        val (_, manager) = createManager()
        assertNull(manager.evaluate(FeatureFlagKey("unknown.flag"), defaultContext))
    }

    // ═══════════════════════════════════════════════════════════════════
    // clearCache / reset
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun clearCache_emptiesEvaluationCache() {
        val (provider, manager) = createManager()
        manager.onFlagsUpdated(listOf(createFlag("flag.one")))
        manager.isEnabled(FeatureFlagKey("flag.one"), defaultContext)

        assertFalse(manager.cache.value.isEmpty())
        manager.clearCache()
        assertTrue(manager.cache.value.isEmpty())

        // Provider should still have the flag.
        assertEquals(1, provider.flagCount)
    }

    @Test
    fun reset_clearsEverything() {
        val (provider, manager) = createManager()
        manager.onFlagsUpdated(listOf(createFlag("flag.one")))
        manager.isEnabled(FeatureFlagKey("flag.one"), defaultContext)

        manager.reset()
        assertTrue(manager.cache.value.isEmpty())
        assertEquals(0, provider.flagCount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Fallback behaviour for missing/stale/unsupported flags
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun missingFlag_returnsDefaultFalse() {
        val (_, manager) = createManager()
        assertFalse(manager.isEnabled(FeatureFlagKey("nonexistent.flag"), defaultContext))
    }

    @Test
    fun missingFlag_returnsCustomDefault() {
        val (_, manager) = createManager()
        assertTrue(
            manager.isEnabled(FeatureFlagKey("nonexistent.flag"), defaultContext, default = true),
        )
    }

    @Test
    fun disabledFlag_ignoredRules_returnsDefault() {
        val (_, manager) = createManager()
        val flag = createFlag(
            key = "flag.disabled",
            enabled = false,
            rules = listOf(
                TargetingRule(
                    name = "Would match",
                    conditions = emptyList(),
                    value = FeatureFlagValue.BooleanValue(true),
                ),
            ),
            defaultValue = FeatureFlagValue.BooleanValue(false),
        )
        manager.onFlagsUpdated(listOf(flag))

        assertFalse(manager.isEnabled(FeatureFlagKey("flag.disabled"), defaultContext))
    }
}
