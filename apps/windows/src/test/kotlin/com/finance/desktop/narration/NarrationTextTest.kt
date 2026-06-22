// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.narration

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Unit tests for the pure narration formatting helpers ([NarrationText]).
 *
 * These run in CI with no model and no UI — they pin the spelled-out number,
 * money, percent, and date conventions the golden narrations depend on.
 */
class NarrationTextTest {

    @Test
    fun `spellInt spells small and compound numbers`() {
        assertEquals("zero", NarrationText.spellInt(0))
        assertEquals("eight", NarrationText.spellInt(8))
        assertEquals("twenty-one", NarrationText.spellInt(21))
        assertEquals("forty", NarrationText.spellInt(40))
        assertEquals("eighty-eight", NarrationText.spellInt(88))
    }

    @Test
    fun `spellInt spells hundreds thousands and millions`() {
        assertEquals("three hundred fifteen", NarrationText.spellInt(315))
        assertEquals("one thousand two hundred forty", NarrationText.spellInt(1240))
        assertEquals("forty-two thousand", NarrationText.spellInt(42000))
        assertEquals("four thousand six hundred", NarrationText.spellInt(4600))
        assertEquals("one million", NarrationText.spellInt(1_000_000))
    }

    @Test
    fun `ordinalDay spells direct and compound ordinals`() {
        assertEquals("first", NarrationText.ordinalDay(1))
        assertEquals("twentieth", NarrationText.ordinalDay(20))
        assertEquals("twenty-fifth", NarrationText.ordinalDay(25))
        assertEquals("thirty-first", NarrationText.ordinalDay(31))
    }

    @Test
    fun `groupThousands inserts separators`() {
        assertEquals("0", NarrationText.groupThousands(0))
        assertEquals("999", NarrationText.groupThousands(999))
        assertEquals("1,240", NarrationText.groupThousands(1240))
        assertEquals("42,000", NarrationText.groupThousands(42000))
        assertEquals("1,000,000", NarrationText.groupThousands(1_000_000))
    }

    @Test
    fun `formatCents renders currency glyph form`() {
        assertEquals("$88.00", NarrationText.formatCents(8800))
        assertEquals("$315.00", NarrationText.formatCents(31500))
        assertEquals("$1,240.50", NarrationText.formatCents(124050))
    }

    @Test
    fun `spellCents spells whole and fractional dollars`() {
        assertEquals("eighty-eight dollars", NarrationText.spellCents(8800))
        assertEquals("three hundred dollars", NarrationText.spellCents(30000))
        assertEquals(
            "one thousand two hundred forty dollars and fifty cents",
            NarrationText.spellCents(124050),
        )
        assertEquals("one dollar and one cent", NarrationText.spellCents(101))
    }

    @Test
    fun `whole dollar helpers format and spell`() {
        assertEquals("$40,000", NarrationText.formatWholeDollars(40000))
        assertEquals("$4,600", NarrationText.formatWholeDollars(4600))
        assertEquals("forty-two thousand dollars", NarrationText.spellWholeDollars(42000))
        assertEquals("four thousand six hundred dollars", NarrationText.spellWholeDollars(4600))
    }

    @Test
    fun `percent and one decimal are locale stable`() {
        assertEquals(56, NarrationText.percentInt(0.56))
        assertEquals(7, NarrationText.percentInt(0.07))
        assertEquals(46, NarrationText.percentInt(0.46))
        assertEquals("5.0", NarrationText.oneDecimal(5.0))
        assertEquals("21.2", NarrationText.oneDecimal(21.249))
    }

    @Test
    fun `dates render visible and spoken forms`() {
        assertEquals("June 25", NarrationText.monthDayVisible("2026-06-25"))
        assertEquals("June twenty-fifth", NarrationText.monthDayOrdinal("2026-06-25"))
        assertEquals("January 1", NarrationText.monthDayVisible("2026-01-01"))
    }

    @Test
    fun `capitalizeFirst upper-cases the leading letter only`() {
        assertEquals("Three hundred fifteen", NarrationText.capitalizeFirst("three hundred fifteen"))
        assertEquals("Your", NarrationText.capitalizeFirst("your"))
        assertEquals("", NarrationText.capitalizeFirst(""))
    }

    @Test
    fun `firstBannedTerm detects alarmist vocabulary case-insensitively`() {
        assertEquals("overspent", NarrationText.firstBannedTerm("You have OVERSPENT this month"))
        assertEquals("behind", NarrationText.firstBannedTerm("You are behind on savings"))
        assertEquals(null, NarrationText.firstBannedTerm("Your Dining plan is fully used."))
    }
}
