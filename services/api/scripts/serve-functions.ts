// SPDX-License-Identifier: BUSL-1.1

/**
 * Local Deno dev runner for the auth Edge Functions (#1886).
 *
 * The Supabase CLI's `supabase functions serve` command requires Docker
 * Desktop on Windows because it spins up the full local stack (Postgres,
 * GoTrue, Kong, edge-runtime). For the alpha smoke test we only need
 * the auth-* Edge Functions running locally against Supabase Cloud as
 * the identity provider — no local DB, no Kong, no edge-runtime
 * container needed.
 *
 * This script imports each function's exported `handler` directly and
 * mounts them on a single Deno HTTP server at the same URL shape Kong
 * would use in production (`/functions/v1/<name>`), so the Vite dev
 * proxy in `apps/web/vite.config.ts` works unchanged.
 *
 * Usage (from `services/api`):
 *
 *   deno run --allow-net --allow-env --allow-read \
 *     --env-file=.env scripts/serve-functions.ts
 *
 * The script reads `services/api/.env` (or whatever `--env-file` points
 * at) so every function sees the same env vars it would in production.
 *
 * Routes mounted (all under `/functions/v1/`):
 *   - POST /auth-login
 *   - POST /auth-signup
 *   - POST /auth-refresh
 *   - POST /auth-logout
 *   - POST /auth-request-password-reset
 *   - POST /auth-reset-password
 *   - GET  /auth-oauth-start
 *   - GET  /auth-oauth-callback
 *   - POST /passkey-register
 *   - POST /passkey-authenticate
 */

import { handler as authLogin } from '../supabase/functions/auth-login/index.ts';
import { handler as authSignup } from '../supabase/functions/auth-signup/index.ts';
import { handler as authRefresh } from '../supabase/functions/auth-refresh/index.ts';
import { handler as authLogout } from '../supabase/functions/auth-logout/index.ts';
import { handler as authRequestPasswordReset } from '../supabase/functions/auth-request-password-reset/index.ts';
import { handler as authResetPassword } from '../supabase/functions/auth-reset-password/index.ts';
import { handler as authOAuthStart } from '../supabase/functions/auth-oauth-start/index.ts';
import { handler as authOAuthCallback } from '../supabase/functions/auth-oauth-callback/index.ts';
import { handler as accountDeleteHandler } from '../supabase/functions/account-delete/index.ts';
import { handler as passkeyRegister } from '../supabase/functions/passkey-register/index.ts';
import { handler as passkeyAuthenticate } from '../supabase/functions/passkey-authenticate/index.ts';

type Handler = (req: Request) => Promise<Response>;

const FUNCTION_PREFIX = '/functions/v1/';

const routes: Record<string, Handler> = {
  'auth-login': authLogin,
  'auth-signup': authSignup,
  'auth-refresh': authRefresh,
  'auth-logout': authLogout,
  'auth-request-password-reset': authRequestPasswordReset,
  'auth-reset-password': authResetPassword,
  'auth-oauth-start': authOAuthStart,
  'auth-oauth-callback': authOAuthCallback,
  'account-delete': accountDeleteHandler,
  'passkey-register': passkeyRegister,
  'passkey-authenticate': passkeyAuthenticate,
};

async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const start = Date.now();
  const res = await dispatchInner(req, url);
  const ms = Date.now() - start;
  console.log(`[req] ${req.method} ${url.pathname}${url.search} -> ${res.status} (${ms}ms)`);
  return res;
}

function dispatchInner(req: Request, url: URL): Promise<Response> {
  if (url.pathname === '/' || url.pathname === '/health') {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          status: 'ok',
          functions: Object.keys(routes),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  if (!url.pathname.startsWith(FUNCTION_PREFIX)) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  const name = url.pathname.slice(FUNCTION_PREFIX.length).split('/')[0];
  const handler = routes[name];
  if (!handler) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          error: 'Function not found',
          function: name,
          available: Object.keys(routes),
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  // The Edge Function handlers parse the URL themselves; we keep the
  // pathname stable (matching the production Kong shape) so functions
  // see the same `req.url` they would in Supabase Cloud.
  return handler(req);
}

const PORT = Number(Deno.env.get('FUNCTIONS_PORT') ?? 54321);

console.log(`[serve-functions] listening on http://localhost:${PORT}`);
console.log(`[serve-functions] mounted at /functions/v1/<name>:`);
for (const name of Object.keys(routes)) {
  console.log(`  - ${name}`);
}

Deno.serve({ port: PORT, hostname: '127.0.0.1' }, dispatch);
