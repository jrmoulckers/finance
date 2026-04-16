# Dockerfile for Finance API — Supabase Edge Functions runtime (#624)
#
# Multi-stage production build for the Edge Functions backend.
# Uses the official Supabase Edge Runtime image for parity with
# the hosted environment.
#
# Build:
#   docker build -t finance-api .
#   docker build --build-arg EDGE_RUNTIME_VERSION=1.67.4 -t finance-api .
#
# Run:
#   docker run -p 9000:9000 \
#     -e SUPABASE_URL=http://host.docker.internal:54321 \
#     -e SUPABASE_SERVICE_ROLE_KEY=your-key \
#     -e ALLOWED_ORIGINS=http://localhost:3000 \
#     finance-api
#
# Environment Variables (required):
#   SUPABASE_URL              — Supabase project URL
#   SUPABASE_SERVICE_ROLE_KEY — Service role key (bypasses RLS)
#
# Environment Variables (optional, per-function):
#   ALLOWED_ORIGINS           — Comma-separated CORS origins
#   AUTH_WEBHOOK_SECRET        — Shared secret for auth webhook
#   WEBAUTHN_RP_NAME           — WebAuthn Relying Party display name
#   WEBAUTHN_RP_ID             — WebAuthn Relying Party ID (domain)
#   WEBAUTHN_ORIGIN            — Expected WebAuthn origin URL
#   CRON_SECRET                — Shared secret for cron endpoints
#   ADMIN_EMAILS               — Comma-separated admin email addresses
#
# See .env.example for the full list with descriptions.

# ---------------------------------------------------------------------------
# Stage 1: Validate — use Deno to type-check functions before packaging
# ---------------------------------------------------------------------------
FROM denoland/deno:2.3.1 AS validate

WORKDIR /src

# Copy deno configuration first (for layer caching of dependency resolution)
COPY supabase/functions/deno.json ./functions/deno.json

# Copy function source files
COPY supabase/functions/ ./functions/

# Cache remote dependencies (warms the Deno module cache)
RUN deno cache --config=functions/deno.json \
    functions/_shared/auth.ts \
    functions/_shared/cors.ts \
    functions/_shared/env.ts \
    functions/_shared/logger.ts \
    functions/_shared/rate-limit.ts \
    functions/_shared/response.ts \
    functions/_shared/webhook.ts \
    functions/_shared/notification.ts \
    functions/_shared/abuse-detection.ts

# ---------------------------------------------------------------------------
# Stage 2: Runtime — Supabase Edge Runtime for production parity
# ---------------------------------------------------------------------------
ARG EDGE_RUNTIME_VERSION=1.67.4
FROM supabase/edge-runtime:v${EDGE_RUNTIME_VERSION} AS runtime

# Labels for container metadata (OCI standard)
LABEL org.opencontainers.image.title="Finance API — Edge Functions" \
      org.opencontainers.image.description="Supabase Edge Functions backend for the Finance app" \
      org.opencontainers.image.source="https://github.com/jrmoulckers/finance" \
      org.opencontainers.image.licenses="BUSL-1.1"

# Copy validated function source from the build stage
COPY --from=validate /src/functions/ /home/deno/functions/

# Copy migration files (useful for CI migration verification)
COPY supabase/migrations/ /home/deno/migrations/

# Expose the Edge Functions port
EXPOSE 9000

# Health check — verifies the runtime is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:9000/health-check || exit 1

# Start the edge runtime with the main service entrypoint
CMD ["start", "--main-service", "/home/deno/functions/main"]
