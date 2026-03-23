// SPDX-License-Identifier: BUSL-1.1
// AuthenticationService.swift - Finance - Refs #650
import AuthenticationServices; import Foundation; import Observation; import os
struct AuthUser: Sendable, Equatable { let id: String; let email: String?; let name: String? }
enum AuthenticationState: Sendable, Equatable { case unauthenticated, loading, authenticated, error(String) }
private enum AuthKeychainKeys { static let accessToken = "com.finance.auth.accessToken"; static let refreshToken = "com.finance.auth.refreshToken"
    static let userId = "com.finance.auth.userId"; static let userEmail = "com.finance.auth.userEmail"; static let userName = "com.finance.auth.userName" }
@Observable @MainActor final class AuthenticationService {
    private(set) var state: AuthenticationState = .loading; private(set) var currentUser: AuthUser?; private(set) var authError: String?
    var isAuthenticated: Bool { if case .authenticated = state { return true }; return false }
    private let appleSignInManager: AppleSignInManaging; private let supabaseClient: SupabaseAuthClientProtocol; private let keychain: KeychainManaging
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "AuthenticationService")
    init(appleSignInManager: AppleSignInManaging? = nil, supabaseClient: SupabaseAuthClientProtocol? = nil, keychain: KeychainManaging? = nil) {
        self.appleSignInManager = appleSignInManager ?? AppleSignInManager(); self.supabaseClient = supabaseClient ?? SupabaseAuthClient(); self.keychain = keychain ?? KeychainManager.shared }
    func signInWithApple() async {
        state = .loading; authError = nil
        do { let cred = try await appleSignInManager.signIn()
            Self.logger.info("Apple Sign-In succeeded for user \(cred.userID, privacy: .private(mask: .hash))")
            let sess = try await supabaseClient.signInWithApple(idToken: cred.identityToken, nonce: cred.nonce)
            try storeSession(sess, credential: cred)
            let name = formatDisplayName(cred.fullName)
            currentUser = AuthUser(id: sess.user.id, email: cred.email ?? sess.user.email, name: name); state = .authenticated
        } catch let e as AppleSignInError where e.isCancellation { state = .unauthenticated
        } catch { authError = error.localizedDescription; state = .error(error.localizedDescription) } }
    func signOut() async {
        if let d = keychain.load(key: AuthKeychainKeys.accessToken), let t = String(data: d, encoding: .utf8) {
            do { try await supabaseClient.signOut(accessToken: t) } catch { Self.logger.warning("Server sign-out failed: \(error.localizedDescription, privacy: .public)") } }
        clearKeychainTokens(); currentUser = nil; authError = nil; state = .unauthenticated }
    func checkExistingSession() async {
        state = .loading
        guard let ud = keychain.load(key: AuthKeychainKeys.userId), let uid = String(data: ud, encoding: .utf8) else { state = .unauthenticated; return }
        guard await checkCredentialState(userID: uid) else { await signOut(); return }
        if let rd = keychain.load(key: AuthKeychainKeys.refreshToken), let rt = String(data: rd, encoding: .utf8) { await refreshSession(with: rt) }
        else { let e = keychain.load(key: AuthKeychainKeys.userEmail).flatMap { String(data: $0, encoding: .utf8) }
            let n = keychain.load(key: AuthKeychainKeys.userName).flatMap { String(data: $0, encoding: .utf8) }
            currentUser = AuthUser(id: uid, email: e, name: n); state = .authenticated } }
    func refreshSession() async {
        guard let d = keychain.load(key: AuthKeychainKeys.refreshToken), let rt = String(data: d, encoding: .utf8) else { return }
        await refreshSession(with: rt) }
    func checkCredentialState(userID: String) async -> Bool {
        do { let s = try await ASAuthorizationAppleIDProvider().credentialState(forUserID: userID)
            switch s { case .authorized: return true; case .revoked, .notFound, .transferred: return false; @unknown default: return false }
        } catch { return true } }
    private func refreshSession(with rt: String) async {
        do { let s = try await supabaseClient.refreshToken(rt); try storeTokens(accessToken: s.accessToken, refreshToken: s.refreshToken)
            let e = keychain.load(key: AuthKeychainKeys.userEmail).flatMap { String(data: $0, encoding: .utf8) }
            let n = keychain.load(key: AuthKeychainKeys.userName).flatMap { String(data: $0, encoding: .utf8) }
            currentUser = AuthUser(id: s.user.id, email: s.user.email ?? e, name: n); state = .authenticated
        } catch { await signOut() } }
    private func storeSession(_ s: AuthSession, credential: AppleSignInCredential) throws {
        try storeTokens(accessToken: s.accessToken, refreshToken: s.refreshToken)
        if let d = s.user.id.data(using: .utf8) { try keychain.save(key: AuthKeychainKeys.userId, data: d) }
        if let em = credential.email ?? s.user.email, let d = em.data(using: .utf8) { try keychain.save(key: AuthKeychainKeys.userEmail, data: d) }
        if let nm = formatDisplayName(credential.fullName), let d = nm.data(using: .utf8) { try keychain.save(key: AuthKeychainKeys.userName, data: d) } }
    private func storeTokens(accessToken: String, refreshToken: String) throws {
        if let d = accessToken.data(using: .utf8) { try keychain.save(key: AuthKeychainKeys.accessToken, data: d) }
        if let d = refreshToken.data(using: .utf8) { try keychain.save(key: AuthKeychainKeys.refreshToken, data: d) } }
    private func clearKeychainTokens() { for k in [AuthKeychainKeys.accessToken, .refreshToken, .userId, .userEmail, .userName] { try? keychain.delete(key: k) } }
    private func formatDisplayName(_ c: PersonNameComponents?) -> String? { guard let c else { return nil }; let f = PersonNameComponentsFormatter(); f.style = .default; let n = f.string(from: c); return n.isEmpty ? nil : n }
}
extension AppleSignInError { var isCancellation: Bool { if case .cancelled = self { return true }; return false } }