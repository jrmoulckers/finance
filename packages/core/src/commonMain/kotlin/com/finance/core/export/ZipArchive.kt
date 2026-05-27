// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

/** Small KMP ZIP writer using stored (uncompressed) entries to avoid extra dependencies. */
object ZipArchive {
    private const val LOCAL_FILE_HEADER = 0x04034b50L
    private const val CENTRAL_DIRECTORY_HEADER = 0x02014b50L
    private const val END_OF_CENTRAL_DIRECTORY = 0x06054b50L
    private const val VERSION_NEEDED = 20
    private const val UTF8_FLAG = 0x0800
    private const val STORED_METHOD = 0
    private const val DOS_DATE_1980_01_01 = 33

    /** Builds a standards-compliant ZIP archive containing [files]. */
    fun build(files: List<GeneratedPackageFile>): ByteArray {
        require(files.isNotEmpty()) { "ZIP must contain at least one file" }

        val output = ByteArrayBuilder()
        val entries = mutableListOf<CentralDirectoryEntry>()

        for (file in files) {
            val nameBytes = file.path.encodeToByteArray()
            val offset = output.size
            val crc = Crc32.compute(file.bytes)

            output.writeInt(LOCAL_FILE_HEADER)
            output.writeShort(VERSION_NEEDED)
            output.writeShort(UTF8_FLAG)
            output.writeShort(STORED_METHOD)
            output.writeShort(0)
            output.writeShort(DOS_DATE_1980_01_01)
            output.writeInt(crc)
            output.writeInt(file.bytes.size.toLong())
            output.writeInt(file.bytes.size.toLong())
            output.writeShort(nameBytes.size)
            output.writeShort(0)
            output.writeBytes(nameBytes)
            output.writeBytes(file.bytes)

            entries += CentralDirectoryEntry(
                path = file.path,
                crc = crc,
                size = file.bytes.size,
                localHeaderOffset = offset,
            )
        }

        val centralDirectoryOffset = output.size
        for (entry in entries) {
            val nameBytes = entry.path.encodeToByteArray()
            output.writeInt(CENTRAL_DIRECTORY_HEADER)
            output.writeShort(VERSION_NEEDED)
            output.writeShort(VERSION_NEEDED)
            output.writeShort(UTF8_FLAG)
            output.writeShort(STORED_METHOD)
            output.writeShort(0)
            output.writeShort(DOS_DATE_1980_01_01)
            output.writeInt(entry.crc)
            output.writeInt(entry.size.toLong())
            output.writeInt(entry.size.toLong())
            output.writeShort(nameBytes.size)
            output.writeShort(0)
            output.writeShort(0)
            output.writeShort(0)
            output.writeShort(0)
            output.writeInt(0)
            output.writeInt(entry.localHeaderOffset.toLong())
            output.writeBytes(nameBytes)
        }
        val centralDirectorySize = output.size - centralDirectoryOffset

        output.writeInt(END_OF_CENTRAL_DIRECTORY)
        output.writeShort(0)
        output.writeShort(0)
        output.writeShort(entries.size)
        output.writeShort(entries.size)
        output.writeInt(centralDirectorySize.toLong())
        output.writeInt(centralDirectoryOffset.toLong())
        output.writeShort(0)

        return output.toByteArray()
    }

    /** Lists entry names from a ZIP produced by [build]. Useful for platform tests. */
    fun listEntryNames(zipBytes: ByteArray): List<String> {
        val names = mutableListOf<String>()
        var index = 0
        while (index <= zipBytes.size - 4) {
            val signature = readInt(zipBytes, index)
            if (signature == LOCAL_FILE_HEADER) {
                val nameLength = readShort(zipBytes, index + 26)
                val extraLength = readShort(zipBytes, index + 28)
                val compressedSize = readInt(zipBytes, index + 18).toInt()
                val nameStart = index + 30
                names += zipBytes.copyOfRange(nameStart, nameStart + nameLength).decodeToString()
                index = nameStart + nameLength + extraLength + compressedSize
            } else {
                index++
            }
        }
        return names
    }

    private data class CentralDirectoryEntry(
        val path: String,
        val crc: Long,
        val size: Int,
        val localHeaderOffset: Int,
    )

    private fun readShort(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xff) or
            ((bytes[offset + 1].toInt() and 0xff) shl 8)

    private fun readInt(bytes: ByteArray, offset: Int): Long =
        (bytes[offset].toLong() and 0xffL) or
            ((bytes[offset + 1].toLong() and 0xffL) shl 8) or
            ((bytes[offset + 2].toLong() and 0xffL) shl 16) or
            ((bytes[offset + 3].toLong() and 0xffL) shl 24)
}

private class ByteArrayBuilder(initialCapacity: Int = 4096) {
    private var buffer = ByteArray(initialCapacity)
    var size: Int = 0
        private set

    fun writeByte(value: Int) {
        ensureCapacity(size + 1)
        buffer[size++] = value.toByte()
    }

    fun writeBytes(bytes: ByteArray) {
        ensureCapacity(size + bytes.size)
        bytes.copyInto(buffer, destinationOffset = size)
        size += bytes.size
    }

    fun writeShort(value: Int) {
        writeByte(value and 0xff)
        writeByte((value ushr 8) and 0xff)
    }

    fun writeInt(value: Long) {
        require(value in 0..0xffffffffL) { "ZIP64 is not supported" }
        writeByte((value and 0xff).toInt())
        writeByte(((value ushr 8) and 0xff).toInt())
        writeByte(((value ushr 16) and 0xff).toInt())
        writeByte(((value ushr 24) and 0xff).toInt())
    }

    fun toByteArray(): ByteArray = buffer.copyOf(size)

    private fun ensureCapacity(required: Int) {
        if (required <= buffer.size) return
        var nextSize = buffer.size
        while (nextSize < required) {
            nextSize *= 2
        }
        buffer = buffer.copyOf(nextSize)
    }
}

private object Crc32 {
    private val table: IntArray = IntArray(256) { index ->
        var crc = index
        repeat(8) {
            crc = if ((crc and 1) != 0) {
                (crc ushr 1) xor 0xedb88320.toInt()
            } else {
                crc ushr 1
            }
        }
        crc
    }

    fun compute(bytes: ByteArray): Long {
        var crc = -1
        for (byte in bytes) {
            crc = (crc ushr 8) xor table[(crc xor byte.toInt()) and 0xff]
        }
        return (crc.inv().toLong() and 0xffffffffL)
    }
}
