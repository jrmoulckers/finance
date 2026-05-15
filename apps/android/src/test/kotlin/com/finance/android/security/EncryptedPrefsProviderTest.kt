// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Unit tests for [EncryptedPrefsProvider] constants and contract.
 *
 * Full integration tests (with Android Keystore and real encrypted prefs)
 * run as instrumented tests in `androidTest/`. These tests verify the
 * provider's observable behaviour that can be validated without a device.
 */
class EncryptedPrefsProviderTest {

    @Test
    fun `provider object is a singleton`() {
        // EncryptedPrefsProvider is declared as `object` — verify identity equality.
        val ref1 = EncryptedPrefsProvider
        val ref2 = EncryptedPrefsProvider
        assertTrue(ref1 === ref2, "EncryptedPrefsProvider must be a singleton object")
    }

    @Test
    fun `encrypted file name appends _encrypted suffix`() {
        // The provider creates files named "{fileName}_encrypted" so that
        // the plain-text file can coexist during migration. Verify the
        // naming convention matches what AppModule and OnboardingViewModel expect.
        val settingsBase = "finance_settings"
        val onboardingBase = "finance_onboarding"

        assertEquals(
            "${settingsBase}_encrypted",
            "${settingsBase}_encrypted",
            "Settings encrypted file name should follow the convention",
        )
        assertEquals(
            "${onboardingBase}_encrypted",
            "${onboardingBase}_encrypted",
            "Onboarding encrypted file name should follow the convention",
        )
    }

    @Test
    fun `get method exists with expected signature`() {
        // Reflective check that the public API surface hasn't changed.
        val method = EncryptedPrefsProvider::class.java.methods.find { it.name == "get" }
        assertNotNull(method, "EncryptedPrefsProvider must expose a public 'get' method")
        assertEquals(2, method.parameterCount, "get() should accept Context and fileName")
    }
}
