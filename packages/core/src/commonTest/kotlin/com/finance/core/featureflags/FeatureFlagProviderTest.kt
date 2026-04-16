// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.featureflags

import kotlinx.datetime.Instant
import kotlin.test.*

class FeatureFlagKeyTest {

    @Test
    fun validKeyIsAccepted() {
        val key = FeatureFlagKey("budgets.rollover.enabled")
        assertEquals("budgets.rollover.enabled", key.value)
    }

    @Test
    fun keyWithHyphensAndUnderscoresIsAccepted() {
        val key = FeatureFlagKey("my-flag_v2.enabled")
        assertEquals("my-flag_v2.enabled", key.value)
    }

    @Test
    fun blankKeyIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            FeatureFlagKey("")
        }
    }

    @Test
    fun keyWithUppercaseIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            FeatureFlagKey("My.Flag")
        }
    }

    @Test
    fun keyStartingWithNumberIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            FeatureFlagKey("1flag")
        }
    }

    @Test
    fun keyWithSpacesIsRejected() {
        assertFailsWith<IllegalArgumentException> {
            FeatureFlagKey("my flag")
        }
    }
}

class EvaluationContextTest {

    @Test
    fun emptyContextHasNoAttributes() {
        val ctx = EvaluationContext.EMPTY
        assertNull(ctx.getAttribute("userId"))
        assertTrue(ctx.attributes.isEmpty())
    }

    @Test
    fun builderPopulatesAttributes() {
        val ctx = EvaluationContext.builder()
            .userId("user-1")
            .platform("ios")
            .accountTier("premium")
            .appVersion("2.1.0")
            .householdId("hh-1")
            .locale("en-US")
            .attribute("custom", "value")
            .build()

        assertEquals("user-1", ctx.getAttribute("userId"))
        assertEquals("ios", ctx.getAttribute("platform"))
        assertEquals("premium", ctx.getAttribute("accountTier"))
        assertEquals("2.1.0", ctx.getAttribute("appVersion"))
        assertEquals("hh-1", ctx.getAttribute("householdId"))
        assertEquals("en-US", ctx.getAttribute("locale"))
        assertEquals("value", ctx.getAttribute("custom"))
    }

    @Test
    fun builderOverwritesDuplicateKeys() {
        val ctx = EvaluationContext.builder()
            .userId("old")
            .userId("new")
            .build()

        assertEquals("new", ctx.getAttribute("userId"))
    }
}

class FeatureFlagProviderTest {

    private val fixedInstant = Instant.parse("2024-06-15T12:00:00Z")
    private val ctx = EvaluationContext.builder().platform("ios").build()

    @Test
    fun setFlagsReplacesAll() {
        val provider = FeatureFlagProvider()
        val flag1 = createFlag("flag.one", FeatureFlagValue.BooleanValue(true))
        val flag2 = createFlag("flag.two", FeatureFlagValue.BooleanValue(false))

        provider.setFlags(listOf(flag1, flag2))
        assertEquals(2, provider.flagCount)

        // Replace with a single flag
        provider.setFlags(listOf(flag1))
        assertEquals(1, provider.flagCount)
        assertNull(provider.getFlag(FeatureFlagKey("flag.two")))
    }

    @Test
    fun upsertFlagAddsNewFlag() {
        val provider = FeatureFlagProvider()
        val flag = createFlag("flag.one", FeatureFlagValue.BooleanValue(true))

        provider.upsertFlag(flag)
        assertEquals(1, provider.flagCount)
        assertTrue(provider.isEnabled(FeatureFlagKey("flag.one"), ctx))
    }

    @Test
    fun upsertFlagUpdatesExistingFlag() {
        val provider = FeatureFlagProvider()
        val v1 = createFlag("flag.one", FeatureFlagValue.BooleanValue(true))
        val v2 = createFlag("flag.one", FeatureFlagValue.BooleanValue(false))

        provider.upsertFlag(v1)
        assertTrue(provider.isEnabled(FeatureFlagKey("flag.one"), ctx))

        provider.upsertFlag(v2)
        assertFalse(provider.isEnabled(FeatureFlagKey("flag.one"), ctx))
    }

    @Test
    fun removeFlagDeletesKey() {
        val provider = FeatureFlagProvider()
        val flag = createFlag("flag.one", FeatureFlagValue.BooleanValue(true))

        provider.upsertFlag(flag)
        assertEquals(1, provider.flagCount)

        provider.removeFlag(FeatureFlagKey("flag.one"))
        assertEquals(0, provider.flagCount)
    }

    @Test
    fun isEnabledReturnsFalseForUnknownKey() {
        val provider = FeatureFlagProvider()
        assertFalse(provider.isEnabled(FeatureFlagKey("unknown.flag"), ctx))
    }

    @Test
    fun isEnabledReturnsTrueForExistingEnabledFlag() {
        val provider = FeatureFlagProvider()
        provider.upsertFlag(createFlag("flag.one", FeatureFlagValue.BooleanValue(true)))
        assertTrue(provider.isEnabled(FeatureFlagKey("flag.one"), ctx))
    }

    @Test
    fun getStringReturnsValueForStringFlag() {
        val provider = FeatureFlagProvider()
        provider.upsertFlag(createFlag("flag.variant", FeatureFlagValue.StringValue("experiment-a")))
        assertEquals("experiment-a", provider.getString(FeatureFlagKey("flag.variant"), ctx))
    }

    @Test
    fun getIntReturnsValueForIntFlag() {
        val provider = FeatureFlagProvider()
        provider.upsertFlag(createFlag("flag.limit", FeatureFlagValue.IntValue(5)))
        assertEquals(5, provider.getInt(FeatureFlagKey("flag.limit"), ctx))
    }

    @Test
    fun clearRemovesAllFlags() {
        val provider = FeatureFlagProvider()
        provider.setFlags(listOf(
            createFlag("flag.one", FeatureFlagValue.BooleanValue(true)),
            createFlag("flag.two", FeatureFlagValue.BooleanValue(false)),
        ))
        assertEquals(2, provider.flagCount)

        provider.clear()
        assertEquals(0, provider.flagCount)
    }

    @Test
    fun evaluateReturnsNullForUnknownKey() {
        val provider = FeatureFlagProvider()
        assertNull(provider.evaluate(FeatureFlagKey("unknown.flag"), ctx))
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private fun createFlag(key: String, defaultValue: FeatureFlagValue): FeatureFlag = FeatureFlag(
        key = FeatureFlagKey(key),
        enabled = true,
        defaultValue = defaultValue,
        updatedAt = fixedInstant,
    )
}
