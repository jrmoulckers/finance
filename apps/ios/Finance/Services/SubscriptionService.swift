// SPDX-License-Identifier: BUSL-1.1

import Foundation
import os

protocol SubscriptionProviding: Sendable {
    func loadProducts() async -> [SubscriptionProductInfo]
    func purchase(productId: String) async -> PurchaseConfirmationState
    func checkEntitlement() async -> PurchaseConfirmationState
    func restorePurchases() async -> PurchaseConfirmationState
    func confirmationUpdates() async -> AsyncStream<PurchaseConfirmationState>
}

/// Coordinates native purchase evidence with Finance's entitlement authority.
///
/// Verified store evidence is submitted through an authenticated transport.
/// Transactions are finished only after Finance confirms them. Pending,
/// unavailable, and failed confirmations remain unfinished so StoreKit can
/// replay them safely.
actor SubscriptionService: SubscriptionProviding {
    static let shared = SubscriptionService()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SubscriptionService"
    )

    private let purchaseAdapter: any NativePurchaseProviding
    private let transport: any AuthenticatedEntitlementTransport
    private let context: FinanceEntitlementContext
    private var projection: FinanceEntitlementProjection = .free
    private var nextOperationGeneration: UInt64 = 0
    private var latestProjectionGeneration: UInt64 = 0
    private var updateListenerTask: Task<Void, Never>?
    private var stateContinuations:
        [UUID: AsyncStream<PurchaseConfirmationState>.Continuation] = [:]

    init(
        purchaseAdapter: any NativePurchaseProviding = StoreKitPurchaseAdapter(),
        transport: any AuthenticatedEntitlementTransport = UnavailableEntitlementTransport(),
        environment: FinanceClientEnvironment = .development
    ) {
        self.purchaseAdapter = purchaseAdapter
        self.transport = transport
        self.context = FinanceEntitlementContext(
            application: .finance,
            environment: environment
        )
    }

    deinit {
        updateListenerTask?.cancel()
    }

    func loadProducts() async -> [SubscriptionProductInfo] {
        ensureListeningForUpdates()
        let products = await purchaseAdapter.loadProducts()
        Self.logger.info("Subscription offers loaded")
        return products
    }

    func confirmationUpdates() async -> AsyncStream<PurchaseConfirmationState> {
        let id = UUID()
        let (stream, continuation) = AsyncStream.makeStream(
            of: PurchaseConfirmationState.self
        )
        stateContinuations[id] = continuation
        continuation.yield(state(.idle))
        continuation.onTermination = { [weak self] _ in
            Task {
                await self?.removeContinuation(id)
            }
        }
        return stream
    }

    func purchase(productId: String) async -> PurchaseConfirmationState {
        ensureListeningForUpdates()
        let generation = beginOperation()
        _ = publish(.pending)
        do {
            switch try await purchaseAdapter.purchase(productId: productId) {
            case .cancelled:
                Self.logger.info("Purchase cancelled")
                return publish(.cancelled)
            case .pending:
                Self.logger.info("Purchase awaiting provider completion")
                return publish(.pending)
            case .verified(let evidence):
                return await confirm(
                    evidence,
                    operation: .purchase,
                    generation: generation
                )
            }
        } catch {
            Self.logger.error("Purchase flow failed")
            return publish(.error)
        }
    }

    func checkEntitlement() async -> PurchaseConfirmationState {
        ensureListeningForUpdates()
        let generation = beginOperation()
        guard await transport.isAuthenticated() else {
            return publish(.error)
        }

        do {
            return apply(
                try await transport.fetchProjection(context),
                generation: generation
            )
        } catch {
            Self.logger.notice("Entitlement confirmation should be retried")
            return publish(.retry)
        }
    }

    func restorePurchases() async -> PurchaseConfirmationState {
        ensureListeningForUpdates()
        let generation = beginOperation()
        var latest = publish(.pending)
        do {
            let evidenceItems = try await purchaseAdapter.restoreEvidence()
            guard !evidenceItems.isEmpty else {
                return await checkEntitlement()
            }

            for evidence in evidenceItems {
                latest = await confirm(
                    evidence,
                    operation: .restore,
                    generation: generation
                )
            }
            return latest
        } catch {
            Self.logger.error("Purchase restore failed")
            return publish(.error)
        }
    }

    private enum ConfirmationOperation {
        case purchase
        case restore
    }

    private func ensureListeningForUpdates() {
        guard updateListenerTask == nil else { return }
        let purchaseAdapter = purchaseAdapter
        updateListenerTask = Task { [weak self] in
            for await evidence in purchaseAdapter.transactionUpdates() {
                guard let self else { return }
                await self.confirmUpdate(evidence)
            }
        }
    }

    private func confirmUpdate(_ evidence: VerifiedPurchaseEvidence) async {
        let generation = beginOperation()
        _ = await confirm(
            evidence,
            operation: .purchase,
            generation: generation
        )
    }

    private func removeContinuation(_ id: UUID) {
        stateContinuations.removeValue(forKey: id)
    }

    private func confirm(
        _ evidence: VerifiedPurchaseEvidence,
        operation: ConfirmationOperation,
        generation: UInt64
    ) async -> PurchaseConfirmationState {
        guard await transport.isAuthenticated() else {
            Self.logger.error("Purchase confirmation requires authentication")
            return publish(.error)
        }

        let request = FinanceEntitlementConfirmationRequest(
            context: context,
            provider: evidence.provider,
            opaqueEvidence: evidence.opaqueValue
        )

        do {
            let response: FinanceServerConfirmation
            switch operation {
            case .purchase:
                response = try await transport.confirmPurchase(request)
            case .restore:
                response = try await transport.confirmRestore(request)
            }

            let confirmationState = apply(response, generation: generation)
            if case .confirmed = response {
                await evidence.finish()
                Self.logger.info("Purchase evidence confirmed")
            }
            return confirmationState
        } catch {
            Self.logger.notice("Purchase confirmation should be retried")
            return publish(.retry)
        }
    }

    private func apply(
        _ response: FinanceServerConfirmation,
        generation: UInt64
    ) -> PurchaseConfirmationState {
        switch response {
        case .pending:
            return publish(.pending)
        case .confirmed(let confirmedProjection):
            if generation >= latestProjectionGeneration {
                latestProjectionGeneration = generation
                projection = confirmedProjection
            }
            return publish(.confirmed)
        case .error:
            return publish(.error)
        }
    }

    private func state(_ phase: PurchaseConfirmationPhase) -> PurchaseConfirmationState {
        PurchaseConfirmationState(phase: phase, projection: projection)
    }

    private func beginOperation() -> UInt64 {
        nextOperationGeneration += 1
        return nextOperationGeneration
    }

    @discardableResult
    private func publish(_ phase: PurchaseConfirmationPhase) -> PurchaseConfirmationState {
        let newState = state(phase)
        for continuation in stateContinuations.values {
            continuation.yield(newState)
        }
        return newState
    }
}

enum SubscriptionError: Error, LocalizedError, Sendable {
    case productNotFound
    case purchaseFailed
    case verificationFailed
    case confirmationUnavailable

    var errorDescription: String? {
        switch self {
        case .productNotFound:
            String(localized: "Product not found. Please try again.")
        case .purchaseFailed:
            String(localized: "Purchase failed. Please try again.")
        case .verificationFailed:
            String(localized: "Transaction could not be verified.")
        case .confirmationUnavailable:
            String(localized: "Purchase confirmation is temporarily unavailable.")
        }
    }
}
