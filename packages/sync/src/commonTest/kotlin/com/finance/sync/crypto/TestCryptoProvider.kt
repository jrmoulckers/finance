package com.finance.sync.crypto

/**
 * Test-only crypto provider that uses a simple XOR cipher.
 *
 * This is intentionally NOT secure -- it exists solely to exercise the
 * encryption interfaces in unit tests without depending on platform crypto.
 * Every method is deterministic given the same inputs, making assertions easy.
 *
 * The "nonce" is a fixed-length random byte array stored alongside the ciphertext
 * to validate round-trip nonce handling. The XOR cipher XORs plaintext with the
 * key (repeating the key as needed).
 */
class TestCryptoProvider(
    private val nonceLength: Int = 12,
) : EncryptionService {

    /** Counter used to generate unique (but predictable) nonces in tests. */
    private var nonceCounter: Int = 0

    override fun encrypt(plaintext: ByteArray, key: ByteArray): EncryptedPayload {
        require(key.isNotEmpty()) { "Key must not be empty" }
        val nonce = generateTestNonce()
        val ciphertext = xor(plaintext, key)
        return EncryptedPayload(
            ciphertext = ciphertext,
            nonce = nonce,
            algorithm = "TEST-XOR",
        )
    }

    override fun decrypt(payload: EncryptedPayload, key: ByteArray): ByteArray {
        require(key.isNotEmpty()) { "Key must not be empty" }
        return xor(payload.ciphertext, key)
    }

    /**
     * Generate a deterministic nonce for testing.
     * Each call produces a unique nonce within the same test run.
     */
    private fun generateTestNonce(): ByteArray {
        val counter = nonceCounter++
        return ByteArray(nonceLength) { i ->
            (counter xor i).toByte()
        }
    }

    companion object {
        /** XOR [data] with [key], repeating the key as needed. */
        fun xor(data: ByteArray, key: ByteArray): ByteArray =
            ByteArray(data.size) { i ->
                (data[i].toInt() xor key[i % key.size].toInt()).toByte()
            }
    }
}

/**
 * Test-only [RandomProvider] that returns predictable bytes.
 *
 * Uses a simple counter-based scheme so that tests are deterministic
 * while still producing distinct byte arrays on each call.
 */
class TestRandomProvider(private var seed: Int = 42) : RandomProvider {
    override fun nextBytes(size: Int): ByteArray {
        val current = seed
        seed += size
        return ByteArray(size) { i -> ((current + i) and 0xFF).toByte() }
    }
}

/**
 * Test-only [KeyStore] backed by in-memory maps.
 */
class TestKeyStore : KeyStore {
    private val householdKeys = mutableMapOf<String, MutableList<String>>()
    private val userKeys = mutableMapOf<String, MutableList<String>>()

    /** Register a key fingerprint for a household (test setup helper). */
    fun addHouseholdKey(householdId: String, fingerprint: String) {
        householdKeys.getOrPut(householdId) { mutableListOf() }.add(fingerprint)
    }

    /** Register a key fingerprint for a user (test setup helper). */
    fun addUserKey(userId: String, fingerprint: String) {
        userKeys.getOrPut(userId) { mutableListOf() }.add(fingerprint)
    }

    override fun destroyHouseholdKeys(householdId: String): List<String> {
        return householdKeys.remove(householdId) ?: emptyList()
    }

    override fun destroyUserKeys(userId: String): List<String> {
        return userKeys.remove(userId) ?: emptyList()
    }

    override fun hasKeysForHousehold(householdId: String): Boolean =
        householdKeys.containsKey(householdId) && householdKeys[householdId]!!.isNotEmpty()

    override fun hasKeysForUser(userId: String): Boolean =
        userKeys.containsKey(userId) && userKeys[userId]!!.isNotEmpty()
}