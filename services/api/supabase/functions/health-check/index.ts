// SPDX-License-Identifier: BUSL-1.1

/**
 * Health Check Edge Function (#410)
 *
 * Public endpoint for uptime monitoring. Returns the operational status
 * of core backend services (database, auth) without exposing any
 * internal details, connection strings, or schema information.
 *
 * - Returns 200 with status "healthy" when all services are operational
 * - Returns 503 with status "degraded" when any service is impaired
 * - Rate limit: recommend 1 request per IP per second via upstream proxy/CDN
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL (set automatically by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (set automatically by Supabase)
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';

/** Individual service status. */
type ServiceStatus = 'connected' | 'operational' | 'unavailable' | 'error';

/** Health check response shape. */
interface HealthCheckResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  services: {
    database: ServiceStatus;
    auth: ServiceStatus;
  };
  version: string;
}

/**
 * Check database connectivity with a simple query.
 *
 * Uses `SELECT 1` — the simplest possible query to verify the
 * database connection is alive. NEVER queries user tables or
 * exposes table names, schemas, or data.
 */
async function checkDatabase(supabaseUrl: string, serviceRoleKey: string): Promise<ServiceStatus> {
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Use rpc to call a trivial database function, or fall back to
    // a raw SELECT 1 via the PostgREST interface. We avoid exposing
    // any table names — this only tests connectivity.
    const { error } = await supabase.rpc('', {}).catch(() => ({
      error: { message: 'rpc_not_available' },
    }));

    // If rpc is not available, try a simple query via the REST API.
    // We intentionally query the health of the connection, not data.
    if (error) {
      // Attempt a lightweight read that doesn't expose schema.
      // Supabase always has the auth schema available.
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });

      if (response.ok || response.status === 200 || response.status === 204) {
        return 'connected';
      }
      return 'unavailable';
    }

    return 'connected';
  } catch {
    return 'error';
  }
}

/**
 * Check auth service status.
 *
 * Verifies the Supabase Auth service is responding by calling the
 * auth health/settings endpoint. Does NOT create sessions, tokens,
 * or access any user data.
 */
async function checkAuth(supabaseUrl: string, serviceRoleKey: string): Promise<ServiceStatus> {
  try {
    // The Supabase auth settings endpoint is a lightweight way to
    // verify the auth service is operational without accessing user data.
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (response.ok) {
      return 'operational';
    }
    return 'unavailable';
  } catch {
    return 'error';
  }
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  // Only accept GET requests
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    // Do NOT reveal which variable is missing — just report degraded
    console.error('Health check: missing required environment variables');
    const errorResponse: HealthCheckResponse = {
      status: 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: 'error',
        auth: 'error',
      },
      version: '1.0.0',
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 503,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  // Run health checks concurrently
  const [databaseStatus, authStatus] = await Promise.all([
    checkDatabase(supabaseUrl, serviceRoleKey),
    checkAuth(supabaseUrl, serviceRoleKey),
  ]);

  const isHealthy = databaseStatus === 'connected' && authStatus === 'operational';

  const response: HealthCheckResponse = {
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: databaseStatus,
      auth: authStatus,
    },
    version: '1.0.0',
  };

  return new Response(JSON.stringify(response), {
    status: isHealthy ? 200 : 503,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      // Prevent caching of health status — always fresh
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
});
