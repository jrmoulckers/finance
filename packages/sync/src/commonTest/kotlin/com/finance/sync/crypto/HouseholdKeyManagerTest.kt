// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Tests for [HouseholdKeyManager] and [KeyRotation] (#94).
 *
 * Verifies key creation, sharing between members, and key rotation.
 */
class HouseholdKeyManagerTest {

    private val crypto = TestCryptoProvider()
    private val random = TestRandomProvider()
    private val envelope = EnvelopeEncryption(crypto, random)
    private val manager = HouseholdKeyManager(crypto, random)

    /** Simulated 32-byte key pair (in test, public == private for simplicity). */
    private val aliceKey = ByteArray(32) { (it + 10).toByte() }
    private val bobKey = ByteArray(32) { (it + 50).toByte() }

    @Test
    fun createHouseholdKeyReturnsBundle() {
        val bundle = manager.createHouseholdKey("household-1", aliceKey)

        assertEquals("household-1", bundle.householdId)
        assertEquals(HouseholdKeyManager.DEFAULT_ALGORITHM, bundle.algorithm)
        assertTrue(bundle.encryptedKek.isNotEmpty(), "Encrypted KEK must not be empty")
        assertTrue(bundle.publicKey.contentEquals(aliceKey), "Public key should be creator's key")
    }

    @Test
    fun shareAndReceiveKeyRoundTrips() {
        // Generate a KEK
        val kek = random.nextBytes(HouseholdKeyManager.KEK_LENGTH_BYTES)

        // Alice shares with Bob
        val sharedBlob = manager.shareKey(kek, bobKey)

        // Bob receives with his key (in test, public == private)
        val received = manager.receiveKey(sharedBlob, bobKey)

        assertTrue(
            kek.contentEquals(received),
            "Bob should receive the same KEK Alice shared",
        )
    }

    @Test
    fun sharedKeyDiffersFromPlaintextKek() {
        val kek = random.nextBytes(HouseholdKeyManager.KEK_LENGTH_BYTES)
        val shared = manager.shareKey(kek, bobKey)

        assertTrue(
            !kek.contentEquals(shared),
            "Shared blob should differ from plaintext KEK",
        )
    }

    @Test
    fun keyRotationGeneratesNewKek() {
        val rotation = KeyRotation(crypto, envelope, manager, random)
        val oldKek = random.nextBytes(HouseholdKeyManager.KEK_LENGTH_BYTES)

        val result = rotation.rotateHouseholdKey(
            householdId = "household-1",
            oldKek = oldKek,
            members = listOf(aliceKey, bobKey),
        )

        assertTrue(
            !oldKek.contentEquals(result.newKek),
            "New KEK should differ from old KEK",
        )
        assertEquals(2, result.memberShares.size, "Should have share for each member")
    }

    @Test
    fun rotatedKeyCanBeReceivedByAllMembers() {
        val rotation = KeyRotation(crypto, envelope, manager, random)
        val oldKek = random.nextBytes(HouseholdKeyManager.KEK_LENGTH_BYTES)

        val result = rotation.rotateHouseholdKey(
            householdId = "household-1",
            oldKek = oldKek,
            members = listOf(aliceKey, bobKey),
        )

        // Each member should be able to decrypt the new KEK
        val aliceReceived = manager.receiveKey(result.memberShares[0], aliceKey)
        val bobReceived = manager.receiveKey(result.memberShares[1], bobKey)

        assertTrue(result.newKek.contentEquals(aliceReceived), "Alice should receive new KEK")
        assertTrue(result.newKek.contentEquals(bobReceived), "Bob should receive new KEK")
    }

    @Test
    fun reEncryptDataChangesPayloads() {
        val rotation = KeyRotation(crypto, envelope, manager, random)
        val oldKek = ByteArray(32) { 0x01 }
        val newKek = ByteArray(32) { 0x02 }

        val original = listOf(
            crypto.encrypt("secret-data".encodeToByteArray(), oldKek),
        )

        val reEncrypted = rotation.reEncryptData(oldKek, newKek, original)

        // Re-encrypted ciphertext should differ
        assertTrue(
            !original[0].ciphertext.contentEquals(reEncrypted[0].ciphertext),
            "Re-encrypted ciphertext should differ",
        )

        // Decrypting with new key should recover original
        val decrypted = crypto.decrypt(reEncrypted[0], newKek)
        assertEquals("secret-data", decrypted.decodeToString())
    }

