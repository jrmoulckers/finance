// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import kotlin.test.*

class CsvParserTest {

    // ═════════════════════════════════════════════════════════════════
    // parseRows — basic parsing
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun parseRows_emptyString_returnsEmptyList() {
        val result = CsvParser.parseRows("")
        assertTrue(result.isEmpty())
    }

    @Test
    fun parseRows_blankString_returnsEmptyList() {
        val result = CsvParser.parseRows("   \n  \n  ")
        assertTrue(result.isEmpty())
    }

    @Test
    fun parseRows_singleRow_returnsOneRow() {
        val result = CsvParser.parseRows("a,b,c")
        assertEquals(1, result.size)
        assertEquals(listOf("a", "b", "c"), result[0])
    }

    @Test
    fun parseRows_multipleRows_crlfEndings() {
        val result = CsvParser.parseRows("a,b\r\nc,d\r\n")
        assertEquals(2, result.size)
        assertEquals(listOf("a", "b"), result[0])
        assertEquals(listOf("c", "d"), result[1])
    }

    @Test
    fun parseRows_multipleRows_lfEndings() {
        val result = CsvParser.parseRows("a,b\nc,d\n")
        assertEquals(2, result.size)
        assertEquals(listOf("a", "b"), result[0])
        assertEquals(listOf("c", "d"), result[1])
    }

    @Test
    fun parseRows_skipsCommentLines() {
        val content = "# This is a comment\r\na,b,c\r\n# Another comment\r\nd,e,f\r\n"
        val result = CsvParser.parseRows(content)
        assertEquals(2, result.size)
        assertEquals(listOf("a", "b", "c"), result[0])
        assertEquals(listOf("d", "e", "f"), result[1])
    }

    @Test
    fun parseRows_skipsBlankLines() {
        val content = "a,b\r\n\r\nc,d\r\n"
        val result = CsvParser.parseRows(content)
        assertEquals(2, result.size)
    }

    // ═════════════════════════════════════════════════════════════════
    // parseRows — RFC 4180 quoting
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun parseRows_quotedFields_preservesCommas() {
        val result = CsvParser.parseRows("\"hello, world\",b")
        assertEquals(1, result.size)
        assertEquals(listOf("hello, world", "b"), result[0])
    }

    @Test
    fun parseRows_quotedFields_escapedDoubleQuotes() {
        val result = CsvParser.parseRows("\"She said \"\"hello\"\"\",b")
        assertEquals(1, result.size)
        assertEquals(listOf("She said \"hello\"", "b"), result[0])
    }

    @Test
    fun parseRows_quotedFields_containsNewline() {
        val result = CsvParser.parseRows("\"line1\nline2\",b\r\nc,d")
        assertEquals(2, result.size)
        assertEquals("line1\nline2", result[0][0])
        assertEquals("b", result[0][1])
        assertEquals(listOf("c", "d"), result[1])
    }

    @Test
    fun parseRows_emptyQuotedField() {
        val result = CsvParser.parseRows("\"\",b,c")
        assertEquals(1, result.size)
        assertEquals(listOf("", "b", "c"), result[0])
    }

    @Test
    fun parseRows_emptyUnquotedFields() {
        val result = CsvParser.parseRows("a,,c")
        assertEquals(1, result.size)
        assertEquals(listOf("a", "", "c"), result[0])
    }

    // ═════════════════════════════════════════════════════════════════
    // parseSections — multi-section format
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun parseSections_emptyString_returnsEmptyMap() {
        val result = CsvParser.parseSections("")
        assertTrue(result.isEmpty())
    }

    @Test
    fun parseSections_singleSection() {
        val content = """
            # ACCOUNTS
            id,name,type
            1,Checking,CHECKING
            2,Savings,SAVINGS
        """.trimIndent().replace("\n", "\r\n")

        val result = CsvParser.parseSections(content)
        assertEquals(1, result.size)
        assertTrue(result.containsKey("ACCOUNTS"))

        val accountRows = result["ACCOUNTS"]!!
        assertEquals(3, accountRows.size) // header + 2 data rows
        assertEquals(listOf("id", "name", "type"), accountRows[0])
        assertEquals("1", accountRows[1][0])
        assertEquals("Checking", accountRows[1][1])
    }

    @Test
    fun parseSections_multipleSections() {
        val content = buildString {
            append("# ACCOUNTS\r\n")
            append("id,name\r\n")
            append("1,Checking\r\n")
            append("\r\n")
            append("# TRANSACTIONS\r\n")
            append("id,amount\r\n")
            append("t1,25.00\r\n")
        }

        val result = CsvParser.parseSections(content)
        assertEquals(2, result.size)
        assertTrue(result.containsKey("ACCOUNTS"))
        assertTrue(result.containsKey("TRANSACTIONS"))

        assertEquals(2, result["ACCOUNTS"]!!.size) // header + 1 data row
        assertEquals(2, result["TRANSACTIONS"]!!.size) // header + 1 data row
    }

    @Test
    fun parseSections_caseInsensitiveSectionNames() {
        val content = "# accounts\r\nid,name\r\n1,Test\r\n"
        val result = CsvParser.parseSections(content)
        assertTrue(result.containsKey("ACCOUNTS"))
    }

    @Test
    fun parseSections_ignoresDataBeforeFirstSection() {
        val content = "stray,data\r\n# ACCOUNTS\r\nid,name\r\n1,Test\r\n"
        val result = CsvParser.parseSections(content)
        assertEquals(1, result.size)
        assertTrue(result.containsKey("ACCOUNTS"))
    }

    @Test
    fun parseSections_metadataSection() {
        val content = buildString {
            append("# METADATA\r\n")
            append("key,value\r\n")
            append("export_date,2024-06-15T12:00:00Z\r\n")
            append("app_version,2.1.0\r\n")
            append("\r\n")
            append("# ACCOUNTS\r\n")
            append("id,name\r\n")
            append("1,Checking\r\n")
        }

        val result = CsvParser.parseSections(content)
        assertEquals(2, result.size)
        assertTrue(result.containsKey("METADATA"))
        assertTrue(result.containsKey("ACCOUNTS"))
    }
}
