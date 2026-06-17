// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.ui.components

import com.finance.core.icons.FLUENT_FILLED
import com.finance.core.icons.FLUENT_REGULAR
import com.finance.core.icons.IconToken
import com.finance.core.icons.STANDARD_LUCIDE
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class IconViewTest {
    @Test
    fun resolvesRenderableStarterIconForEachWindowsPack() {
        val expected = mapOf(
            STANDARD_LUCIDE to "/icons/lucide/home.svg",
            FLUENT_REGULAR to "/icons/fluent-regular/ic_fluent_home_24_regular.svg",
            FLUENT_FILLED to "/icons/fluent-filled/ic_fluent_home_24_filled.svg",
        )

        expected.forEach { (packId, resourcePath) ->
            val resolved = resolveIconResource(IconToken.HOME, iconPackForId(packId))

            assertEquals(resourcePath, resolved.resourcePath)
            assertTrue(resolved.exists, "Expected $resourcePath to be vendored for $packId")
        }
    }

    @Test
    fun unknownPackFallsBackToWindowsDefaultPack() {
        val pack = iconPackForId("unknown")

        assertEquals(FLUENT_REGULAR, pack.id)
    }
}