    @Test
    fun reWrapDeksPreservesUnderlyingDeks() {
        val rotation = KeyRotation(crypto, envelope, manager, random)
        val oldKek = ByteArray(32) { 0x01 }
        val newKek = ByteArray(32) { 0x02 }

        val dek = envelope.generateDEK()
        val wrappedOld = envelope.wrapDEK(dek, oldKek)

        val reWrapped = rotation.reWrapDeks(oldKek, newKek, listOf(wrappedOld))

        // Unwrap with new KEK should yield original DEK
        val unwrapped = envelope.unwrapDEK(reWrapped[0], newKek)
        assertTrue(
            dek.contentEquals(unwrapped),
            "Re-wrapped DEK should unwrap to original",
        )
    }

    // =========================================================================
    // Receiving key with wrong private key
    // =========================================================================

    @Test
    fun receiveKeyWithWrongPrivateKeyProducesGarbage() {
        val kek = random.nextBytes(HouseholdKeyManager.KEK_LENGTH_BYTES)
        val shared = manager.shareKey(kek, bobKey)

        // Try to receive with Alice's key instead of Bob's
        val wrongReceived = manager.receiveKey(shared, aliceKey)
        assertTrue(
            !kek.contentEquals(wrongReceived),
            "Receiving with wrong key should not produce original KEK",
        )
    }

    @Test
    fun receiveKeyWithCorrectKeyAfterWrongKeyStillWorks() {
        val kek = random.nextBytes(HouseholdKeyManager.KEK_LENGTH_BYTES)
        val shared = manager.shareKey(kek, bobKey)

        // Wrong key first
        val wrongResult = manager.receiveKey(shared, aliceKey)
        assertTrue(!kek.contentEquals(wrongResult))

        // Correct key still works
        val correctResult = manager.receiveKey(shared, bobKey)
        assertTrue(kek.contentEquals(correctResult), "Correct key should still work")
    }

    // =========================================================================
    // receiveKey input validation
    // =========================================================================

    @Test
    fun receiveKeyRejectsTooShortInput() {
        // Encrypted KEK must be longer than NONCE_LENGTH (12 bytes)
        val tooShort = ByteArray(HouseholdKeyManager.NONCE_LENGTH)
        assertFailsWith<IllegalArgumentException> {
            manager.receiveKey(tooShort, bobKey)
        }
    }

    // =========================================================================
    // Multiple members
    // =========================================================================

    @Test
    fun shareKeyToMultipleMembersProducesUniqueShares() {
        val kek = random.nextBytes(HouseholdKeyManager.KEK_LENGTH_BYTES)
        val charlieKey = ByteArray(32) { (it + 90).toByte() }

        val shareAlice = manager.shareKey(kek, aliceKey)
        val shareBob = manager.shareKey(kek, bobKey)
        val shareCharlie = manager.shareKey(kek, charlieKey)

        // Each share should be different (encrypted to different keys)
        assertTrue(!shareAlice.contentEquals(shareBob), "Alice and Bob shares should differ")
        assertTrue(!shareBob.contentEquals(shareCharlie), "Bob and Charlie shares should differ")

        // But each member can recover the same KEK
        val aliceKek = manager.receiveKey(shareAlice, aliceKey)
        val bobKek = manager.receiveKey(shareBob, bobKey)
        val charlieKek = manager.receiveKey(shareCharlie, charlieKey)

        assertTrue(kek.contentEquals(aliceKek), "Alice should receive correct KEK")
        assertTrue(kek.contentEquals(bobKek), "Bob should receive correct KEK")
        assertTrue(kek.contentEquals(charlieKek), "Charlie should receive correct KEK")
    }

    // =========================================================================
    // Key rotation edge cases
    // =========================================================================

    @Test
    fun keyRotationRequiresAtLeastOneMember() {
        val rotation = KeyRotation(crypto, envelope, manager, random)
        val oldKek = random.nextBytes(HouseholdKeyManager.KEK_LENGTH_BYTES)

        assertFailsWith<IllegalArgumentException> {
            rotation.rotateHouseholdKey(
                householdId = "household-1",
                oldKek = oldKek,
                members = emptyList(),
            )
        }
    }

