// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.entitlement

import com.finance.core.entitlement.EntitlementEnvelope
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.MinimizedEntitlementCodec
import com.finance.desktop.data.storage.UserDataPaths
import com.finance.desktop.security.DpapiManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.security.MessageDigest
import java.util.Base64

/**
 * Display-only persistence for a previously fetched minimized entitlement.
 *
 * A cache entry is never an authorization input. It is scoped to the signed-in
 * user and optional household, protected with Windows DPAPI, and revalidated
 * through the shared codec every time it is read.
 */
interface EntitlementDisplayCache {
    suspend fun read(userId: String, householdId: String? = null): EntitlementEnvelope?

    suspend fun write(
        userId: String,
        householdId: String? = null,
        envelope: EntitlementEnvelope,
    )

    suspend fun remove(userId: String, householdId: String? = null)
}

class DpapiEntitlementDisplayCache(
    private val dpapiManager: DpapiManager,
    private val storageDir: Path,
) : EntitlementDisplayCache {

    companion object {
        private const val FILE_PREFIX = "entitlement-display-"
        private const val FILE_SUFFIX = ".enc"

        fun createDefault(dpapiManager: DpapiManager): DpapiEntitlementDisplayCache =
            DpapiEntitlementDisplayCache(
                dpapiManager,
                UserDataPaths.rootDir.resolve("security"),
            )
    }

    override suspend fun read(
        userId: String,
        householdId: String?,
    ): EntitlementEnvelope? = withContext(Dispatchers.IO) {
        val file = cacheFile(userId, householdId)
        if (!Files.isRegularFile(file)) return@withContext null

        @Suppress("TooGenericExceptionCaught") // Corrupt/unreadable display cache fails closed.
        try {
            val ciphertext = Base64.getDecoder().decode(Files.readString(file).trim())
            val payload = String(dpapiManager.decrypt(ciphertext), Charsets.UTF_8)
            when (val decoded = MinimizedEntitlementCodec.decode(payload)) {
                is EntitlementResult.Available -> decoded.envelope
                is EntitlementResult.Unavailable -> null
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            null
        }
    }

    override suspend fun write(
        userId: String,
        householdId: String?,
        envelope: EntitlementEnvelope,
    ) = withContext(Dispatchers.IO) {
        if (MinimizedEntitlementCodec.validate(envelope) !is EntitlementResult.Available) {
            return@withContext
        }

        var temporary: Path? = null
        @Suppress("TooGenericExceptionCaught") // Cache failure must not hide a live result.
        try {
            Files.createDirectories(storageDir)
            val payload = MinimizedEntitlementCodec.encode(envelope).toByteArray(Charsets.UTF_8)
            val protected = Base64.getEncoder().encodeToString(dpapiManager.encrypt(payload))
            val destination = cacheFile(userId, householdId)
            val tempFile = Files.createTempFile(storageDir, FILE_PREFIX, ".tmp")
            temporary = tempFile
            Files.writeString(
                tempFile,
                protected,
                StandardOpenOption.TRUNCATE_EXISTING,
                StandardOpenOption.WRITE,
            )
            try {
                Files.move(
                    tempFile,
                    destination,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING,
                )
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(tempFile, destination, StandardCopyOption.REPLACE_EXISTING)
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            // The in-memory server result remains usable; never fall back to plaintext.
        } finally {
            temporary?.let { runCatching { Files.deleteIfExists(it) } }
        }
    }

    override suspend fun remove(
        userId: String,
        householdId: String?,
    ) = withContext(Dispatchers.IO) {
        try {
            Files.deleteIfExists(cacheFile(userId, householdId))
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            // A denied entitlement is never read again during this session.
        }
        Unit
    }

    private fun cacheFile(userId: String, householdId: String?): Path {
        val scope = "$userId\u0000${householdId.orEmpty()}"
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(scope.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return storageDir.resolve("$FILE_PREFIX$digest$FILE_SUFFIX")
    }
}
