# OAuth Provider Setup Guide

> **Issue:** #1241
> **Branch:** `feat/oauth-scaffolding-1241`

This document describes how to configure Google Sign-In and Apple Sign-In
for the Finance app across all platforms, using **Supabase Auth** as the
identity broker.

## Architecture

```
┌────────────┐        ┌──────────────┐        ┌─────────────────┐
│  Client App │──────▶│ Supabase Auth │──────▶│  OAuth Provider  │
│ (Web/iOS/   │ PKCE  │   (broker)    │ AuthZ  │ (Google / Apple) │
│  Android/   │◀──────│               │◀──────│                  │
│  Windows)   │ Token │               │ Code   │                  │
└────────────┘        └──────────────┘        └─────────────────┘
```

All OAuth flows are handled by Supabase Auth using PKCE. The client apps
never see or handle authorization codes directly — they call
`supabase.auth.signInWithOAuth()` and receive a session on redirect.

## Required Environment Variables

### Web App (`.env.local`)

| Variable                | Description                                 | Where to Get It                    |
| ----------------------- | ------------------------------------------- | ---------------------------------- |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID                  | Google Cloud Console → Credentials |
| `VITE_APPLE_CLIENT_ID`  | Apple Services ID (for web Sign in w/Apple) | Apple Developer → Identifiers      |

### Supabase Dashboard (Auth → Providers)

| Setting                          | Description                              |
| -------------------------------- | ---------------------------------------- |
| `SUPABASE_AUTH_GOOGLE_CLIENT_ID` | Same as `VITE_GOOGLE_CLIENT_ID`          |
| `SUPABASE_AUTH_GOOGLE_SECRET`    | Google OAuth 2.0 Client Secret           |
| `SUPABASE_AUTH_APPLE_CLIENT_ID`  | Apple Services ID                        |
| `SUPABASE_AUTH_APPLE_SECRET`     | Apple client secret (generated from key) |

### GitHub Actions Secrets (for CI)

| Secret                           | Description                            |
| -------------------------------- | -------------------------------------- |
| `SUPABASE_AUTH_GOOGLE_CLIENT_ID` | Google Client ID (for E2E test config) |
| `SUPABASE_AUTH_GOOGLE_SECRET`    | Google Client Secret                   |
| `SUPABASE_AUTH_APPLE_CLIENT_ID`  | Apple Services ID                      |
| `SUPABASE_AUTH_APPLE_SECRET`     | Apple Client Secret (JWT)              |

## Step-by-Step: Google Sign-In

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `Finance App`
5. Add **Authorized redirect URIs**:
   - `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
   - `https://<your-production-domain>/auth/callback`
   - `http://localhost:5173/auth/callback` (development)
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

### 2. Configure Supabase

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Authentication → Providers → Google**
3. Toggle **Enable Google provider**
4. Paste the **Client ID** and **Client Secret**
5. Save

### 3. Configure Redirect URLs in Supabase

1. Go to **Authentication → URL Configuration**
2. Add these to **Redirect URLs**:
   - `https://<your-production-domain>/auth/callback`
   - `http://localhost:5173/auth/callback`
   - `com.finance.android://auth/callback`
   - `com.finance.ios://auth/callback`
   - `finance://auth/callback`

## Step-by-Step: Apple Sign-In

### 1. Register an App ID

1. Go to [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers)
2. Click **+** → **App IDs** → Continue
3. Description: `Finance App`
4. Bundle ID: `com.finance.ios` (explicit)
5. Enable **Sign in with Apple** capability
6. Continue → Register

### 2. Create a Services ID (for web)

1. Go to **Identifiers** → **+** → **Services IDs**
2. Description: `Finance Web`
3. Identifier: `com.finance.web` (this becomes your `APPLE_CLIENT_ID`)
4. Enable **Sign in with Apple**
5. Click **Configure**:
   - **Primary App ID**: Select the App ID from step 1
   - **Domains**: `<your-production-domain>`, `<your-supabase-ref>.supabase.co`
   - **Return URLs**: `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
6. Save

### 3. Generate the Client Secret

Apple's client secret is a JWT signed with a private key:

1. Go to **Keys** → **+**
2. Name: `Finance Sign In`
3. Enable **Sign in with Apple** → Configure → Select Primary App ID
4. Continue → Register → **Download** the `.p8` key file
5. Note the **Key ID** (displayed after registration)
6. Generate the JWT using your Team ID, Key ID, and the `.p8` key
   - Supabase can auto-generate this if you provide the key file in the Dashboard
   - Or use a tool like [apple-signin-auth](https://github.com/nicklockwood/SwiftFormat) to generate it

### 4. Configure Supabase

1. Go to **Authentication → Providers → Apple**
2. Toggle **Enable Apple provider**
3. Paste the **Services ID** as Client ID
4. Paste the generated **Client Secret** (JWT)
5. Save

## Platform-Specific Redirect URIs

| Platform | Redirect URI                                 | Configuration Location                       |
| -------- | -------------------------------------------- | -------------------------------------------- |
| Web      | `https://<domain>/auth/callback`             | Vite router + provider console               |
| Web Dev  | `http://localhost:5173/auth/callback`        | Provider console (dev only)                  |
| Supabase | `https://<ref>.supabase.co/auth/v1/callback` | Auto-configured by Supabase                  |
| Android  | `com.finance.android://auth/callback`        | `AndroidManifest.xml` intent filter          |
| iOS      | `com.finance.ios://auth/callback`            | Associated Domains + `Info.plist` URL scheme |
| Windows  | `finance://auth/callback`                    | `AppxManifest.xml` protocol handler (exists) |

## Verification Checklist

After completing the setup, verify:

- [ ] Google Sign-In works on web (dev + production)
- [ ] Apple Sign-In works on web (production only — Apple requires HTTPS)
- [ ] Redirect URIs are registered in both provider consoles AND Supabase
- [ ] User profile data (name, email, avatar) is populated after first sign-in
- [ ] Tokens are managed by Supabase Auth — no raw tokens in client state
- [ ] `.env.local` is in `.gitignore` (never committed)
- [ ] GitHub Actions secrets are configured for CI/CD

## Files Added in This Scaffolding

| File                                      | Purpose                                      |
| ----------------------------------------- | -------------------------------------------- |
| `apps/web/src/lib/auth/oauth-config.ts`   | Provider type definitions and configurations |
| `apps/web/src/lib/auth/auth-providers.ts` | Sign-in option builders per provider         |
| `docs/auth/oauth-setup.md`                | This setup guide                             |