    @Test
    fun keyRotationBundleHasCorrectHouseholdId() {
        val rotation = KeyRotation(crypto, envelope, manager, random)
        val oldKek = random.nextBytes(HouseholdKeyManager.KEK_LENGTH_BYTES)

        val result = rotation.rotateHouseholdKey(
            householdId = "household-xyz",
            oldKek = oldKek,
            members = listOf(aliceKey),
        )

        assertEquals("household-xyz", result.bundle.householdId)
        assertEquals(HouseholdKeyManager.DEFAULT_ALGORITHM, result.bundle.algorithm)
    }

    @Test
    fun keyRotationNewKekIs32Bytes() {
        val rotation = KeyRotation(crypto, envelope, manager, random)
        val oldKek = random.nextBytes(HouseholdKeyManager.KEK_LENGTH_BYTES)

        val result = rotation.rotateHouseholdKey(
            householdId = "household-1",
            oldKek = oldKek,
            members = listOf(aliceKey),
        )

        assertEquals(
            HouseholdKeyManager.KEK_LENGTH_BYTES,
            result.newKek.size,
            "New KEK should be 32 bytes",
        )
    }

    @Test
    fun reWrapMultipleDeksPreservesAll() {
        val rotation = KeyRotation(crypto, envelope, manager, random)
        val oldKek = ByteArray(32) { 0x01 }
        val newKek = ByteArray(32) { 0x02 }

        // Generate and wrap 5 DEKs
        val deks = List(5) { envelope.generateDEK() }
        val wrappedOld = deks.map { envelope.wrapDEK(it, oldKek) }

        val reWrapped = rotation.reWrapDeks(oldKek, newKek, wrappedOld)

        assertEquals(5, reWrapped.size, "Should re-wrap all 5 DEKs")

        // Each re-wrapped DEK should unwrap to its original
        for (i in deks.indices) {
            val unwrapped = envelope.unwrapDEK(reWrapped[i], newKek)
            assertTrue(
                deks[i].contentEquals(unwrapped),
                "DEK $i should be recoverable after re-wrap",
            )
        }
    }

    @Test
    fun reEncryptDataMultiplePayloadsRoundTrips() {
        val rotation = KeyRotation(crypto, envelope, manager, random)
        val oldKek = ByteArray(32) { 0x01 }
        val newKek = ByteArray(32) { 0x02 }

        val plaintexts = listOf("secret-1", "secret-2", "secret-3")
        val originals = plaintexts.map {
            crypto.encrypt(it.encodeToByteArray(), oldKek)
        }

        val reEncrypted = rotation.reEncryptData(oldKek, newKek, originals)

        assertEquals(3, reEncrypted.size)
        for (i in plaintexts.indices) {
            val decrypted = crypto.decrypt(reEncrypted[i], newKek)
            assertEquals(
                plaintexts[i],
                decrypted.decodeToString(),
                "Payload $i should decrypt to original after re-encrypt",
            )
        }
    }

    // =========================================================================
    // createHouseholdKey bundle structure
    // =========================================================================

    @Test
    fun createHouseholdKeyBundleAlgorithmIsCorrect() {
        val bundle = manager.createHouseholdKey("hh-test", aliceKey)
        assertEquals(HouseholdKeyManager.DEFAULT_ALGORITHM, bundle.algorithm)
    }

    @Test
    fun createHouseholdKeyEncryptedKekIsNotPlaintextKek() {
        // The encrypted KEK should not be the raw KEK bytes
        val bundle = manager.createHouseholdKey("hh-test", aliceKey)

        // While we can't directly access the plaintext KEK (it's generated internally),
        // we can verify the encrypted KEK is not empty and has reasonable size
        assertTrue(
            bundle.encryptedKek.size > HouseholdKeyManager.KEK_LENGTH_BYTES,
            "Encrypted KEK should be larger than raw KEK (includes nonce)",
        )
    }

    @Test
    fun householdKeyBundleEqualityByContent() {
        val bundle1 = HouseholdKeyBundle(
            householdId = "hh-1",
            encryptedKek = byteArrayOf(1, 2, 3),
            publicKey = byteArrayOf(4, 5, 6),
            algorithm = "X25519+AES-256-GCM",
        )
        val bundle2 = HouseholdKeyBundle(
            householdId = "hh-1",
            encryptedKek = byteArrayOf(1, 2, 3),
            publicKey = byteArrayOf(4, 5, 6),
            algorithm = "X25519+AES-256-GCM",
        )

        assertEquals(bundle1, bundle2, "Bundles with same content should be equal")
        assertEquals(bundle1.hashCode(), bundle2.hashCode())
    }
}