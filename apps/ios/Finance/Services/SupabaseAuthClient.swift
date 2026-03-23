// SPDX-License-Identifier: BUSL-1.1
// SupabaseAuthClient.swift - Finance - Refs #650
import Foundation; import os
enum SupabaseAuthError: LocalizedError, Sendable {
    case invalidURL, invalidResponse(statusCode: Int), decodingFailed(underlying: Error)
    case networkError(underlying: Error), missingConfiguration, tokenRefreshFailed, signOutFailed
    var errorDescription: String? {
        switch self {
        case .invalidURL: String(localized: "The authentication server URL is invalid.")
        case .invalidResponse(let s): String(localized: "Server returned unexpected response (status \(s)).")
        case .decodingFailed(let e): String(localized: "Failed to decode response: \(e.localizedDescription)")
        case .networkError(let e): String(localized: "Network error: \(e.localizedDescription)")
        case .missingConfiguration: String(localized: "Supabase configuration is missing.")
        case .tokenRefreshFailed: String(localized: "Failed to refresh authentication session.")
        case .signOutFailed: String(localized: "Failed to sign out from server.")
        }
    }
}
struct AuthSession: Codable, Sendable {
    let accessToken, refreshToken, tokenType: String; let expiresIn: Int; let user: AuthUserResponse
    enum CodingKeys: String, CodingKey { case accessToken = "access_token"; case refreshToken = "refresh_token"; case expiresIn = "expires_in"; case tokenType = "token_type"; case user }
}
struct AuthUserResponse: Codable, Sendable {
    let id: String; let email, createdAt: String?
    enum CodingKeys: String, CodingKey { case id, email; case createdAt = "created_at" }
}
protocol SupabaseAuthClientProtocol: Sendable {
    func signInWithApple(idToken: String, nonce: String?) async throws -> AuthSession
    func refreshToken(_ refreshToken: String) async throws -> AuthSession
    func signOut(accessToken: String) async throws
}
actor SupabaseAuthClient: SupabaseAuthClientProtocol {
    struct Configuration: Sendable { let baseURL, apiKey: String; static let placeholder = Configuration(baseURL: "YOUR_SUPABASE_URL", apiKey: "YOUR_SUPABASE_ANON_KEY") }
    private let configuration: Configuration; private let session: URLSession
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "SupabaseAuthClient")
    init(configuration: Configuration = .placeholder, session: URLSession = .shared) { self.configuration = configuration; self.session = session }
    func signInWithApple(idToken: String, nonce: String?) async throws -> AuthSession {
        let url = try buildURL(path: "/auth/v1/token", queryItems: [URLQueryItem(name: "grant_type", value: "id_token")])
        var body: [String: Any] = ["provider": "apple", "id_token": idToken]; if let nonce { body["nonce"] = nonce }
        return try await execute(try buildRequest(url: url, method: "POST", body: body))
    }
    func refreshToken(_ refreshToken: String) async throws -> AuthSession {
        let url = try buildURL(path: "/auth/v1/token", queryItems: [URLQueryItem(name: "grant_type", value: "refresh_token")])
        do { return try await execute(try buildRequest(url: url, method: "POST", body: ["refresh_token": refreshToken])) }
        catch { Self.logger.error("Token refresh failed: \(error.localizedDescription, privacy: .public)"); throw SupabaseAuthError.tokenRefreshFailed }
    }
    func signOut(accessToken: String) async throws {
        var r = try buildRequest(url: try buildURL(path: "/auth/v1/logout"), method: "POST", body: nil)
        r.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        do { let (_, resp) = try await session.data(for: r); guard let h = resp as? HTTPURLResponse else { throw SupabaseAuthError.signOutFailed }
            guard (200...204).contains(h.statusCode) else { throw SupabaseAuthError.invalidResponse(statusCode: h.statusCode) }
        } catch let e as SupabaseAuthError { throw e } catch { throw SupabaseAuthError.networkError(underlying: error) }
    }
    private func buildURL(path: String, queryItems: [URLQueryItem] = []) throws -> URL {
        guard var c = URLComponents(string: configuration.baseURL) else { throw SupabaseAuthError.invalidURL }
        c.path = path; if !queryItems.isEmpty { c.queryItems = queryItems }; guard let u = c.url else { throw SupabaseAuthError.invalidURL }; return u
    }
    private func buildRequest(url: URL, method: String, body: [String: Any]?) throws -> URLRequest {
        var r = URLRequest(url: url); r.httpMethod = method; r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue(configuration.apiKey, forHTTPHeaderField: "apikey"); r.timeoutInterval = 30
        if let body { r.httpBody = try JSONSerialization.data(withJSONObject: body) }; return r
    }
    private func execute(_ request: URLRequest) async throws -> AuthSession {
        let d: Data; let r: URLResponse
        do { (d, r) = try await session.data(for: request) } catch { throw SupabaseAuthError.networkError(underlying: error) }
        guard let h = r as? HTTPURLResponse else { throw SupabaseAuthError.invalidResponse(statusCode: -1) }
        guard (200...299).contains(h.statusCode) else { throw SupabaseAuthError.invalidResponse(statusCode: h.statusCode) }
        do { return try JSONDecoder().decode(AuthSession.self, from: d) } catch { throw SupabaseAuthError.decodingFailed(underlying: error) }
    }
}