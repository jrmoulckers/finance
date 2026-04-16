// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl

import com.finance.desktop.data.repository.AppSettings
import com.finance.desktop.data.repository.SettingsRepository
import com.finance.desktop.security.DpapiException
import com.finance.desktop.security.DpapiManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.util.Base64
import java.util.logging.Level
import java.util.logging.Logger

/**
 * DPAPI-encrypted settings repository.
 *
 * Persists [AppSettings] as JSON serialised with `kotlinx.serialization`, then
 * encrypted via [DpapiManager] and stored as a single file at
 * `%LOCALAPPDATA%\Finance\settings\app_settings.enc`.
 *
 * **Security guarantees:**
 * - Settings are never stored in plaintext on disk
 * - DPAPI binds ciphertext to the current Windows user account
 * - The storage directory is per-user and not cloud-synced
 *
 * **Thread safety:** All public methods are safe to call from any coroutine
 * dispatcher. Internal state is protected by [MutableStateFlow] which is
 * thread-safe.
 */
class DpapiSettingsRepository(
    private val dpapiManager: DpapiManager,
    private val storageDir: Path,
) : SettingsRepository {

    companion object {
        private val logger: Logger =
            Logger.getLogger(DpapiSettingsRepository::class.java.name)

        /** Filename for the encrypted settings blob. */
        private const val SETTINGS_FILE = "app_settings.enc"

        /** JSON codec with lenient defaults for forward-compatibility. */
        private val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
            prettyPrint = false
        }

        /**
         * Factory: creates a [DpapiSettingsRepository] using the standard
         * `%LOCALAPPDATA%\Finance\settings\` directory.
         */
        fun createDefault(): DpapiSettingsRepository {
            val localAppData = System.getenv("LOCALAPPDATA")
                ?: (System.getProperty("user.home") + "\\AppData\\Local")
            return DpapiSettingsRepository(
                dpapiManager = DpapiManager.create(),
                storageDir = Path.of(localAppData, "Finance", "settings"),
            )
        }
    }

    /** In-memory cache exposed as a StateFlow. */
    private val _settings = MutableStateFlow(AppSettings())

    /** Whether we have loaded from disk at least once. */
    @Volatile
    private var loaded = false

    // ── SettingsRepository contract ─────────────────────────────────────────

    override fun observe(): Flow<AppSettings> = _settings.asStateFlow()

    override suspend fun load(): AppSettings {
        if (!loaded) {
            val fromDisk = readFromDisk()
            _settings.value = fromDisk
            loaded = true
        }
        return _settings.value
    }

    override suspend fun save(settings: AppSettings) {
        writeToDisk(settings)
        _settings.value = settings
        loaded = true
    }

    override suspend fun reset() {
        save(AppSettings())
    }

    // ── Disk I/O (DPAPI-encrypted) ──────────────────────────────────────────

    /**
     * Reads and decrypts settings from disk.
     *
     * Returns [AppSettings] defaults if the file does not exist or
     * decryption / deserialisation fails (graceful degradation on first
     * launch or data corruption).
     */
    private fun readFromDisk(): AppSettings {
        val file = storageDir.resolve(SETTINGS_FILE)
        if (!Files.exists(file)) {
            logger.fine("No settings file found at $file — using defaults")
            return AppSettings()
        }

        return try {
            val b64Ciphertext = Files.readString(file).trim()
            val ciphertext = Base64.getDecoder().decode(b64Ciphertext)
            val plaintext = dpapiManager.decrypt(ciphertext)
            val jsonString = String(plaintext, Charsets.UTF_8)
            json.decodeFromString<AppSettings>(jsonString)
        } catch (e: DpapiException) {
            logger.log(Level.WARNING, "Failed to decrypt settings — resetting to defaults", e)
            AppSettings()
        } catch (e: Exception) {
            logger.log(Level.WARNING, "Failed to load settings — resetting to defaults", e)
            AppSettings()
        }
    }

    /**
     * Serialises, encrypts and writes [settings] to disk.
     */
    private fun writeToDisk(settings: AppSettings) {
        ensureStorageDir()
        val jsonString = json.encodeToString(AppSettings.serializer(), settings)
        val plaintext = jsonString.toByteArray(Charsets.UTF_8)
        val ciphertext = dpapiManager.encrypt(plaintext)
        val b64Ciphertext = Base64.getEncoder().encodeToString(ciphertext)

        val file = storageDir.resolve(SETTINGS_FILE)
        Files.writeString(
            file,
            b64Ciphertext,
            StandardOpenOption.CREATE,
            StandardOpenOption.TRUNCATE_EXISTING,
            StandardOpenOption.WRITE,
        )
        logger.fine("Settings persisted to $file")
    }

    /** Ensures the storage directory exists. */
    private fun ensureStorageDir() {
        if (!Files.exists(storageDir)) {
            Files.createDirectories(storageDir)
            logger.info("Created settings storage directory: $storageDir")
        }
    }
}
