// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data

import java.io.File
import java.nio.charset.Charset

enum class CsvEncoding(val charset: Charset, val displayName: String, val bomBytes: ByteArray?) {
    UTF_8(Charsets.UTF_8, "UTF-8", byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte())),
    UTF_16_LE(Charsets.UTF_16LE, "UTF-16 LE", byteArrayOf(0xFF.toByte(), 0xFE.toByte())),
    UTF_16_BE(Charsets.UTF_16BE, "UTF-16 BE", byteArrayOf(0xFE.toByte(), 0xFF.toByte())),
    LATIN_1(Charsets.ISO_8859_1, "Latin-1 (ISO-8859-1)", null),
    WINDOWS_1252(Charset.forName("windows-1252"), "Windows-1252", null),
}

object CsvEncodingDetector {
    fun detect(file: File): CsvEncoding {
        val header = ByteArray(minOf(file.length().toInt(), 8192))
        file.inputStream().use { it.read(header) }
        return detectFromBytes(header)
    }
    @Suppress("ReturnCount") // BOM detection loop naturally has multiple exit points
    fun detectFromBytes(bytes: ByteArray): CsvEncoding {
        for (enc in CsvEncoding.entries) {
            val bom = enc.bomBytes ?: continue
            if (bytes.size >= bom.size && bytes.take(bom.size).toByteArray().contentEquals(bom)) return enc
        }
        if (isValidUtf8(bytes)) return CsvEncoding.UTF_8
        val hasWin1252 = bytes.any { (it.toInt() and 0xFF) in 0x80..0x9F }
        return if (hasWin1252) CsvEncoding.WINDOWS_1252 else CsvEncoding.LATIN_1
    }
    fun readFile(file: File, encoding: CsvEncoding? = null): String {
        val enc = encoding ?: detect(file)
        val content = file.readText(enc.charset)
        return if (content.isNotEmpty() && content[0] == '\uFEFF') content.substring(1) else content
    }
    fun parseCsvLine(line: String, delimiter: Char = ','): List<String> {
        val fields = mutableListOf<String>()
        val cur = StringBuilder(); var inQ = false; var i = 0
        while (i < line.length) { val c = line[i]
            when { c == '"' && !inQ -> inQ = true
                c == '"' && inQ -> { if (i+1 < line.length && line[i+1] == '"') { cur.append('"'); i++ } else inQ = false }
                c == delimiter && !inQ -> { fields.add(cur.toString().trim()); cur.clear() }
                else -> cur.append(c) }; i++ }
        fields.add(cur.toString().trim()); return fields }
    @Suppress("ReturnCount") // UTF-8 validation requires early-return on invalid sequences
    private fun isValidUtf8(bytes: ByteArray): Boolean {
        var i = 0
        while (i < bytes.size) {
            val b = bytes[i].toInt() and 0xFF
            val n = when { b <= 0x7F -> 1; b in 0xC2..0xDF -> 2; b in 0xE0..0xEF -> 3; b in 0xF0..0xF4 -> 4; else -> return false }
            if (i + n > bytes.size) return false
            for (j in 1 until n) { if ((bytes[i + j].toInt() and 0xC0) != 0x80) return false }; i += n
        }; return true
    }
}
