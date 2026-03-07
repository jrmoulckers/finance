package com.finance.sync.auth

/**
 * JS actual for [PlatformSHA256].
 *
 * Uses Node.js `crypto` module (available in Karma/Node test runners).
 */
actual object PlatformSHA256 {
    @Suppress("UnsafeCastFromDynamic")
    actual fun sha256(input: ByteArray): ByteArray {
        val crypto: dynamic = js("require('crypto')")
        val hash: dynamic = crypto.createHash("sha256")
        val jsArray = js("[]")
        for (b in input) {
            jsArray.push(b)
        }
        hash.update(js("Buffer.from(jsArray)"))
        val resultBuffer: dynamic = hash.digest()
        val len: Int = resultBuffer.length
        return ByteArray(len) { i: Int -> (resultBuffer[i] as Number).toByte() }
    }

    @Suppress("UnsafeCastFromDynamic")
    actual fun randomBytes(size: Int): ByteArray {
        val crypto: dynamic = js("require('crypto')")
        val buf: dynamic = crypto.randomBytes(size)
        val len: Int = buf.length
        return ByteArray(len) { i: Int -> (buf[i] as Number).toByte() }
    }
}
