// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Unit tests for [GigPlatform] keyword classification (#2133). */
class GigPlatformTest {

    @Test
    fun `classifies well-known ride-share and delivery payees`() {
        assertEquals(GigPlatform.UBER, GigPlatform.fromPayee("UBER TECHNOLOGIES"))
        assertEquals(GigPlatform.LYFT, GigPlatform.fromPayee("Lyft Inc"))
        assertEquals(GigPlatform.DOORDASH, GigPlatform.fromPayee("DOORDASH INC"))
        assertEquals(GigPlatform.INSTACART, GigPlatform.fromPayee("Maplebear Inc / Instacart"))
        assertEquals(GigPlatform.GRUBHUB, GigPlatform.fromPayee("GRUBHUB"))
        assertEquals(GigPlatform.AMAZON_FLEX, GigPlatform.fromPayee("AMAZON FLEX"))
        assertEquals(GigPlatform.SPARK, GigPlatform.fromPayee("WALMART SPARK"))
    }

    @Test
    fun `uber eats is not misclassified as ride-share uber`() {
        assertEquals(GigPlatform.UBER_EATS, GigPlatform.fromPayee("UBER EATS"))
        assertEquals(GigPlatform.UBER_EATS, GigPlatform.fromPayee("ubereats"))
    }

    @Test
    fun `matching is case-insensitive and considers the note`() {
        assertEquals(GigPlatform.DOORDASH, GigPlatform.fromPayee(payee = null, note = "weekly dasher payout"))
    }

    @Test
    fun `returns null when nothing matches`() {
        assertNull(GigPlatform.fromPayee("Local Coffee Shop"))
        assertNull(GigPlatform.fromPayee(null, null))
        assertNull(GigPlatform.fromPayee("", ""))
    }

    @Test
    fun `known platforms excludes the OTHER catch-all`() {
        assertEquals(false, GigPlatform.knownPlatforms.contains(GigPlatform.OTHER))
    }

    @Test
    fun `fromNameOrOther round-trips and defaults safely`() {
        assertEquals(GigPlatform.UBER, GigPlatform.fromNameOrOther("UBER"))
        assertEquals(GigPlatform.OTHER, GigPlatform.fromNameOrOther("NOT_A_PLATFORM"))
        assertEquals(GigPlatform.OTHER, GigPlatform.fromNameOrOther(null))
    }
}
