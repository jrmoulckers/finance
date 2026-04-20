// SPDX-License-Identifier: BUSL-1.1

// BiometricCryptoManager.swift
// Finance
//
// Cryptographic biometric binding via Secure Enclave (#333).

import Foundation
import LocalAuthentication
import Security

/// Binds biometric authentication to Secure Enclave key operations.
///
/// Creates an EC P-256 key pair in the Secure Enclave with
/// `.biometryCurrentSet` access control. The private key can only
/// be used after successful biometric authentication, and is
/// invalidated if biometric enrollment changes.
///
/// This prevents:
/// - Callback hooking (Frida/Substrate) — the crypto operation requires
///   actual hardware biometric verification
/// - Biometric template replacement — `.biometryCurrentSet` invalidates
///   the key if a new face/fingerprint is enrolled
actor BiometricCryptoManager {

    enum CryptoError: Error, Sendable {
        case secureEnclaveNotAvailable
        case keyGenerationFailed(underlying: Error)
        case signingFailed(underlying: Error)
        case keyNotFound
    }

    private let keyTag = ""com.finance.biometric-bound"".data(using: .utf8)!

    /// Whether Secure Enclave is available for biometric binding.
    nonisolated var isAvailable: Bool {
        var error: Unmanaged<CFError>?
        let accessControl = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage, .biometryCurrentSet],
            &error
        )
        return accessControl != nil && error == nil
    }

    /// Generate a biometric-bound key pair in the Secure Enclave.
    ///
    /// - Returns: The public key data for server-side registration.
    func getOrCreateKeyPair() throws -> Data {
        // Check for existing key
        if let existingPublicKey = loadPublicKey() {
            return existingPublicKey
        }

        guard isAvailable else {
            throw CryptoError.secureEnclaveNotAvailable
        }

        var error: Unmanaged<CFError>?
        guard let accessControl = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage, .biometryCurrentSet],
            &error
        ) else {
            throw CryptoError.keyGenerationFailed(
                underlying: error!.takeRetainedValue() as Error
            )
        }

        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: keyTag,
                kSecAttrAccessControl as String: accessControl,
            ] as [String: Any],
        ]

        var genError: Unmanaged<CFError>?
        guard let privateKey = SecKeyCreateRandomKey(
            attributes as CFDictionary, &genError
        ) else {
            throw CryptoError.keyGenerationFailed(
                underlying: genError!.takeRetainedValue() as Error
            )
        }

        guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
            throw CryptoError.keyGenerationFailed(
                underlying: NSError(
                    domain: ""BiometricCrypto"",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: ""Failed to extract public key""]
                )
            )
        }

        guard let publicKeyData = SecKeyCopyExternalRepresentation(
            publicKey, nil
        ) as Data? else {
            throw CryptoError.keyGenerationFailed(
                underlying: NSError(
                    domain: ""BiometricCrypto"",
                    code: -2,
                    userInfo: [NSLocalizedDescriptionKey: ""Failed to export public key""]
                )
            )
        }

        return publicKeyData
    }

    /// Sign a challenge with the biometric-bound private key.
    ///
    /// This triggers the system biometric prompt. The operation only
    /// succeeds after successful Face ID / Touch ID verification.
    ///
    /// - Parameter challenge: Server-generated nonce to sign.
    /// - Returns: The ECDSA signature bytes.
    func signWithBiometric(challenge: Data) throws -> Data {
        guard let privateKey = loadPrivateKey() else {
            throw CryptoError.keyNotFound
        }

        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
            privateKey,
            .ecdsaSignatureMessageX962SHA256,
            challenge as CFData,
            &error
        ) else {
            throw CryptoError.signingFailed(
                underlying: error!.takeRetainedValue() as Error
            )
        }

        return signature as Data
    }

    // MARK: - Private Helpers

    private func loadPublicKey() -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: keyTag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let key = item else { return nil }
        let privateKey = key as! SecKey // swiftlint:disable:this force_cast
        guard let publicKey = SecKeyCopyPublicKey(privateKey) else { return nil }
        return SecKeyCopyExternalRepresentation(publicKey, nil) as Data?
    }

    private func loadPrivateKey() -> SecKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: keyTag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else { return nil }
        return (item as! SecKey) // swiftlint:disable:this force_cast
    }
}