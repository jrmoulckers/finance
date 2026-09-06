// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.entitlement

import com.finance.core.entitlement.BankConnectionAllowance
import com.finance.core.entitlement.DowngradeStatus
import com.finance.core.entitlement.ENTITLEMENT_CATALOG_VERSION
import com.finance.core.entitlement.ENTITLEMENT_CONTRACT_VERSION
import com.finance.core.entitlement.EntitlementAccessState
import com.finance.core.entitlement.EntitlementEnvelope
import com.finance.core.entitlement.EntitlementScope
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementValidity
import com.finance.core.entitlement.MinimizedEntitlement
import com.finance.core.entitlement.PendingDowngrade
import com.finance.desktop.security.DpapiEncryptionProvider
import com.finance.desktop.security.DpapiManager
import kotlinx.coroutines.runBlocking
import kotlinx.datetime.Instant
import java.nio.file.Files
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

class DpapiEntitlementDisplayCacheTest {
    @Test
    fun `cache is protected scoped and revalidated`() = runBlocking {
        val directory = Files.createTempDirectory("finance-entitlement-cache")
        try {
            val cache = DpapiEntitlementDisplayCache(
                dpapiManager = DpapiManager.create(ReversingDpapiProvider),
                storageDir = directory,
            )
            val envelope = familyEnvelope()

            cache.write("user-a", null, envelope)

            assertEquals(envelope, cache.read("user-a", null))
            assertNull(cache.read("user-b", null))
            val persisted = Files.list(directory).use { it.findFirst().orElseThrow() }.readText()
            assertFalse(persisted.contains("\"tier\":\"family\""))
        } finally {
            directory.toFile().deleteRecursively()
        }
    }

    @Test
    fun `invalid envelope is never persisted`() = runBlocking {
        val directory = Files.createTempDirectory("finance-entitlement-cache-invalid")
        try {
            val cache = DpapiEntitlementDisplayCache(
                dpapiManager = DpapiManager.create(ReversingDpapiProvider),
                storageDir = directory,
            )

            cache.write("user-a", null, familyEnvelope().copy(contractVersion = 99))

            assertNull(cache.read("user-a", null))
            assertEquals(0, Files.list(directory).use { it.count() })
        } finally {
            directory.toFile().deleteRecursively()
        }
    }

    @Test
    fun `cache can be invalidated after an authoritative denial`() = runBlocking {
        val directory = Files.createTempDirectory("finance-entitlement-cache-remove")
        try {
            val cache = DpapiEntitlementDisplayCache(
                dpapiManager = DpapiManager.create(ReversingDpapiProvider),
                storageDir = directory,
            )
            cache.write("user-a", "household-a", familyEnvelope())

            cache.remove("user-a", "household-a")

            assertNull(cache.read("user-a", "household-a"))
            assertEquals(0, Files.list(directory).use { it.count() })
        } finally {
            directory.toFile().deleteRecursively()
        }
    }

    private fun familyEnvelope(): EntitlementEnvelope {
        val serverTime = Instant.parse("2033-05-18T03:33:21Z")
        val refreshAfter = Instant.parse("2033-06-18T03:33:20Z")
        return EntitlementEnvelope(
            contractVersion = ENTITLEMENT_CONTRACT_VERSION,
            catalogVersion = ENTITLEMENT_CATALOG_VERSION,
            entitlement = MinimizedEntitlement(
                scope = EntitlementScope.HOUSEHOLD,
                tier = EntitlementTier.FAMILY,
                userTier = EntitlementTier.FREE,
                householdTier = EntitlementTier.FAMILY,
                accessState = EntitlementAccessState.GRANTED,
                lifecycle = null,
                isPremiumSponsor = false,
                isFamilyBound = true,
                bankConnections = BankConnectionAllowance(4, 4, 0),
                validity = EntitlementValidity(
                    effectiveAt = serverTime,
                    refreshAfter = refreshAfter,
                    serverTime = serverTime,
                    projectionVersion = 7,
                ),
                downgrade = PendingDowngrade(DowngradeStatus.SCHEDULED, refreshAfter),
            ),
        )
    }

    private data object ReversingDpapiProvider : DpapiEncryptionProvider {
        override fun protect(data: ByteArray): ByteArray = data.reversedArray()

        override fun unprotect(data: ByteArray): ByteArray = data.reversedArray()
    }
}
