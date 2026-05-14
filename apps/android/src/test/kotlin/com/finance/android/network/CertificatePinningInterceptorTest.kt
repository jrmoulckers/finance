// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.network

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Unit tests for [CertificatePinningInterceptor].
 *
 * Validates pin host matching, pinner construction, and client creation.
 */
class CertificatePinningInterceptorTest {

    @Test
    fun `isPinnedHost returns true for supabase domains`() {
        assertTrue(CertificatePinningInterceptor.isPinnedHost("myproject.supabase.co"))
        assertTrue(CertificatePinningInterceptor.isPinnedHost("abc123.supabase.co"))
    }

    @Test
    fun `isPinnedHost returns true for powersync domains`() {
        assertTrue(
            CertificatePinningInterceptor.isPinnedHost(
                "instance.powersync.journeyapps.com",
            ),
        )
    }

    @Test
    fun `isPinnedHost returns false for unrelated domains`() {
        assertFalse(CertificatePinningInterceptor.isPinnedHost("google.com"))
        assertFalse(CertificatePinningInterceptor.isPinnedHost("evil.supabase.co.attacker.com"))
        assertFalse(CertificatePinningInterceptor.isPinnedHost("example.com"))
    }

    @Test
    fun `buildCertificatePinner returns non-null pinner`() {
        val pinner = CertificatePinningInterceptor.buildCertificatePinner()
        assertNotNull(pinner)
    }

    @Test
    fun `createPinnedClient returns configured client`() {
        val client = CertificatePinningInterceptor.createPinnedClient()
        assertNotNull(client)
        assertNotNull(client.certificatePinner)
    }

    @Test
    fun `createPinnedClient extends base client`() {
        val baseClient = okhttp3.OkHttpClient.Builder()
            .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .build()

        val pinnedClient = CertificatePinningInterceptor.createPinnedClient(baseClient)
        assertNotNull(pinnedClient)
        assertNotNull(pinnedClient.certificatePinner)
    }
}
