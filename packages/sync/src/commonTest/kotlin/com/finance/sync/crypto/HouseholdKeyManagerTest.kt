package com.finance.sync.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
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
}