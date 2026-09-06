// SPDX-License-Identifier: BUSL-1.1

import Foundation
import os

/// A purchase or restore operation and its Finance confirmation phase.
///
/// It deliberately carries no entitlement: what the user may see comes from
/// the minimized projection through ``EntitlementStore``.
struct PurchaseConfirmationState: Sendable, Equatable {
    let phase: PurchaseConfirmationPhase

    static let idle = PurchaseConfirmationState(phase: .idle)
}

protocol SubscriptionProviding: Sendable {
    func loadProducts() async -> [SubscriptionProductInfo]
    func purchase(productId: String) async -> PurchaseConfirmationState
    func restorePurchases() async -> PurchaseConfirmationState
    func confirmationUpdates() async -> AsyncStream<PurchaseConfirmationState>
    /// Bind the projection reader that display follows after a confirmation.
    func attachEntitlementRefresher(_ refresher: any EntitlementRefreshing) async
}

/// Called after Finance records an operation so display can re-read the
/// server projection instead of trusting the confirmation response.
protocol EntitlementRefreshing: Sendable {
    func refreshEntitlement() async
}

/// Coordinates native purchase evidence with Finance's entitlement authority.
///
/// Verified store evidence triggers an authenticated confirmation but is never
/// sent to Finance. Transactions are finished only after Finance confirms
/// them. Pending, unavailable, and failed confirmations remain unfinished so
/// StoreKit can replay them safely.
///
/// The service never holds a tier: it reports operation phases and asks the
/// entitlement store to re-read `entitlements-v1`.
actor SubscriptionService: SubscriptionProviding {
    static let shared: SubscriptionService = {
        guard let configuration = RevenueCatEntitlementConfiguration.bundled() else {
            return SubscriptionService()
        }
        let identityProvider = KeychainEntitlementIdentityProvider()
        return SubscriptionService(
            transport: RevenueCatEntitlementTransport(
                supabaseURL: configuration.supabaseURL,
                tokenProvider: KeychainEntitlementAccessTokenProvider()
            ),
            eligibleHouseholdProvider: identityProvider,
            appId: configuration.appId,
            environment: configuration.environment
        )
    }()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SubscriptionService"
    )

    private let purchaseAdapter: any NativePurchaseProviding
    private let transport: any AuthenticatedEntitlementTransport
    private let eligibleHouseholdProvider: any EligibleHouseholdProviding
    private var entitlementRefresher: (any EntitlementRefreshing)?
    private let context: FinanceEntitlementContext
    private var updateListenerTask: Task<Void, Never>?
    private var stateContinuations:
        [UUID: AsyncStream<PurchaseConfirmationState>.Continuation] = [:]

    init(
        purchaseAdapter: any NativePurchaseProviding = StoreKitPurchaseAdapter(),
        transport: any AuthenticatedEntitlementTransport = UnavailableEntitlementTransport(),
        eligibleHouseholdProvider: any EligibleHouseholdProviding = NoEligibleHouseholdProvider(),
        entitlementRefresher: (any EntitlementRefreshing)? = nil,
        appId: String = "YOUR_REVENUECAT_APP_ID",
        environment: FinanceBillingEnvironment = .sandbox
    ) {
        self.purchaseAdapter = purchaseAdapter
        self.transport = transport
        self.eligibleHouseholdProvider = eligibleHouseholdProvider
        self.entitlementRefresher = entitlementRefresher
        self.context = FinanceEntitlementContext(
            appId: appId,
            environment: environment
        )
    }

    deinit {
        updateListenerTask?.cancel()
    }

    func attachEntitlementRefresher(_ refresher: any EntitlementRefreshing) {
        entitlementRefresher = refresher
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
        continuation.yield(.idle)
        continuation.onTermination = { [weak self] _ in
            Task {
                await self?.removeContinuation(id)
            }
        }
        return stream
    }

    func purchase(productId: String) async -> PurchaseConfirmationState {
        ensureListeningForUpdates()
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
                return await confirm([evidence], operation: .confirm)
            }
        } catch {
            Self.logger.error("Purchase flow failed")
            return publish(.error)
        }
    }

    func restorePurchases() async -> PurchaseConfirmationState {
        ensureListeningForUpdates()
        _ = publish(.pending)
        do {
            let evidenceItems = try await purchaseAdapter.restoreEvidence()
            return await confirm(evidenceItems, operation: .restore)
        } catch {
            Self.logger.error("Purchase restore failed")
            return publish(.error)
        }
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
        _ = await confirm([evidence], operation: .confirm)
    }

    private func removeContinuation(_ id: UUID) {
        stateContinuations.removeValue(forKey: id)
    }

    private func confirm(
        _ evidenceItems: [VerifiedPurchaseEvidence],
        operation: RevenueCatConfirmationOperation
    ) async -> PurchaseConfirmationState {
        guard await transport.isAuthenticated() else {
            Self.logger.error("Purchase confirmation requires authentication")
            return publish(.error)
        }

        let eligibleHousehold = await eligibleHouseholdProvider.currentEligibleHousehold()
        let request = FinanceEntitlementConfirmationRequest(
            operation: operation,
            context: context,
            eligibleHousehold: eligibleHousehold
        )

        do {
            let response = try await transport.confirm(request)
            if response == .confirmed {
                for evidence in evidenceItems {
                    await evidence.finish()
                }
                Self.logger.info("Purchase evidence confirmed")
            }
            // Display follows the server projection, never this response.
            await entitlementRefresher?.refreshEntitlement()
            return publish(response == .confirmed ? .confirmed : .pending)
        } catch let error as RevenueCatEntitlementTransportError {
            if error.isRetryable {
                Self.logger.notice("Purchase confirmation should be retried")
                return publish(.retry)
            }
            Self.logger.error("Purchase confirmation was rejected")
            return publish(.error)
        } catch {
            Self.logger.notice("Purchase confirmation should be retried")
            return publish(.retry)
        }
    }

    @discardableResult
    private func publish(_ phase: PurchaseConfirmationPhase) -> PurchaseConfirmationState {
        let newState = PurchaseConfirmationState(phase: phase)
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
