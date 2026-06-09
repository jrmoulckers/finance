// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.icons

import com.finance.core.icons.mappings.LucideMapping
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class IconMappingsTest {
    @Test
    fun lucideMappingCoversAllTokens() {
        val missingTokens = IconToken.entries.filterNot { it in LucideMapping.mapping }

        assertTrue(
            missingTokens.isEmpty(),
            "Lucide mapping is missing tokens: ${missingTokens.joinToString { it.name }}",
        )
        assertEquals(IconToken.entries.size, LucideMapping.mapping.size)
    }
}
