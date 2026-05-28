// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.storage

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.createDirectories
import kotlin.io.path.exists
import kotlin.io.path.readText
import kotlin.io.path.writeText
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for [UserDataPaths.migrateLegacyDataIfNeeded].
 *
 * Each test runs against a fresh temp directory standing in for `%LOCALAPPDATA%`,
 * with a synthetic `Finance/` (legacy) and `FinanceUserData/` (new) layout
 * that we manipulate to exercise each branch.
 */
class UserDataPathsMigrationTest {

    private lateinit var fakeLocalAppData: Path

    private val legacyRoot get() = fakeLocalAppData.resolve("Finance")
    private val newRoot get() = fakeLocalAppData.resolve("FinanceUserData")

    @BeforeTest
    fun setUp() {
        fakeLocalAppData = Files.createTempDirectory("user-data-paths-test-")
    }

    @AfterTest
    fun tearDown() {
        if (Files.exists(fakeLocalAppData)) {
            Files.walk(fakeLocalAppData)
                .sorted(Comparator.reverseOrder())
                .forEach { Files.deleteIfExists(it) }
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────

    private fun writeFile(p: Path, content: String) {
        p.parent.createDirectories()
        p.writeText(content)
    }

    private fun migrate(): Boolean =
        UserDataPaths.migrateLegacyDataIfNeeded(fakeLocalAppData.toString())

    // ── Tests ──────────────────────────────────────────────────────────

    @Test
    fun `fresh install with no legacy data is a no-op`() {
        val moved = migrate()

        assertFalse(moved, "Nothing should be moved on a fresh install")
        assertFalse(newRoot.exists(), "New root should not be eagerly created by migration")
    }

    @Test
    fun `legacy root with no subdirs is a no-op`() {
        legacyRoot.createDirectories()

        val moved = migrate()

        assertFalse(moved)
        assertFalse(newRoot.exists())
    }

    @Test
    fun `legacy data subdir is moved into the new root`() {
        writeFile(legacyRoot.resolve("data/finance.db"), "db-bytes")
        writeFile(legacyRoot.resolve("security/db_encryption_key.enc"), "key-bytes")
        writeFile(legacyRoot.resolve("settings/app_settings.enc"), "settings-bytes")

        val moved = migrate()

        assertTrue(moved, "Migration should report moving at least one item")
        assertEquals("db-bytes", newRoot.resolve("data/finance.db").readText())
        assertEquals("key-bytes", newRoot.resolve("security/db_encryption_key.enc").readText())
        assertEquals("settings-bytes", newRoot.resolve("settings/app_settings.enc").readText())

        // Legacy subdirs are removed; the legacy root itself is left in place
        // (it may still contain MSI install files we must not touch).
        assertFalse(legacyRoot.resolve("data").exists(), "Legacy data dir should be gone")
        assertFalse(legacyRoot.resolve("security").exists(), "Legacy security dir should be gone")
        assertFalse(legacyRoot.resolve("settings").exists(), "Legacy settings dir should be gone")
        assertTrue(legacyRoot.exists(), "Legacy root must NOT be deleted (MSI install root)")
    }

    @Test
    fun `legacy gdpr consent file is moved into the new root`() {
        writeFile(legacyRoot.resolve("gdpr_consent.json"), """{"requiredConsent":true}""")

        val moved = migrate()

        assertTrue(moved)
        assertEquals(
            """{"requiredConsent":true}""",
            newRoot.resolve("gdpr_consent.json").readText(),
        )
        assertFalse(legacyRoot.resolve("gdpr_consent.json").exists())
    }

    @Test
    fun `both legacy and new data with content - new wins and legacy is preserved`() {
        writeFile(legacyRoot.resolve("data/finance.db"), "OLD")
        writeFile(newRoot.resolve("data/finance.db"), "NEW")

        val moved = migrate()

        assertFalse(moved, "Conflict means nothing was moved")
        assertEquals("NEW", newRoot.resolve("data/finance.db").readText())
        assertEquals("OLD", legacyRoot.resolve("data/finance.db").readText())
    }

    @Test
    fun `existing empty new subdir does not block migration`() {
        writeFile(legacyRoot.resolve("data/finance.db"), "OLD")
        newRoot.resolve("data").createDirectories() // empty

        val moved = migrate()

        assertTrue(moved)
        assertEquals("OLD", newRoot.resolve("data/finance.db").readText())
        assertFalse(legacyRoot.resolve("data").exists())
    }

    @Test
    fun `existing new gdpr consent file blocks migration of legacy file`() {
        writeFile(legacyRoot.resolve("gdpr_consent.json"), "OLD")
        writeFile(newRoot.resolve("gdpr_consent.json"), "NEW")

        val moved = migrate()

        assertFalse(moved)
        assertEquals("NEW", newRoot.resolve("gdpr_consent.json").readText())
        assertEquals("OLD", legacyRoot.resolve("gdpr_consent.json").readText())
    }

    @Test
    fun `migration is idempotent - second call is a no-op`() {
        writeFile(legacyRoot.resolve("data/finance.db"), "db-bytes")
        writeFile(legacyRoot.resolve("gdpr_consent.json"), "consent")

        assertTrue(migrate(), "First call should report a migration")
        assertFalse(migrate(), "Second call should report nothing to do")

        assertEquals("db-bytes", newRoot.resolve("data/finance.db").readText())
        assertEquals("consent", newRoot.resolve("gdpr_consent.json").readText())
    }

    @Test
    fun `only the three known subdirs and the consent file are migrated`() {
        writeFile(legacyRoot.resolve("data/finance.db"), "db")
        writeFile(legacyRoot.resolve("security/db_encryption_key.enc"), "key")
        writeFile(legacyRoot.resolve("settings/app_settings.enc"), "settings")
        writeFile(legacyRoot.resolve("gdpr_consent.json"), "consent")

        // Files that look like MSI install artefacts — must NOT be touched.
        writeFile(legacyRoot.resolve("Finance.exe"), "binary")
        writeFile(legacyRoot.resolve("runtime/release"), "jre-info")
        writeFile(legacyRoot.resolve("app/Finance.cfg"), "cfg")

        val moved = migrate()

        assertTrue(moved)

        // User data: migrated
        assertTrue(newRoot.resolve("data/finance.db").exists())
        assertTrue(newRoot.resolve("security/db_encryption_key.enc").exists())
        assertTrue(newRoot.resolve("settings/app_settings.enc").exists())
        assertTrue(newRoot.resolve("gdpr_consent.json").exists())

        // MSI install artefacts: left strictly alone
        assertTrue(
            legacyRoot.resolve("Finance.exe").exists(),
            "MSI Finance.exe must not be touched",
        )
        assertTrue(
            legacyRoot.resolve("runtime/release").exists(),
            "MSI runtime/ tree must not be touched",
        )
        assertTrue(
            legacyRoot.resolve("app/Finance.cfg").exists(),
            "MSI app/ tree must not be touched",
        )
        assertFalse(
            newRoot.resolve("Finance.exe").exists(),
            "MSI Finance.exe must not be copied to new root",
        )
        assertFalse(
            newRoot.resolve("runtime").exists(),
            "MSI runtime/ must not be copied to new root",
        )
        assertFalse(
            newRoot.resolve("app").exists(),
            "MSI app/ must not be copied to new root",
        )
    }

    @Test
    fun `migration preserves nested directory structure`() {
        writeFile(legacyRoot.resolve("data/finance.db"), "main")
        writeFile(legacyRoot.resolve("data/backups/2025-01-15.db"), "backup")
        writeFile(legacyRoot.resolve("data/.wal/finance.db-wal"), "wal")

        val moved = migrate()

        assertTrue(moved)
        assertEquals("main", newRoot.resolve("data/finance.db").readText())
        assertEquals("backup", newRoot.resolve("data/backups/2025-01-15.db").readText())
        assertEquals("wal", newRoot.resolve("data/.wal/finance.db-wal").readText())
        assertFalse(legacyRoot.resolve("data").exists())
    }

    @Test
    fun `partial migration - one subdir already at new and one still at legacy`() {
        // Settings already migrated previously; user re-installs and adds a fresh DB.
        writeFile(legacyRoot.resolve("data/finance.db"), "fresh-db")
        writeFile(newRoot.resolve("settings/app_settings.enc"), "existing-settings")

        val moved = migrate()

        assertTrue(moved, "Data should still migrate even though settings already exists")
        assertEquals("fresh-db", newRoot.resolve("data/finance.db").readText())
        assertEquals("existing-settings", newRoot.resolve("settings/app_settings.enc").readText())
        assertFalse(legacyRoot.resolve("data").exists())
    }
}
