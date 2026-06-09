// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.icons

import com.finance.core.icons.mappings.FluentFilledMapping
import com.finance.core.icons.mappings.FluentRegularMapping
import com.finance.core.icons.mappings.LucideMapping
import com.finance.core.icons.mappings.MaterialSymbolsOutlinedMapping
import com.finance.core.icons.mappings.MaterialSymbolsRoundedMapping
import com.finance.core.icons.mappings.MaterialSymbolsSharpMapping
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class IconMappingsTest {
    @Test
    fun lucideMappingCoversAllTokens() {
        assertMappingCoversAllTokens("Lucide", LucideMapping.mapping)
    }

    @Test
    fun materialSymbolsOutlinedMappingCoversAllTokens() {
        assertMappingCoversAllTokens("Material Symbols Outlined", MaterialSymbolsOutlinedMapping.mapping)
    }

    @Test
    fun materialSymbolsRoundedMappingCoversAllTokens() {
        assertMappingCoversAllTokens("Material Symbols Rounded", MaterialSymbolsRoundedMapping.mapping)
    }

    @Test
    fun materialSymbolsSharpMappingCoversAllTokens() {
        assertMappingCoversAllTokens("Material Symbols Sharp", MaterialSymbolsSharpMapping.mapping)
    }

    @Test
    fun fluentRegularMappingCoversAllTokens() {
        assertMappingCoversAllTokens("Fluent Regular", FluentRegularMapping.mapping)
    }

    @Test
    fun fluentFilledMappingCoversAllTokens() {
        assertMappingCoversAllTokens("Fluent Filled", FluentFilledMapping.mapping)
    }

    private fun assertMappingCoversAllTokens(
        name: String,
        mapping: Map<IconToken, String>,
    ) {
        val missingTokens = IconToken.entries.filterNot { it in mapping }
        val emptyMappings = mapping.filterValues { it.isBlank() }.keys

        assertTrue(
            missingTokens.isEmpty(),
            "$name mapping is missing tokens: ${missingTokens.joinToString { it.name }}",
        )
        assertTrue(
            emptyMappings.isEmpty(),
            "$name mapping has empty values for: ${emptyMappings.joinToString { it.name }}",
        )
        assertEquals(IconToken.entries.size, mapping.size)
    }
}