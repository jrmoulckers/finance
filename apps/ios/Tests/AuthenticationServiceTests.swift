// SPDX-License-Identifier: BUSL-1.1
// AuthenticationServiceTests.swift - FinanceTests - Refs #650
import XCTest; @testable import FinanceApp
final class AuthenticationServiceTests: XCTestCase {
    @MainActor func testSignInStoresTokens() async {
        let kc = StubKeychainManager(); let sb = StubSupabaseAuthClient(); let asi = StubAppleSignInManager()
        asi.credentialToReturn = StubAppleCredential.default; sb.sessionToReturn = StubAuthSession.default
        let svc = AuthenticationService(appleSignInManager: asi, supabaseClient: sb, keychain: kc)
        await svc.signInWithApple()
        XCTAssertTrue(svc.isAuthenticated); XCTAssertEqual(svc.currentUser?.id, "user-123"); XCTAssertEqual(svc.currentUser?.email, "test@example.com")
        XCTAssertNil(svc.authError); XCTAssertNotNil(kc.store["com.finance.auth.accessToken"]); XCTAssertNotNil(kc.store["com.finance.auth.refreshToken"]) }
    @MainActor func testCancellationNoError() async {
        let asi = StubAppleSignInManager(); asi.errorToThrow = AppleSignInError.cancelled
        let svc = AuthenticationService(appleSignInManager: asi, supabaseClient: StubSupabaseAuthClient(), keychain: StubKeychainManager())
        await svc.signInWithApple(); XCTAssertFalse(svc.isAuthenticated); XCTAssertNil(svc.authError) }
    @MainActor func testSignInFailure() async {
        let asi = StubAppleSignInManager(); asi.errorToThrow = AppleSignInError.missingIdentityToken
        let svc = AuthenticationService(appleSignInManager: asi, supabaseClient: StubSupabaseAuthClient(), keychain: StubKeychainManager())
        await svc.signInWithApple(); XCTAssertFalse(svc.isAuthenticated); XCTAssertNotNil(svc.authError) }
    @MainActor func testSupabaseFailure() async {
        let asi = StubAppleSignInManager(); asi.credentialToReturn = StubAppleCredential.default
        let sb = StubSupabaseAuthClient(); sb.errorToThrow = SupabaseAuthError.invalidResponse(statusCode: 401)
        let svc = AuthenticationService(appleSignInManager: asi, supabaseClient: sb, keychain: StubKeychainManager())
        await svc.signInWithApple(); XCTAssertFalse(svc.isAuthenticated); XCTAssertNotNil(svc.authError) }
    @MainActor func testSignOutClearsAll() async {
        let kc = StubKeychainManager(); kc.store["com.finance.auth.accessToken"] = Data("a".utf8); kc.store["com.finance.auth.refreshToken"] = Data("r".utf8)
        kc.store["com.finance.auth.userId"] = Data("u".utf8); kc.store["com.finance.auth.userEmail"] = Data("e".utf8); kc.store["com.finance.auth.userName"] = Data("n".utf8)
        let asi = StubAppleSignInManager(); asi.credentialToReturn = StubAppleCredential.default
        let sb = StubSupabaseAuthClient(); sb.sessionToReturn = StubAuthSession.default
        let svc = AuthenticationService(appleSignInManager: asi, supabaseClient: sb, keychain: kc)
        await svc.signInWithApple(); await svc.signOut()
        XCTAssertFalse(svc.isAuthenticated); XCTAssertNil(svc.currentUser); XCTAssertNil(kc.store["com.finance.auth.accessToken"])
        XCTAssertNil(kc.store["com.finance.auth.userId"]); XCTAssertTrue(sb.signOutCalled) }
    @MainActor func testSignOutWhenServerFails() async {
        let kc = StubKeychainManager(); kc.store["com.finance.auth.accessToken"] = Data("a".utf8)
        let sb = StubSupabaseAuthClient(); sb.signOutError = SupabaseAuthError.networkError(underlying: NSError(domain: "t", code: -1))
        let asi = StubAppleSignInManager(); asi.credentialToReturn = StubAppleCredential.default; sb.sessionToReturn = StubAuthSession.default
        let svc = AuthenticationService(appleSignInManager: asi, supabaseClient: sb, keychain: kc)
        await svc.signInWithApple(); await svc.signOut()
        XCTAssertFalse(svc.isAuthenticated); XCTAssertNil(kc.store["com.finance.auth.accessToken"]) }
    @MainActor func testNoStoredTokens() async {
        let svc = AuthenticationService(appleSignInManager: StubAppleSignInManager(), supabaseClient: StubSupabaseAuthClient(), keychain: StubKeychainManager())
        await svc.checkExistingSession(); XCTAssertFalse(svc.isAuthenticated) }
    @MainActor func testRefreshUpdatesTokens() async {
        let kc = StubKeychainManager(); kc.store["com.finance.auth.refreshToken"] = Data("old".utf8)
        let sb = StubSupabaseAuthClient(); sb.refreshSessionToReturn = AuthSession(accessToken: "new-at", refreshToken: "new-rt", expiresIn: 3600, tokenType: "bearer", user: AuthUserResponse(id: "u1", email: "e@e.com", createdAt: nil))
        let svc = AuthenticationService(appleSignInManager: StubAppleSignInManager(), supabaseClient: sb, keychain: kc)
        await svc.refreshSession()
        XCTAssertEqual(kc.store["com.finance.auth.accessToken"].flatMap { String(data: $0, encoding: .utf8) }, "new-at") }
    @MainActor func testRefreshFailureSignsOut() async {
        let kc = StubKeychainManager(); kc.store["com.finance.auth.refreshToken"] = Data("old".utf8); kc.store["com.finance.auth.userId"] = Data("u".utf8)
        let sb = StubSupabaseAuthClient(); sb.refreshError = SupabaseAuthError.tokenRefreshFailed
        let svc = AuthenticationService(appleSignInManager: StubAppleSignInManager(), supabaseClient: sb, keychain: kc)
        await svc.refreshSession(); XCTAssertFalse(svc.isAuthenticated); XCTAssertNil(kc.store["com.finance.auth.refreshToken"]) }
}
final class StubKeychainManager: KeychainManaging, @unchecked Sendable {
    var store: [String: Data] = [:]; var errorToThrow: KeychainError?
    func save(key: String, data: Data) throws { if let e = errorToThrow { throw e }; store[key] = data }
    func load(key: String) -> Data? { store[key] }
    func delete(key: String) throws { if let e = errorToThrow { throw e }; store.removeValue(forKey: key) }
}
final class StubAppleSignInManager: AppleSignInManaging, @unchecked Sendable {
    var credentialToReturn: AppleSignInCredential?; var errorToThrow: AppleSignInError?
    func signIn() async throws -> AppleSignInCredential { if let e = errorToThrow { throw e }; guard let c = credentialToReturn else { throw AppleSignInError.missingIdentityToken }; return c }
}
final class StubSupabaseAuthClient: SupabaseAuthClientProtocol, @unchecked Sendable {
    var sessionToReturn: AuthSession?; var refreshSessionToReturn: AuthSession?; var errorToThrow: SupabaseAuthError?; var refreshError: SupabaseAuthError?; var signOutError: SupabaseAuthError?; var signOutCalled = false
    func signInWithApple(idToken: String, nonce: String?) async throws -> AuthSession { if let e = errorToThrow { throw e }; guard let s = sessionToReturn else { throw SupabaseAuthError.invalidResponse(statusCode: 500) }; return s }
    func refreshToken(_ refreshToken: String) async throws -> AuthSession { if let e = refreshError { throw e }; guard let s = refreshSessionToReturn ?? sessionToReturn else { throw SupabaseAuthError.tokenRefreshFailed }; return s }
    func signOut(accessToken: String) async throws { signOutCalled = true; if let e = signOutError { throw e } }
}
enum StubAppleCredential { static let `default` = AppleSignInCredential(userID: "apple-user-001", fullName: { var c = PersonNameComponents(); c.givenName = "Test"; c.familyName = "User"; return c }(), email: "test@example.com", identityToken: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.sig", authorizationCode: "auth-code-123", nonce: "test-nonce") }
enum StubAuthSession { static let `default` = AuthSession(accessToken: "sb-at-123", refreshToken: "sb-rt-456", expiresIn: 3600, tokenType: "bearer", user: AuthUserResponse(id: "user-123", email: "test@example.com", createdAt: "2024-01-01T00:00:00Z")) }