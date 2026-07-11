<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Social OAuth Providers (Google / GitHub / Apple)

Tracks enabling social sign-in in the deployed Supabase Auth instance
(issue #3187).

## Symptom

On https://finance.jrmoulckers.com, clicking **Continue with Google / GitHub /
Apple** on `/login` fails for all three providers with:

```
400 validation_failed — "Unsupported provider: provider is not enabled"
```

Passkey and email/password sign-in work; only the OAuth/social providers fail.

## Root cause

The error string `provider is not enabled` comes from **Supabase GoTrue's**
`/auth/v1/authorize` endpoint — not from our code. The external providers are
not enabled / not configured in the deployed Supabase Auth instance
(`GOTRUE_EXTERNAL_*_ENABLED` false/unset and/or missing client IDs, secrets, and
redirect URLs).

The application side is already complete:

- `services/api/supabase/functions/auth-oauth-start/index.ts` validates the
  provider **and** pre-flights whether it is enabled, returning a graceful `400`
  ("that option is unavailable") or `503` ("temporarily unavailable") instead of
  hard-redirecting the user onto GoTrue's raw JSON error page (#3188).
- `services/api/supabase/config.toml` now declares `[auth.external.google]`,
  `[auth.external.github]`, and `[auth.external.apple]` with their credentials
  wired to environment variables. They ship `enabled = false` so local
  `supabase start` works without OAuth apps.
- `services/api/.env.example` documents the required credential variables.

## Needs Human Action

Enabling the providers requires real OAuth credentials + Supabase config and
**cannot be done by an agent** (secrets are human-held). For each provider you
want to enable:

1. **Create the OAuth app** and obtain a client ID + secret:
   - **Google**: OAuth client ID + secret (Google Cloud Console).
   - **GitHub**: OAuth App client ID + secret.
   - **Apple**: Services ID + key/team config.
2. **Set the authorized redirect URL** to
   `${OAUTH_REDIRECT_BASE}/api/auth/oauth-callback`
   (e.g. `https://finance.jrmoulckers.com/api/auth/oauth-callback`).
3. **Provide the secrets** in the deployed Edge Function / Supabase Auth
   environment using the variable names in `.env.example`:
   - `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `…_GOOGLE_SECRET`
   - `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` / `…_GITHUB_SECRET`
   - `SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID` / `…_APPLE_SECRET`
   - and confirm `OAUTH_REDIRECT_BASE` is set for the deployment.
4. **Enable the provider**: set `enabled = true` for that provider in
   `services/api/supabase/config.toml` and apply the config (or toggle it in the
   Supabase dashboard).

Until a provider is enabled with valid credentials, `auth-oauth-start` returns a
graceful in-app error rather than a raw GoTrue page, so users are not dropped on
a broken JSON screen.

## Verification

After enablement, from `/login`:

- Each of Google / GitHub / Apple completes the OAuth round-trip and lands back
  on the app authenticated.
- No `provider is not enabled` responses from `/auth/v1/authorize`.

Related: #3188 (edge/frontend graceful degradation, already implemented),
#3109 ("Service temporarily unavailable" reports), #3085 (`OAUTH_REDIRECT_BASE`),
#3139 (GitHub OAuth into GoTrue).
