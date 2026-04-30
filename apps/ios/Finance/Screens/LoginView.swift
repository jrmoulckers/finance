// SPDX-License-Identifier: BUSL-1.1
// LoginView.swift — Sign-in screen with Apple Sign In + email/password.
//
// Presents Apple Sign In as the primary option with email/password as
// an alternative. Stores all tokens in the Keychain via
// ``AuthenticationService``. Navigates to the main app on success.
//
// References: #650, #24

import AuthenticationServices
import os
import SwiftUI

// MARK: - LoginView

/// Authentication screen with Apple Sign In and email/password options.
///
/// Follows Apple HIG: Sign in with Apple button uses the system-provided
/// `SignInWithAppleButton` for visual consistency. Email/password is offered
/// as a secondary path below the Apple button.
struct LoginView: View {

    @Environment(AuthenticationService.self) private var authService
    @State private var showEmailForm = false
    @State private var email = ""
    @State private var password = ""
    @State private var isSignUp = false

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "LoginView"
    )

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    headerSection
                    appleSignInSection
                    dividerSection
                    emailSection
                    errorSection
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 40)
            }
            .navigationTitle(String(localized: "Welcome"))
            .navigationBarTitleDisplayMode(.large)
        }
    }

    // MARK: - Header

    @ViewBuilder
    private var headerSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "chart.line.uptrend.xyaxis.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(.blue)
                .accessibilityHidden(true)

            Text(String(localized: "Finance"))
                .font(.largeTitle)
                .fontWeight(.bold)
                .accessibilityAddTraits(.isHeader)

            Text(String(localized: "Sign in to sync your data across devices"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Apple Sign In

    @ViewBuilder
    private var appleSignInSection: some View {
        SignInWithAppleButton(.signIn) { request in
            request.requestedScopes = [.fullName, .email]
        } onCompletion: { _ in
            Task {
                await authService.signInWithApple()
            }
        }
        .signInWithAppleButtonStyle(.black)
        .frame(height: 50)
        .cornerRadius(12)
        .accessibilityLabel(String(localized: "Sign in with Apple"))
        .accessibilityHint(String(localized: "Uses your Apple ID to sign in securely"))
    }

    // MARK: - Divider

    @ViewBuilder
    private var dividerSection: some View {
        HStack {
            Rectangle()
                .frame(height: 1)
                .foregroundStyle(.quaternary)
            Text(String(localized: "or"))
                .font(.caption)
                .foregroundStyle(.secondary)
            Rectangle()
                .frame(height: 1)
                .foregroundStyle(.quaternary)
        }
    }

    // MARK: - Email/Password

    @ViewBuilder
    private var emailSection: some View {
        if showEmailForm {
            VStack(spacing: 16) {
                TextField(String(localized: "Email"), text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding()
                    .background(.quaternary)
                    .cornerRadius(10)
                    .accessibilityLabel(String(localized: "Email address"))

                SecureField(String(localized: "Password"), text: $password)
                    .textContentType(isSignUp ? .newPassword : .password)
                    .padding()
                    .background(.quaternary)
                    .cornerRadius(10)
                    .accessibilityLabel(String(localized: "Password"))

                Button {
                    Task {
                        if isSignUp {
                            await authService.signUpWithEmail(email: email, password: password)
                        } else {
                            await authService.signInWithEmail(email: email, password: password)
                        }
                    }
                } label: {
                    Group {
                        if authService.state == .loading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text(isSignUp
                                 ? String(localized: "Create Account")
                                 : String(localized: "Sign In"))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.blue)
                    .foregroundStyle(.white)
                    .cornerRadius(12)
                }
                .disabled(email.isEmpty || password.isEmpty || authService.state == .loading)
                .accessibilityLabel(isSignUp
                                    ? String(localized: "Create account with email")
                                    : String(localized: "Sign in with email"))

                Button {
                    withAnimation { isSignUp.toggle() }
                } label: {
                    Text(isSignUp
                         ? String(localized: "Already have an account? Sign In")
                         : String(localized: "Don't have an account? Sign Up"))
                        .font(.footnote)
                        .foregroundStyle(.blue)
                }
                .accessibilityLabel(isSignUp
                                    ? String(localized: "Switch to sign in")
                                    : String(localized: "Switch to sign up"))
            }
        } else {
            Button {
                withAnimation { showEmailForm = true }
            } label: {
                Text(String(localized: "Continue with Email"))
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.quaternary)
                    .cornerRadius(12)
            }
            .accessibilityLabel(String(localized: "Continue with email and password"))
        }
    }

    // MARK: - Error

    @ViewBuilder
    private var errorSection: some View {
        if let error = authService.authError {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            .padding()
            .background(.red.opacity(0.1))
            .cornerRadius(8)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "Authentication error: \(error)"))
        }
    }
}

#Preview {
    LoginView()
        .environment(AuthenticationService())
}
