// SPDX-License-Identifier: BUSL-1.1

// AppAttestManager.swift
// Finance

import DeviceCheck
import Foundation

/// iOS device attestation via App Attest.
actor AppAttestManager {

    enum AppAttestError: Error, Sendable {
        case notSupported
        case keyNotGenerated
        case attestationFailed(underlying: Error)
    }

    private let service = DCAppAttestService.shared
    private var keyId: String?

    var isSupported: Bool { service.isSupported }

    func attestKey(serverChallenge: Data) async throws -> Data {
        guard isSupported else { throw AppAttestError.notSupported }
        do {
            let keyId = try await service.generateKey()
            self.keyId = keyId
            return try await service.attestKey(keyId, clientDataHash: serverChallenge)
        } catch {
            throw AppAttestError.attestationFailed(underlying: error)
        }
    }

    func generateAssertion(for requestHash: Data) async throws -> Data {
        guard let keyId else { throw AppAttestError.keyNotGenerated }
        return try await service.generateAssertion(keyId, clientDataHash: requestHash)
    }
}