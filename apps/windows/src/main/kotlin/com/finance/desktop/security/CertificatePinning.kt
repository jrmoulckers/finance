// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.security

import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.util.logging.Level
import java.util.logging.Logger
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

data class CertPin(val host: String, val sha256Hashes: List<String>)

/**
 * Certificate pinning for Windows desktop HTTP connections.
 * Pins Supabase and PowerSync endpoints with backup pins for rotation.
 * Emergency bypass available via settings flag for cert rotation scenarios.
 */
class CertificatePinningManager private constructor(
    private val pins: List<CertPin>,
    private val emergencyBypassEnabled: Boolean,
) {
    companion object {
        private val logger = Logger.getLogger(CertificatePinningManager::class.java.name)

        /** Default pins for production endpoints. */
        fun createDefault(emergencyBypass: Boolean = false) = CertificatePinningManager(
            pins = listOf(
                CertPin("supabase.co", listOf("PLACEHOLDER_PRIMARY_PIN_HASH", "PLACEHOLDER_BACKUP_PIN_HASH")),
                CertPin("powersync.co", listOf("PLACEHOLDER_PRIMARY_PIN_HASH", "PLACEHOLDER_BACKUP_PIN_HASH")),
            ),
            emergencyBypassEnabled = emergencyBypass,
        )
    }

    /** Creates an SSLContext with certificate pinning enforced. */
    fun createPinnedSslContext(): SSLContext {
        val tm = PinningTrustManager(pins, emergencyBypassEnabled)
        val ctx = SSLContext.getInstance("TLS")
        ctx.init(null, arrayOf<TrustManager>(tm), null)
        return ctx
    }

    /** Validates a certificate chain against stored pins. */
    @Suppress("ReturnCount") // Certificate validation requires multiple checks
    fun validateCertificate(host: String, chain: Array<X509Certificate>): Boolean {
        if (emergencyBypassEnabled) {
            logger.warning("Emergency bypass active -- skipping pin validation for " + host)
            return true
        }
        val pinSet = pins.firstOrNull { host.endsWith(it.host) } ?: return true
        return chain.any { cert ->
            val hash = sha256Hash(cert.publicKey.encoded)
            pinSet.sha256Hashes.any { it.equals(hash, ignoreCase = true) }
        }
    }

    private fun sha256Hash(data: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(data).joinToString("") { "%02x".format(it) }
    }
}

/** X509TrustManager that validates pins in addition to system trust. */
private class PinningTrustManager(
    private val pins: List<CertPin>,
    private val bypassEnabled: Boolean,
) : X509TrustManager {
    private val logger = Logger.getLogger(PinningTrustManager::class.java.name)
    private val systemTm: X509TrustManager = javax.net.ssl.TrustManagerFactory
        .getInstance(javax.net.ssl.TrustManagerFactory.getDefaultAlgorithm())
        .apply { init(null as java.security.KeyStore?) }
        .trustManagers.filterIsInstance<X509TrustManager>().first()

    override fun getAcceptedIssuers() = systemTm.acceptedIssuers
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = systemTm.checkClientTrusted(chain, authType)
    @Suppress("ReturnCount") // Certificate validation requires multiple checks
    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        systemTm.checkServerTrusted(chain, authType)
        if (bypassEnabled) return
        val cn = chain.firstOrNull()?.subjectX500Principal?.name ?: return
        val matchingPin = pins.firstOrNull { cn.contains(it.host, ignoreCase = true) } ?: return
        val chainHashes = chain.map { cert ->
            MessageDigest.getInstance("SHA-256").digest(cert.publicKey.encoded).joinToString("") { "%02x".format(it) }
        }
        val pinMatched = chainHashes.any { hash -> matchingPin.sha256Hashes.any { it.equals(hash, ignoreCase = true) } }
        if (!pinMatched) {
            logger.log(Level.SEVERE, "Certificate pin mismatch for " + cn)
            throw java.security.cert.CertificateException("Certificate pin verification failed for " + cn)
        }
    }
}
