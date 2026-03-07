// HapticManager.swift
// Finance
//
// Core Haptics wrapper that provides tactile feedback for key
// financial events. Respects the system haptic-settings toggle.
// References: #29

import CoreHaptics
import SwiftUI
import UIKit

// MARK: - HapticManager

/// Centralised haptic feedback controller for the Finance app.
///
/// `HapticManager` is an `@Observable` singleton backed by a
/// `CHHapticEngine`. It exposes high-level methods for the four
/// canonical financial events and handles engine lifecycle
/// (start, stop, reset-on-server-error) transparently.
///
/// > Important: All public methods are no-ops when the device does
/// > not support haptics (`CHHapticEngine.capabilitiesForHardware()
/// > .supportsHaptics == false`).
@Observable
@MainActor
final class HapticManager {

    // MARK: Singleton

    /// Shared instance. Use this from SwiftUI views via
    /// `@Environment` or direct reference.
    static let shared = HapticManager()

    // MARK: - Private State

    /// The Core Haptics engine; `nil` on devices without a Taptic Engine.
    private var engine: CHHapticEngine?

    /// Whether the current hardware supports Core Haptics.
    private let supportsHaptics: Bool

    // MARK: - Init

    private init() {
        let capabilities = CHHapticEngine.capabilitiesForHardware()
        self.supportsHaptics = capabilities.supportsHaptics

        guard supportsHaptics else { return }

        do {
            let engine = try CHHapticEngine()
            configureEngine(engine)
            self.engine = engine
        } catch {
            assertionFailure("HapticManager: failed to create engine – \(error.localizedDescription)")
        }
    }

    // MARK: - Public API

    /// Light success tap — played after a transaction is saved.
    func transactionSaved() {
        playNotification(type: .success)
    }

    /// Warning pattern — played when spending crosses a budget threshold.
    ///
    /// Uses a custom Core Haptics pattern:
    /// two short transient taps followed by a brief continuous buzz.
    func budgetThreshold() {
        guard supportsHaptics else { return }

        let events: [CHHapticEvent] = [
            // Tap 1
            CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.6),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)
                ],
                relativeTime: 0
            ),
            // Tap 2
            CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.8),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.6)
                ],
                relativeTime: 0.12
            ),
            // Sustained buzz
            CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.5),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3)
                ],
                relativeTime: 0.3,
                duration: 0.25
            )
        ]

        playPattern(events: events)
    }

    /// Heavy impact followed by a success notification — played when
    /// the user reaches a savings-goal milestone.
    func goalMilestone() {
        guard supportsHaptics else { return }

        let events: [CHHapticEvent] = [
            // Heavy impact
            CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.4)
                ],
                relativeTime: 0
            ),
            // Brief pause, then celebratory double-tap
            CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.7),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.8)
                ],
                relativeTime: 0.2
            ),
            CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.9),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.9)
                ],
                relativeTime: 0.35
            )
        ]

        playPattern(events: events)
    }

    /// Error notification — played on failed operations such as a
    /// network error or validation failure.
    func error() {
        playNotification(type: .error)
    }

    // MARK: - Engine Lifecycle

    /// Prepares the engine so the first haptic plays without latency.
    /// Call this from the app's `onAppear` or scene-phase handler.
    func prepare() {
        guard supportsHaptics else { return }
        startEngine()
    }

    /// Tears down the engine. Call when the app enters the background
    /// or is no longer visible to conserve resources.
    func tearDown() {
        engine?.stop(completionHandler: { _ in })
    }

    // MARK: - Private Helpers

    /// Configures auto-restart handlers on the engine.
    private func configureEngine(_ engine: CHHapticEngine) {
        // The engine may be stopped by the system (e.g. app backgrounded).
        // Auto-restart when it resets.
        engine.resetHandler = { [weak self] in
            Task { @MainActor in
                self?.startEngine()
            }
        }

        engine.stoppedHandler = { reason in
            // Log the reason in debug builds; no user-facing impact.
            #if DEBUG
            print("HapticManager: engine stopped – reason \(reason.rawValue)")
            #endif
        }

        // Allow haptics to play even when the system audio session is
        // active (e.g. user is listening to music).
        engine.playsHapticsOnly = true
    }

    /// Starts (or restarts) the haptic engine.
    private func startEngine() {
        do {
            try engine?.start()
        } catch {
            #if DEBUG
            print("HapticManager: engine start failed – \(error.localizedDescription)")
            #endif
        }
    }

    /// Plays a `UINotificationFeedbackGenerator` haptic.
    ///
    /// Falls back to `UINotificationFeedbackGenerator` so the call
    /// respects the system-wide "System Haptics" toggle in
    /// Settings → Sounds & Haptics.
    private func playNotification(type: UINotificationFeedbackGenerator.FeedbackType) {
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(type)
    }

    /// Plays an arbitrary `CHHapticEvent` pattern through the engine.
    private func playPattern(events: [CHHapticEvent]) {
        guard let engine else { return }

        do {
            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            #if DEBUG
            print("HapticManager: pattern playback failed – \(error.localizedDescription)")
            #endif
        }
    }
}
