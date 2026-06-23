// SPDX-License-Identifier: BUSL-1.1

// FinanceQuerySpeech.swift
// Finance
//
// Protocol seams that decouple natural-language finance queries (#2386) from
// the Speech framework and speech synthesis. The parser, planner, and
// ``FinanceQueryViewModel`` depend only on these protocols, so the entire query
// pipeline is unit-testable without microphone, Speech entitlements, or device
// hardware.

import AVFoundation
import Foundation
import os

// MARK: - Speech Recognition Seam

/// Provides spoken-input transcription for the query screen.
///
/// The live implementation is intentionally **not** wired up here because it
/// requires the Speech capability, the microphone entitlement, and
/// `NSSpeechRecognitionUsageDescription` / `NSMicrophoneUsageDescription`
/// Info.plist keys that can only be added in Xcode.
protocol FinanceQuerySpeechRecognizer: Sendable {
    /// Whether transcription is currently available (authorised + capable).
    var isAvailable: Bool { get }

    /// Transcribes a single spoken utterance to text.
    func transcribe() async throws -> String
}

/// Errors surfaced by a speech recognizer.
enum FinanceQuerySpeechError: Error, Equatable {
    case unavailable
    case notAuthorized
    case noSpeechDetected
}

/// Default recognizer used until the on-device Speech pipeline is wired up.
///
/// Always reports `isAvailable == false`, allowing the UI to gracefully disable
/// the microphone affordance and fall back to typed input.
struct UnavailableSpeechRecognizer: FinanceQuerySpeechRecognizer {
    var isAvailable: Bool { false }

    func transcribe() async throws -> String {
        throw FinanceQuerySpeechError.unavailable
    }
}

// TODO(human): Provide a live `FinanceQuerySpeechRecognizer` backed by
// `SFSpeechRecognizer` + `AVAudioEngine` with on-device
// (`requiresOnDeviceRecognition = true`) transcription. This requires Xcode
// project changes (Speech capability, microphone entitlement, and the
// `NSSpeechRecognitionUsageDescription` / `NSMicrophoneUsageDescription`
// Info.plist usage strings) that cannot be made from this environment.

// MARK: - Voice Output Seam

/// Speaks a query answer aloud. Kept behind a protocol so tests can assert what
/// would be spoken without invoking the audio system.
protocol FinanceQueryVoiceOutput: Sendable {
    /// Whether speech synthesis is available on this platform.
    var isAvailable: Bool { get }

    /// Speaks `text` aloud.
    func speak(_ text: String)

    /// Stops any in-progress utterance.
    func stop()
}

/// Concrete voice output backed by `AVSpeechSynthesizer`.
///
/// Speech **synthesis** needs no special entitlement, so this is safe to ship.
/// Callers remain responsible for gating sensitive content (balances) behind
/// explicit confirmation before invoking ``speak(_:)``.
final class SystemVoiceOutput: FinanceQueryVoiceOutput, @unchecked Sendable {
    private let synthesizer = AVSpeechSynthesizer()
    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "FinanceQueryVoice"
    )

    var isAvailable: Bool { true }

    func speak(_ text: String) {
        guard !text.isEmpty else { return }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: Locale.current.identifier)
        logger.info("Speaking query result aloud")
        synthesizer.speak(utterance)
    }

    func stop() {
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
    }
}

/// No-op voice output for tests and previews. Records the last spoken text.
final class SilentVoiceOutput: FinanceQueryVoiceOutput, @unchecked Sendable {
    private(set) var spokenText: [String] = []
    var isAvailable: Bool { true }

    func speak(_ text: String) { spokenText.append(text) }
    func stop() {}
}
