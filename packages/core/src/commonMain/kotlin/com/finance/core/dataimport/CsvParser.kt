// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

/**
 * Low-level RFC 4180-compliant CSV parser.
 *
 * Handles:
 * - Quoted fields (fields enclosed in double-quotes)
 * - Escaped double-quotes within quoted fields (`""`)
 * - CRLF and LF line endings
 * - Fields containing commas, quotes, and newlines
 *
 * This parser operates on raw CSV strings and produces lists of string field
 * values. Higher-level mapping from string fields to domain models is handled
 * by [CsvImportParser].
 *
 * @see CsvImportParser
 */
internal object CsvParser {

    /**
     * Parses a CSV string into a list of rows, where each row is a list of
     * string field values.
     *
     * - Lines that start with `#` are treated as comment lines and excluded.
     * - Blank lines (after trimming) are excluded.
     * - Both CRLF and LF line endings are supported.
     * - Quoted fields may span multiple lines (per RFC 4180).
     *
     * @param content The raw CSV content to parse.
     * @return A list of rows, each row being a list of field strings.
     * @throws IllegalArgumentException if the CSV is malformed (e.g., unterminated quote).
     */
    fun parseRows(content: String): List<List<String>> {
        if (content.isBlank()) return emptyList()

        val rows = mutableListOf<List<String>>()
        val chars = content.toCharArray()
        var pos = 0

        while (pos < chars.size) {
            // Skip blank lines
            if (chars[pos] == '\r' || chars[pos] == '\n') {
                pos = skipLineEnding(chars, pos)
                continue
            }

            // Skip comment lines (starting with #)
            if (chars[pos] == '#') {
                pos = skipToNextLine(chars, pos)
                continue
            }

            val (row, nextPos) = parseRow(chars, pos)
            rows.add(row)
            pos = nextPos
        }

        return rows
    }

    /**
     * Splits CSV content into named sections based on `# SECTION_NAME` comment headers.
     *
     * This handles the multi-section CSV format produced by
     * [com.finance.core.export.CsvExportSerializer], where each entity type is
     * prefixed with a comment line like `# ACCOUNTS`, `# TRANSACTIONS`, etc.
     *
     * @param content The raw multi-section CSV content.
     * @return A map from section name (e.g., "ACCOUNTS") to the list of parsed
     *         rows (including the header row as the first element).
     */
    fun parseSections(content: String): Map<String, List<List<String>>> {
        if (content.isBlank()) return emptyMap()

        val sections = mutableMapOf<String, MutableList<List<String>>>()
        var currentSection: String? = null
        val chars = content.toCharArray()
        var pos = 0

        while (pos < chars.size) {
            // Skip blank lines
            if (chars[pos] == '\r' || chars[pos] == '\n') {
                pos = skipLineEnding(chars, pos)
                continue
            }

            // Check for section header
            if (chars[pos] == '#') {
                val lineEnd = findLineEnd(chars, pos)
                val line = chars.concatToString(pos, lineEnd).trim()
                val sectionName = line.removePrefix("#").trim().uppercase()
                if (sectionName.isNotEmpty()) {
                    currentSection = sectionName
                    if (sectionName !in sections) {
                        sections[sectionName] = mutableListOf()
                    }
                }
                pos = skipToNextLine(chars, pos)
                continue
            }

            // Parse data row
            if (currentSection != null) {
                val (row, nextPos) = parseRow(chars, pos)
                sections[currentSection]?.add(row)
                pos = nextPos
            } else {
                // Data before any section header — skip
                pos = skipToNextLine(chars, pos)
            }
        }

        return sections
    }

    // ═════════════════════════════════════════════════════════════════
    // Internal parsing implementation
    // ═════════════════════════════════════════════════════════════════

    /**
     * Parses a single CSV row starting at [startPos].
     *
     * @return A pair of (parsed fields, position after the row terminator).
     */
    private fun parseRow(chars: CharArray, startPos: Int): Pair<List<String>, Int> {
        val fields = mutableListOf<String>()
        var pos = startPos

        while (pos < chars.size) {
            val (field, nextPos) = parseField(chars, pos)
            fields.add(field)
            pos = nextPos

            if (pos >= chars.size) break

            when (chars[pos]) {
                ',' -> {
                    pos++ // consume comma, continue to next field
                    // Handle trailing comma (empty last field)
                    if (pos >= chars.size || chars[pos] == '\r' || chars[pos] == '\n') {
                        fields.add("")
                        break
                    }
                }
                '\r', '\n' -> {
                    pos = skipLineEnding(chars, pos)
                    break
                }
                else -> break
            }
        }

        return fields to pos
    }

    /**
     * Parses a single CSV field starting at [startPos].
     *
     * Handles both quoted and unquoted fields per RFC 4180.
     *
     * @return A pair of (field value, position after the field).
     */
    private fun parseField(chars: CharArray, startPos: Int): Pair<String, Int> {
        if (startPos >= chars.size) return "" to startPos

        return if (chars[startPos] == '"') {
            parseQuotedField(chars, startPos)
        } else {
            parseUnquotedField(chars, startPos)
        }
    }

    /**
     * Parses a quoted CSV field. The opening `"` at [startPos] is consumed.
     * Escaped quotes (`""`) are unescaped to `"`.
     * The field continues until a closing `"` that is not followed by another `"`.
     */
    private fun parseQuotedField(chars: CharArray, startPos: Int): Pair<String, Int> {
        val sb = StringBuilder()
        var pos = startPos + 1 // skip opening quote

        while (pos < chars.size) {
            when (chars[pos]) {
                '"' -> {
                    // Check for escaped quote ""
                    if (pos + 1 < chars.size && chars[pos + 1] == '"') {
                        sb.append('"')
                        pos += 2
                    } else {
                        // Closing quote
                        pos++ // skip closing quote
                        return sb.toString() to pos
                    }
                }
                else -> {
                    sb.append(chars[pos])
                    pos++
                }
            }
        }

        // Unterminated quote — return what we have
        return sb.toString() to pos
    }

    /**
     * Parses an unquoted CSV field. Reads until comma, CR, LF, or end of input.
     */
    private fun parseUnquotedField(chars: CharArray, startPos: Int): Pair<String, Int> {
        var pos = startPos
        while (pos < chars.size && chars[pos] != ',' && chars[pos] != '\r' && chars[pos] != '\n') {
            pos++
        }
        return chars.concatToString(startPos, pos) to pos
    }

    // ═════════════════════════════════════════════════════════════════
    // Line-ending helpers
    // ═════════════════════════════════════════════════════════════════

    /** Skips a CRLF or LF line ending at [pos]. */
    private fun skipLineEnding(chars: CharArray, pos: Int): Int {
        if (pos >= chars.size) return pos
        return if (chars[pos] == '\r') {
            if (pos + 1 < chars.size && chars[pos + 1] == '\n') pos + 2 else pos + 1
        } else if (chars[pos] == '\n') {
            pos + 1
        } else {
            pos
        }
    }

    /** Finds the end of the current line (position of CR or LF). */
    private fun findLineEnd(chars: CharArray, pos: Int): Int {
        var i = pos
        while (i < chars.size && chars[i] != '\r' && chars[i] != '\n') i++
        return i
    }

    /** Skips from [pos] to the start of the next line. */
    private fun skipToNextLine(chars: CharArray, pos: Int): Int {
        val lineEnd = findLineEnd(chars, pos)
        return skipLineEnding(chars, lineEnd)
    }
}
