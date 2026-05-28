// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.storage

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.Comparator
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Canonical resolution of user-data paths for the Windows desktop client.
 *
 * Historically, the MSI installed `Finance.exe` and runtime resources to
 * `%LOCALAPPDATA%\Finance\` and the app **also** wrote its runtime data
 * (SQLCipher DB, DPAPI-wrapped key, settings, GDPR consent) to subdirs of
 * that same root. That conflated "program files" and "user data" in a
 * single directory, with two concrete failure modes:
 *
 *  1. **Data loss on uninstall.** A naive MSI uninstall (or a user
 *     manually deleting the install folder) wipes user data alongside
 *     binaries.
 *  2. **Reduced isolation between binaries and secrets.** A compromised
 *     installer or supply-chain attack on the executables has adjacent
 *     read access to the encrypted DB and DPAPI ciphertext.
 *
 * This object provides the canonical paths and centralises the one-time
 * migration from the legacy in-install-root layout. All call sites that
 * need to read/write user data MUST go through this object — the legacy
 * `Path.of(localAppData, "Finance", ...)` pattern is forbidden.
 *
 * **Layout**
 *
 * | Concept              | Legacy                                       | New                                            |
 * | -------------------- | -------------------------------------------- | ---------------------------------------------- |
 * | Root                 | `%LOCALAPPDATA%\Finance\` (= MSI install)    | `%LOCALAPPDATA%\FinanceUserData\`              |
 * | Database             | `%LOCALAPPDATA%\Finance\data\finance.db`     | `%LOCALAPPDATA%\FinanceUserData\data\finance.db` |
 * | DPAPI key + tokens   | `%LOCALAPPDATA%\Finance\security\`           | `%LOCALAPPDATA%\FinanceUserData\security\`     |
 * | Settings             | `%LOCALAPPDATA%\Finance\settings\`           | `%LOCALAPPDATA%\FinanceUserData\settings\`     |
 * | GDPR consent file    | `%LOCALAPPDATA%\Finance\gdpr_consent.json`   | `%LOCALAPPDATA%\FinanceUserData\gdpr_consent.json` |
 *
 * The new root is intentionally named `FinanceUserData` (not just `Finance`)
 * so it can never collide with whatever MSI install root jpackage chooses.
 *
 * Tracks #1900.
 */
object UserDataPaths {
    private val logger: Logger = Logger.getLogger(UserDataPaths::class.java.name)

    private const val LEGACY_ROOT_NAME = "Finance"
    private const val NEW_ROOT_NAME = "FinanceUserData"
    private const val CONSENT_FILE_NAME = "gdpr_consent.json"

    // Subdirectories migrated as bulk units: legacy/<name>/... -> new/<name>/...
    private val migratedSubdirs = listOf("data", "security", "settings")

    // Single files migrated at the root level: legacy/<file> -> new/<file>
    private val migratedRootFiles = listOf(CONSENT_FILE_NAME)

    /** Root user-data directory. Created lazily by the subdir accessors. */
    val rootDir: Path
        get() = Path.of(resolveLocalAppData(), NEW_ROOT_NAME)

    /** DB directory (`...\FinanceUserData\data\`). Created on first access. */
    val dataDir: Path
        get() = ensureDir(rootDir.resolve("data"))

    /** DPAPI key + token directory (`...\FinanceUserData\security\`). */
    val securityDir: Path
        get() = ensureDir(rootDir.resolve("security"))

    /** Settings directory (`...\FinanceUserData\settings\`). */
    val settingsDir: Path
        get() = ensureDir(rootDir.resolve("settings"))

    /** GDPR consent file (`...\FinanceUserData\gdpr_consent.json`). */
    val consentFile: Path
        get() = ensureDir(rootDir).resolve(CONSENT_FILE_NAME)

    /**
     * One-time migration of user data from the legacy in-install-root layout
     * to the new sibling layout. Idempotent — safe to call on every startup.
     *
     * **Strategy.** For each legacy subdir under `%LOCALAPPDATA%\Finance\`,
     * if the new path is empty/missing and the legacy path has content,
     * move the legacy directory's contents into the new location. Each
     * legacy single-file (e.g. `gdpr_consent.json`) is moved if the
     * destination doesn't already exist. MSI install files (`Finance.exe`,
     * `runtime/`, `app/`) are never touched.
     *
     * **Conflict handling.** If both legacy and new versions of a subdir
     * or file exist with content, the new version wins and the legacy
     * artefact is left in place for manual review. This protects against
     * accidentally overwriting a freshly-migrated install.
     *
     * **Failure handling.** Per-item exceptions are logged but never
     * thrown — a single failed move does not abort migration of the
     * remaining items, and the call sites will create fresh empty
     * directories at the new path if needed.
     *
     * @param localAppData override for `%LOCALAPPDATA%`. Defaults to the
     *   env var (with home-dir fallback). Tests pass a temp dir.
     * @return `true` if any item was actually migrated, `false` if
     *   nothing needed to move (clean install or already migrated).
     */
    @Suppress("TooGenericExceptionCaught", "NestedBlockDepth")
    fun migrateLegacyDataIfNeeded(localAppData: String = resolveLocalAppData()): Boolean {
        val legacyRoot = Path.of(localAppData, LEGACY_ROOT_NAME)
        val newRoot = Path.of(localAppData, NEW_ROOT_NAME)

        if (!Files.isDirectory(legacyRoot)) return false

        var anyMoved = false

        // ── Migrate bulk subdirs ───────────────────────────────────────
        for (subdir in migratedSubdirs) {
            val from = legacyRoot.resolve(subdir)
            val to = newRoot.resolve(subdir)
            if (!Files.isDirectory(from)) continue

            if (Files.isDirectory(to) && hasContent(to)) {
                logger.warning(
                    "Both legacy ($from) and new ($to) user-data subdirs exist. " +
                        "Using new; legacy left in place for manual review.",
                )
                continue
            }

            try {
                Files.createDirectories(newRoot)
                moveDirectory(from, to)
                anyMoved = true
                logger.info("Migrated user-data subdir: $from -> $to")
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "Failed to migrate user-data subdir $from -> $to", e)
            }
        }

        // ── Migrate root-level single files ────────────────────────────
        for (fileName in migratedRootFiles) {
            val from = legacyRoot.resolve(fileName)
            val to = newRoot.resolve(fileName)
            if (!Files.isRegularFile(from)) continue

            if (Files.exists(to)) {
                logger.warning(
                    "Both legacy ($from) and new ($to) user-data files exist. " +
                        "Using new; legacy left in place for manual review.",
                )
                continue
            }

            try {
                Files.createDirectories(newRoot)
                Files.move(from, to, StandardCopyOption.REPLACE_EXISTING)
                anyMoved = true
                logger.info("Migrated user-data file: $from -> $to")
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "Failed to migrate user-data file $from -> $to", e)
            }
        }

        return anyMoved
    }

    /**
     * Recursively moves a directory tree from [from] to [to].
     *
     * Tries an atomic `Files.move` first (works on the same volume).
     * Falls back to file-by-file copy + delete on failure, which handles
     * cross-volume moves and partially-locked files (e.g. an antivirus
     * scan briefly holding open a file in the legacy tree).
     */
    @Suppress("TooGenericExceptionCaught")
    private fun moveDirectory(from: Path, to: Path) {
        try {
            Files.move(from, to)
            return
        } catch (e: Exception) {
            logger.log(
                Level.FINE,
                "Atomic move failed, falling back to copy+delete: ${e.message}",
            )
        }

        Files.createDirectories(to)
        Files.walk(from).use { stream ->
            stream.forEach { src ->
                val rel = from.relativize(src)
                val dest = if (rel.toString().isEmpty()) to else to.resolve(rel.toString())
                if (Files.isDirectory(src)) {
                    Files.createDirectories(dest)
                } else {
                    Files.copy(src, dest, StandardCopyOption.REPLACE_EXISTING)
                }
            }
        }

        Files.walk(from)
            .sorted(Comparator.reverseOrder())
            .use { stream -> stream.forEach { Files.deleteIfExists(it) } }
    }

    private fun hasContent(dir: Path): Boolean {
        return Files.list(dir).use { it.findFirst().isPresent }
    }

    private fun ensureDir(p: Path): Path {
        if (!Files.exists(p)) {
            Files.createDirectories(p)
        }
        return p
    }

    private fun resolveLocalAppData(): String {
        return System.getenv("LOCALAPPDATA")
            ?: (System.getProperty("user.home") + "\\AppData\\Local")
    }
}
