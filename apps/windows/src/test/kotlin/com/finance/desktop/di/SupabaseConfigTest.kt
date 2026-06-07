// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.fail

class SupabaseConfigTest {
    @Test
    fun `fromEnvironment rejects missing configuration with actionable Windows guidance`() {
        val exception = try {
            SupabaseConfig.fromEnvironment(emptyMap())
            fail("Expected missing Supabase configuration to throw")
        } catch (exception: IllegalStateException) {
            exception
        }

        val message = exception.message.orEmpty()
        assertContains(message, "Finance is not configured")
        assertContains(message, SupabaseConfig.URL_ENV_VAR)
        assertContains(message, SupabaseConfig.ANON_KEY_ENV_VAR)
        assertContains(message, "System Properties → Environment Variables")
        assertContains(message, "setx SUPABASE_URL")
    }

    @Test
    fun `fromEnvironment returns trimmed Supabase values`() {
        val config = SupabaseConfig.fromEnvironment(
            mapOf(
                SupabaseConfig.URL_ENV_VAR to " https://example.supabase.co ",
                SupabaseConfig.ANON_KEY_ENV_VAR to " anon-key ",
            ),
        )

        assertEquals("https://example.supabase.co", config.url)
        assertEquals("anon-key", config.anonKey)
    }
}
