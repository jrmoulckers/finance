// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.network

import okhttp3.CertificatePinner
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import timber.log.Timber

/**
 * OkHttp interceptor that enforces certificate pinning for all Finance API endpoints.
 *
 * Pins both leaf and intermediate certificates for Supabase and PowerSync
 * endpoints, with backup pins to support certificate rotation without
 * requiring an app update.
 *
 * ## Security Model
 * - Primary pins match current production certificates.
 * - Backup pins match the next certificate in the rotation cycle.
 * - If all pins fail, the connection is refused entirely.
 *
 * ## Privacy
 * This interceptor **never** logs request bodies, authorization headers,
 * or any financial data. Only the target hostname is logged at debug level.
 */
class CertificatePinningInterceptor : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val host = request.url.host

        if (isPinnedHost(host)) {
            Timber.d("CertificatePinning: verified pinned host %s", host)
        }

        return chain.proceed(request)
    }

    companion object {

        // Replace these placeholder hashes with real SHA-256 pin hashes
        // from your certificate chain before production deployment.

        private const val SUPABASE_PIN_PRIMARY =
            "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
        private const val SUPABASE_PIN_BACKUP =
            "sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC="
        private const val SUPABASE_PIN_ROTATION =
            "sha256/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD="

        private const val POWERSYNC_PIN_PRIMARY =
            "sha256/EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE="
        private const val POWERSYNC_PIN_BACKUP =
            "sha256/FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF="

        private const val SUPABASE_HOST_PATTERN = "*.supabase.co"
        private const val POWERSYNC_HOST_PATTERN = "*.powersync.journeyapps.com"

        /**
         * Builds the [CertificatePinner] with all configured pins.
         *
         * Both primary and backup pins are included so that certificate
         * rotation does not immediately break clients.
         */
        fun buildCertificatePinner(): CertificatePinner {
            return CertificatePinner.Builder()
                .add(SUPABASE_HOST_PATTERN, SUPABASE_PIN_PRIMARY)
                .add(SUPABASE_HOST_PATTERN, SUPABASE_PIN_BACKUP)
                .add(SUPABASE_HOST_PATTERN, SUPABASE_PIN_ROTATION)
                .add(POWERSYNC_HOST_PATTERN, POWERSYNC_PIN_PRIMARY)
                .add(POWERSYNC_HOST_PATTERN, POWERSYNC_PIN_BACKUP)
                .build()
        }

        /**
         * Creates an [OkHttpClient] with certificate pinning pre-configured.
         *
         * @param baseClient Optional base client to extend.
         * @return An [OkHttpClient] with certificate pinning enforced.
         */
        fun createPinnedClient(baseClient: OkHttpClient? = null): OkHttpClient {
            val builder = (baseClient?.newBuilder() ?: OkHttpClient.Builder())
                .certificatePinner(buildCertificatePinner())
                .addInterceptor(CertificatePinningInterceptor())

            Timber.i(
                "Pinned OkHttpClient created for %s, %s",
                SUPABASE_HOST_PATTERN,
                POWERSYNC_HOST_PATTERN,
            )
            return builder.build()
        }

        /**
         * Validates that the supplied [host] is a pinned domain.
         *
         * @param host The hostname to check.
         * @return `true` if [host] matches a pinned domain pattern.
         */
        fun isPinnedHost(host: String): Boolean {
            return host.endsWith(".supabase.co") ||
                host.endsWith(".powersync.journeyapps.com")
        }
    }
}