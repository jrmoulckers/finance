// SPDX-License-Identifier: BUSL-1.1

/**
 * Edge Functions - Main Service Entry Point (`--main-service`).
 *
 * supabase/edge-runtime boots this module as the main worker, and it is the
 * router for EVERY request: it derives the target function from the request
 * path, spawns (or reuses) a per-function user worker via
 * `EdgeRuntime.userWorkers.create`, and forwards the request to it. Without
 * this dispatch the runtime answers 404 for every function path, which is why
 * signup/login/account endpoints were unreachable (#3081).
 *
 * Path handling (see deploy/Caddyfile):
 *   /                       -> runtime liveness  ({ status: 'ok' })
 *   /health-check           -> runtime liveness  ({ status: 'ok' })  (Caddy /health)
 *   /_internal/health       -> runtime liveness  ({ message: 'ok' })
 *   /functions/v1/<fn>/...  -> user worker <fn>   (/api/* facade rewrite, prefix kept)
 *   /<fn>/...               -> user worker <fn>   (/functions/v1/* route, prefix stripped)
 *
 * Functions are mounted read-only at /home/deno/functions/<fn>
 * (deploy/docker-compose.yml). Each function calls `Deno.serve(handler)` when
 * run as a worker entry point (`if (import.meta.main)`), so the worker serves
 * it directly. The main worker's env is forwarded to every function so they
 * can read SUPABASE_URL / SUPABASE_ANON_KEY / JWT_SECRET etc.
 *
 * Issues: #1246 (stub introduced), #3081 (dispatch restored)
 */

/** Minimal shape of the edge-runtime user-worker API used here (v1.67.4). */
declare const EdgeRuntime: {
  userWorkers: {
    create(options: {
      servicePath: string;
      memoryLimitMb?: number;
      workerTimeoutMs?: number;
      noModuleCache?: boolean;
      importMapPath?: string | null;
      envVars?: string[][];
    }): Promise<{ fetch(request: Request): Promise<Response> }>;
  };
};

const FUNCTIONS_ROOT = '/home/deno/functions';
const FUNCTIONS_PREFIX = '/functions/v1';
const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Resolve the function name from a request path, tolerating both the
 * `/functions/v1/<fn>` facade form and the prefix-stripped `/<fn>` form.
 * Returns null when no function segment is present (e.g. `/`).
 */
function resolveFunctionName(pathname: string): string | null {
  const path = pathname.startsWith(`${FUNCTIONS_PREFIX}/`)
    ? pathname.slice(FUNCTIONS_PREFIX.length)
    : pathname;
  const segment = path.split('/')[1];
  return segment && segment.length > 0 ? segment : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const { pathname } = new URL(req.url);

  // Liveness probes are kept dependency-free so /health never blocks on a
  // function cold start.
  if (pathname === '/' || pathname === '/health-check') {
    return json({ status: 'ok' }, 200);
  }
  if (pathname === '/_internal/health') {
    return json({ message: 'ok' }, 200);
  }

  const serviceName = resolveFunctionName(pathname);
  if (!serviceName) {
    return json({ error: 'Not found' }, 404);
  }

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `${FUNCTIONS_ROOT}/${serviceName}`,
      memoryLimitMb: 256,
      workerTimeoutMs: 5 * 60 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject()),
    });
    return await worker.fetch(req);
  } catch (err) {
    console.error(`main: dispatch failed for "${serviceName}":`, err);
    const message = err instanceof Error ? err.message : String(err);
    // A missing function directory surfaces as a filesystem error; treat that
    // as 404, and any other worker failure as a 502 from the function layer.
    const missing = /not found|no such file|os error 2/i.test(message);
    return json(
      { error: missing ? 'Not found' : 'Function invocation failed' },
      missing ? 404 : 502,
    );
  }
});
